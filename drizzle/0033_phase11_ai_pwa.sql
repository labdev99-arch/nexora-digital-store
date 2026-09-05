-- Phase 11: AI platform, RAG, recommendations, risk, translation and insights.
-- Retrieved documents are public catalog/support content only. Private orders are never embedded.

CREATE TABLE public.ai_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (source_type IN ('knowledge_article','faq','product')),
  source_id uuid NOT NULL,
  locale_code text NOT NULL REFERENCES public.locales(code) ON DELETE RESTRICT,
  title text NOT NULL,
  content text NOT NULL,
  source_url text NOT NULL,
  content_hash text NOT NULL CHECK (length(content_hash)=64),
  embedding extensions.vector(1536),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  embedded_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ai_documents_source_locale_uidx ON public.ai_documents(source_type,source_id,locale_code);
CREATE INDEX ai_documents_source_idx ON public.ai_documents(source_type,source_id);
CREATE INDEX ai_documents_locale_idx ON public.ai_documents(locale_code,updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX ai_documents_embedding_hnsw_idx ON public.ai_documents USING hnsw (embedding extensions.vector_cosine_ops) WHERE embedding IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE public.ai_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('embedding.refresh','recommendations.refresh','risk.score','translation.generate','insights.detect','insights.digest')),
  aggregate_type text NOT NULL,
  aggregate_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload)='object'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','retrying','completed','failed','dead_letter')),
  priority integer NOT NULL DEFAULT 100 CHECK(priority BETWEEN 0 AND 1000),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK(max_attempts BETWEEN 1 AND 20),
  run_at timestamptz NOT NULL DEFAULT now(),
  locked_by text,
  locked_until timestamptz,
  idempotency_key text NOT NULL,
  result jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(result)='object'),
  last_error text,
  completed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_jobs_lock_ck CHECK ((locked_by IS NULL)=(locked_until IS NULL)),
  UNIQUE(kind,idempotency_key)
);
CREATE INDEX ai_jobs_due_idx ON public.ai_jobs(priority DESC,run_at,created_at) WHERE status IN ('pending','retrying');
CREATE INDEX ai_jobs_aggregate_idx ON public.ai_jobs(aggregate_type,aggregate_id,created_at DESC);

CREATE TABLE public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  locale_code text NOT NULL REFERENCES public.locales(code) ON DELETE RESTRICT,
  title text,
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','escalated','closed')),
  escalated_ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_conversations_profile_idx ON public.ai_conversations(profile_id,last_message_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK(role IN ('user','assistant','system')),
  content text NOT NULL CHECK(length(content) BETWEEN 1 AND 20000),
  citations jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(citations)='array'),
  safety_flags text[] NOT NULL DEFAULT '{}'::text[],
  input_tokens integer NOT NULL DEFAULT 0 CHECK(input_tokens>=0),
  output_tokens integer NOT NULL DEFAULT 0 CHECK(output_tokens>=0),
  cost_minor integer NOT NULL DEFAULT 0 CHECK(cost_minor>=0),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_messages_conversation_idx ON public.ai_messages(conversation_id,created_at);
CREATE INDEX ai_messages_profile_idx ON public.ai_messages(profile_id,created_at DESC);

CREATE TABLE public.ai_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  feature text NOT NULL CHECK(feature~'^[a-z][a-z0-9_.-]{1,63}$'),
  provider text NOT NULL,
  model text NOT NULL,
  request_hash text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0 CHECK(input_tokens>=0),
  output_tokens integer NOT NULL DEFAULT 0 CHECK(output_tokens>=0),
  cost_minor integer NOT NULL DEFAULT 0 CHECK(cost_minor>=0),
  latency_ms integer NOT NULL DEFAULT 0 CHECK(latency_ms>=0),
  cache_hit boolean NOT NULL DEFAULT false,
  status text NOT NULL CHECK(status IN ('success','fallback','timeout','error','rate_limited','disabled')),
  error_code text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(metadata)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_usage_profile_window_idx ON public.ai_usage_logs(profile_id,feature,created_at DESC);
CREATE INDEX ai_usage_cost_idx ON public.ai_usage_logs(created_at DESC,cost_minor);

CREATE TABLE public.ai_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  feature text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  response jsonb NOT NULL CHECK(jsonb_typeof(response) IN ('object','array')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_cache_expiry_idx ON public.ai_cache(expires_at);

CREATE TABLE public.product_recommendation_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  recommended_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  score_bps integer NOT NULL CHECK(score_bps BETWEEN 0 AND 10000),
  collaborative_score_bps integer NOT NULL DEFAULT 0 CHECK(collaborative_score_bps BETWEEN 0 AND 10000),
  content_score_bps integer NOT NULL DEFAULT 0 CHECK(content_score_bps BETWEEN 0 AND 10000),
  reason_code text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(source_product_id<>recommended_product_id),
  UNIQUE(source_product_id,recommended_product_id)
);
CREATE INDEX product_recommendation_edges_rank_idx ON public.product_recommendation_edges(source_product_id,score_bps DESC);

