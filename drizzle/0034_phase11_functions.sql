-- Phase 11 service-role functions and automatic ingestion queueing.
CREATE OR REPLACE FUNCTION public.match_ai_documents(
  p_query_embedding extensions.vector(1536), p_locale text, p_threshold real DEFAULT 0.55, p_limit integer DEFAULT 8
) RETURNS TABLE(id uuid,source_type text,source_id uuid,title text,content text,source_url text,metadata jsonb,similarity real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT d.id,d.source_type,d.source_id,d.title,d.content,d.source_url,d.metadata,
         (1-(d.embedding<=>p_query_embedding))::real
  FROM public.ai_documents d
  WHERE d.locale_code=p_locale AND d.deleted_at IS NULL AND d.embedding IS NOT NULL
    AND 1-(d.embedding<=>p_query_embedding)>=p_threshold
  ORDER BY d.embedding<=>p_query_embedding
  LIMIT least(greatest(p_limit,1),20)
$$;
REVOKE ALL ON FUNCTION public.match_ai_documents(extensions.vector,text,real,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.match_ai_documents(extensions.vector,text,real,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_ai_jobs(p_worker_id text,p_limit integer DEFAULT 10,p_lease_seconds integer DEFAULT 90)
RETURNS SETOF public.ai_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT id FROM public.ai_jobs
    WHERE deleted_at IS NULL AND run_at<=statement_timestamp()
      AND (status IN ('pending','retrying') OR (status='processing' AND locked_until<statement_timestamp()))
    ORDER BY priority DESC,run_at,created_at FOR UPDATE SKIP LOCKED LIMIT least(greatest(p_limit,1),50)
  )
  UPDATE public.ai_jobs j SET status='processing',locked_by=p_worker_id,
    locked_until=statement_timestamp()+make_interval(secs=>least(greatest(p_lease_seconds,15),600)),attempts=j.attempts+1
  FROM candidates c WHERE j.id=c.id RETURNING j.*;
END $$;
REVOKE ALL ON FUNCTION public.claim_ai_jobs(text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_jobs(text,integer,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_ai_job(p_job_id uuid,p_worker_id text,p_success boolean,p_result jsonb DEFAULT '{}'::jsonb,p_error text DEFAULT NULL)
RETURNS public.ai_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target public.ai_jobs; delay_seconds integer;
BEGIN
  SELECT * INTO target FROM public.ai_jobs WHERE id=p_job_id FOR UPDATE;
  IF target.id IS NULL OR target.locked_by IS DISTINCT FROM p_worker_id THEN RAISE EXCEPTION 'ai_job_lease_invalid'; END IF;
  IF p_success THEN
    UPDATE public.ai_jobs SET status='completed',result=coalesce(p_result,'{}'::jsonb),completed_at=statement_timestamp(),locked_by=NULL,locked_until=NULL WHERE id=p_job_id RETURNING * INTO target;
  ELSIF target.attempts>=target.max_attempts THEN
    UPDATE public.ai_jobs SET status='dead_letter',last_error=left(coalesce(p_error,'unknown'),1000),locked_by=NULL,locked_until=NULL WHERE id=p_job_id RETURNING * INTO target;
  ELSE
    delay_seconds:=least(3600,15*(2^greatest(target.attempts-1,0)));
    UPDATE public.ai_jobs SET status='retrying',last_error=left(coalesce(p_error,'unknown'),1000),run_at=statement_timestamp()+make_interval(secs=>delay_seconds),locked_by=NULL,locked_until=NULL WHERE id=p_job_id RETURNING * INTO target;
  END IF;
  RETURN target;
END $$;
REVOKE ALL ON FUNCTION public.complete_ai_job(uuid,text,boolean,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_ai_job(uuid,text,boolean,jsonb,text) TO service_role;

CREATE OR REPLACE FUNCTION private.queue_ai_document_refresh() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE source_kind text; source_uuid uuid; hash text;
BEGIN
  source_kind:=TG_ARGV[0]; source_uuid:=coalesce(NEW.id,OLD.id);
  hash:=encode(extensions.digest(coalesce(NEW::text,OLD::text),'sha256'),'hex');
  INSERT INTO public.ai_jobs(kind,aggregate_type,aggregate_id,payload,idempotency_key)
  VALUES('embedding.refresh',source_kind,source_uuid,jsonb_build_object('sourceType',source_kind,'sourceId',source_uuid),source_kind||':'||source_uuid||':'||hash)
  ON CONFLICT DO NOTHING;
  RETURN coalesce(NEW,OLD);
END $$;
CREATE TRIGGER knowledge_articles_ai_refresh AFTER INSERT OR UPDATE OF title,excerpt,body,status,deleted_at ON public.knowledge_articles FOR EACH ROW EXECUTE FUNCTION private.queue_ai_document_refresh('knowledge_article');
CREATE TRIGGER knowledge_faqs_ai_refresh AFTER INSERT OR UPDATE OF question,answer,active,deleted_at ON public.knowledge_faqs FOR EACH ROW EXECUTE FUNCTION private.queue_ai_document_refresh('faq');
CREATE TRIGGER products_ai_refresh AFTER INSERT OR UPDATE OF name,short_description,description,status,deleted_at ON public.products FOR EACH ROW EXECUTE FUNCTION private.queue_ai_document_refresh('product');

CREATE OR REPLACE FUNCTION private.queue_ai_risk() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_TABLE_NAME='orders' AND NEW.profile_id IS NOT NULL AND NEW.status IN ('awaiting_payment','paid') THEN
    INSERT INTO public.ai_jobs(kind,aggregate_type,aggregate_id,payload,priority,idempotency_key)
    VALUES('risk.score','order',NEW.id,jsonb_build_object('subjectType','order','subjectId',NEW.id),200,'order:'||NEW.id||':'||NEW.status) ON CONFLICT DO NOTHING;
  ELSIF TG_TABLE_NAME='payments' AND NEW.status IN ('awaiting_proof','under_review','paid') THEN
    INSERT INTO public.ai_jobs(kind,aggregate_type,aggregate_id,payload,priority,idempotency_key)
    VALUES('risk.score','topup',NEW.id,jsonb_build_object('subjectType','topup','subjectId',NEW.id),220,'topup:'||NEW.id||':'||NEW.status) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER orders_ai_risk AFTER INSERT OR UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION private.queue_ai_risk();
CREATE TRIGGER payments_ai_risk AFTER INSERT OR UPDATE OF status ON public.payments FOR EACH ROW EXECUTE FUNCTION private.queue_ai_risk();

INSERT INTO public.ai_jobs(kind,aggregate_type,payload,priority,idempotency_key)
VALUES ('recommendations.refresh','catalog','{}',50,'initial'),('insights.detect','analytics','{}',25,'initial') ON CONFLICT DO NOTHING;

INSERT INTO public.ai_jobs(kind,aggregate_type,aggregate_id,payload,priority,idempotency_key)
SELECT 'embedding.refresh','knowledge_article',id,jsonb_build_object('sourceType','knowledge_article','sourceId',id),100,'initial:article:'||id FROM public.knowledge_articles
UNION ALL SELECT 'embedding.refresh','faq',id,jsonb_build_object('sourceType','faq','sourceId',id),100,'initial:faq:'||id FROM public.knowledge_faqs
UNION ALL SELECT 'embedding.refresh','product',id,jsonb_build_object('sourceType','product','sourceId',id),100,'initial:product:'||id FROM public.products
ON CONFLICT DO NOTHING;