CREATE TABLE public.profile_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  score_bps integer NOT NULL CHECK(score_bps BETWEEN 0 AND 10000),
  reason_code text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id,product_id)
);
CREATE INDEX profile_recommendations_rank_idx ON public.profile_recommendations(profile_id,score_bps DESC,expires_at);

CREATE TABLE public.ai_risk_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL CHECK(subject_type IN ('order','topup')),
  subject_id uuid NOT NULL,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  score integer NOT NULL CHECK(score BETWEEN 0 AND 100),
  decision text NOT NULL CHECK(decision IN ('allow','review','hold','block')),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewing','cleared','confirmed','dismissed')),
  rules_version text NOT NULL,
  features jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(features)='object'),
  explanations jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(explanations)='array'),
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  review_reason text,
  reviewed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_risk_review_idx ON public.ai_risk_assessments(decision,status,score DESC,created_at) WHERE deleted_at IS NULL;
CREATE INDEX ai_risk_subject_idx ON public.ai_risk_assessments(subject_type,subject_id,created_at DESC);

ALTER TABLE public.orders ADD COLUMN ai_risk_score integer CHECK(ai_risk_score BETWEEN 0 AND 100), ADD COLUMN ai_risk_decision text CHECK(ai_risk_decision IN ('allow','review','hold','block'));
ALTER TABLE public.payments ADD COLUMN ai_risk_score integer CHECK(ai_risk_score BETWEEN 0 AND 100), ADD COLUMN ai_risk_decision text CHECK(ai_risk_decision IN ('allow','review','hold','block'));
ALTER TABLE public.payment_proof_checks ADD COLUMN extracted_sender text, ADD COLUMN ai_model text;

CREATE TABLE public.ai_glossary_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_locale_code text NOT NULL REFERENCES public.locales(code) ON DELETE RESTRICT,
  source_term text NOT NULL,
  translations jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(translations)='object'),
  do_not_translate boolean NOT NULL DEFAULT false,
  case_sensitive boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ai_glossary_term_uidx ON public.ai_glossary_terms(source_locale_code,source_term) WHERE deleted_at IS NULL;

CREATE TABLE public.ai_translation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK(entity_type IN ('product','notification_template')),
  entity_id uuid NOT NULL,
  source_locale_code text NOT NULL REFERENCES public.locales(code) ON DELETE RESTRICT,
  target_locale_code text NOT NULL REFERENCES public.locales(code) ON DELETE RESTRICT,
  source_content jsonb NOT NULL CHECK(jsonb_typeof(source_content)='object'),
  proposed_content jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(proposed_content)='object'),
  glossary_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(glossary_snapshot)='array'),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','generating','awaiting_approval','approved','rejected','failed')),
  requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  review_reason text,
  reviewed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(source_locale_code<>target_locale_code)
);
CREATE INDEX ai_translation_review_idx ON public.ai_translation_jobs(status,target_locale_code,created_at) WHERE deleted_at IS NULL;

CREATE TABLE public.ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK(kind IN ('query','anomaly','daily_digest')),
  severity text NOT NULL DEFAULT 'info' CHECK(severity IN ('info','warning','critical')),
  metric_key text,
  title jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(title)='object'),
  body jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(body)='object'),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(evidence)='object'),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','dismissed','resolved')),
  generated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_insights_active_idx ON public.ai_insights(status,severity,generated_at DESC) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION private.phase11_touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN NEW.updated_at=statement_timestamp(); RETURN NEW; END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['ai_documents','ai_jobs','ai_conversations','ai_messages','ai_usage_logs','ai_cache','product_recommendation_edges','profile_recommendations','ai_risk_assessments','ai_glossary_terms','ai_translation_jobs','ai_insights'] LOOP EXECUTE format('CREATE TRIGGER %I_phase11_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.phase11_touch_updated_at()',t,t); END LOOP; END $$;

DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['ai_documents','ai_jobs','ai_conversations','ai_messages','ai_usage_logs','ai_cache','product_recommendation_edges','profile_recommendations','ai_risk_assessments','ai_glossary_terms','ai_translation_jobs','ai_insights'] LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t); END LOOP; END $$;

CREATE POLICY ai_conversations_owner_read ON public.ai_conversations FOR SELECT TO authenticated USING(profile_id=(SELECT auth.uid()) OR (SELECT private.app_can('ai.manage')));
CREATE POLICY ai_conversations_owner_insert ON public.ai_conversations FOR INSERT TO authenticated WITH CHECK(profile_id=(SELECT auth.uid()));
CREATE POLICY ai_messages_owner_read ON public.ai_messages FOR SELECT TO authenticated USING(profile_id=(SELECT auth.uid()) OR (SELECT private.app_can('ai.manage')));
CREATE POLICY profile_recommendations_owner_read ON public.profile_recommendations FOR SELECT TO authenticated USING(profile_id=(SELECT auth.uid()) OR (SELECT private.app_can('ai.manage')));
CREATE POLICY ai_usage_owner_read ON public.ai_usage_logs FOR SELECT TO authenticated USING(profile_id=(SELECT auth.uid()) OR (SELECT private.app_can('ai.manage')));
CREATE POLICY ai_documents_staff_read ON public.ai_documents FOR SELECT TO authenticated USING((SELECT private.app_can('ai.manage')));
CREATE POLICY ai_jobs_staff_read ON public.ai_jobs FOR SELECT TO authenticated USING((SELECT private.app_can('ai.manage')));
CREATE POLICY ai_cache_staff_read ON public.ai_cache FOR SELECT TO authenticated USING((SELECT private.app_can('ai.manage')));
CREATE POLICY recommendation_edges_public_read ON public.product_recommendation_edges FOR SELECT TO anon,authenticated USING(true);
CREATE POLICY ai_risk_staff_read ON public.ai_risk_assessments FOR SELECT TO authenticated USING((SELECT private.app_can('ai.manage')));
CREATE POLICY ai_glossary_staff_read ON public.ai_glossary_terms FOR SELECT TO authenticated USING((SELECT private.app_can('ai.manage')));
CREATE POLICY ai_translation_staff_read ON public.ai_translation_jobs FOR SELECT TO authenticated USING((SELECT private.app_can('ai.manage')));
CREATE POLICY ai_insights_staff_read ON public.ai_insights FOR SELECT TO authenticated USING((SELECT private.app_can('ai.manage')));

REVOKE ALL ON public.ai_documents,public.ai_jobs,public.ai_conversations,public.ai_messages,public.ai_usage_logs,public.ai_cache,public.product_recommendation_edges,public.profile_recommendations,public.ai_risk_assessments,public.ai_glossary_terms,public.ai_translation_jobs,public.ai_insights FROM anon,authenticated;
GRANT SELECT ON public.product_recommendation_edges TO anon,authenticated;
GRANT SELECT ON public.ai_conversations,public.ai_messages,public.ai_usage_logs,public.profile_recommendations,public.ai_documents,public.ai_jobs,public.ai_cache,public.ai_risk_assessments,public.ai_glossary_terms,public.ai_translation_jobs,public.ai_insights TO authenticated;
GRANT INSERT ON public.ai_conversations TO authenticated;
GRANT ALL ON public.ai_documents,public.ai_jobs,public.ai_conversations,public.ai_messages,public.ai_usage_logs,public.ai_cache,public.product_recommendation_edges,public.profile_recommendations,public.ai_risk_assessments,public.ai_glossary_terms,public.ai_translation_jobs,public.ai_insights TO service_role;

INSERT INTO public.role_permissions(role,permission,description) VALUES
 ('support','ai.manage','Review AI conversations and escalations'),
 ('finance','ai.manage','Review AI fraud assessments'),
 ('admin','ai.manage','Manage AI operations'),
 ('owner','ai.manage','Manage AI operations')
ON CONFLICT DO NOTHING;

INSERT INTO public.notification_templates(template_key,channel,locale_code,subject,body,variables)
VALUES
 ('admin.ai_daily_digest','email','en','Nexora daily intelligence digest','Your daily operational digest is ready in the AI control room.','["admin_url"]'),
 ('admin.ai_daily_digest','in_app','en',NULL,'Your daily operational digest is ready in the AI control room.','["admin_url"]'),
 ('admin.ai_daily_digest','email','ar','ملخص نكسورا الذكي اليومي','الملخص التشغيلي اليومي جاهز في غرفة تحكم الذكاء.','["admin_url"]'),
 ('admin.ai_daily_digest','in_app','ar',NULL,'الملخص التشغيلي اليومي جاهز في غرفة تحكم الذكاء.','["admin_url"]')
ON CONFLICT(template_key,channel,locale_code) DO UPDATE SET subject=EXCLUDED.subject,body=EXCLUDED.body,variables=EXCLUDED.variables,active=true,deleted_at=NULL;

COMMENT ON TABLE public.ai_documents IS 'Locale-specific embeddings of public, approved content. Customer orders are intentionally excluded.';
COMMENT ON TABLE public.ai_risk_assessments IS 'Explainable deterministic risk records; optional models may add explanations but never bypass server rules.';
