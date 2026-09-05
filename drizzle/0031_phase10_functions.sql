-- Phase 10 trusted functions, automation triggers, and aggregate maintenance.
CREATE OR REPLACE FUNCTION private.phase10_touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN NEW.updated_at=statement_timestamp(); RETURN NEW; END $$;
REVOKE ALL ON FUNCTION private.phase10_touch_updated_at() FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['notification_settings','notification_event_preferences','notification_channel_connections','notification_verifications','push_subscriptions','notification_events','notification_deliveries','in_app_notifications','notification_unsubscribes','notification_webhook_events','support_ticket_categories','support_ticket_messages','support_ticket_attachments','support_canned_replies','knowledge_categories','knowledge_articles','knowledge_faqs','review_replies','product_review_aggregates'] LOOP EXECUTE format('CREATE TRIGGER %I_phase10_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.phase10_touch_updated_at()',t,t); END LOOP; END $$;

CREATE OR REPLACE FUNCTION private.enqueue_notification(p_profile_id uuid,p_event_key text,p_data jsonb,p_idempotency_key text,p_source_type text DEFAULT NULL,p_source_id uuid DEFAULT NULL)
RETURNS public.notification_events LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result public.notification_events; locale text;
BEGIN
 SELECT p.locale_code INTO locale FROM public.profiles p WHERE p.id=p_profile_id AND p.deleted_at IS NULL;
 IF locale IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='notification_profile_not_found'; END IF;
 INSERT INTO public.notification_events(profile_id,event_key,locale_code,data,idempotency_key,source_type,source_id)
 VALUES(p_profile_id,p_event_key,locale,coalesce(p_data,'{}'::jsonb),p_idempotency_key,p_source_type,p_source_id)
 ON CONFLICT(profile_id,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key RETURNING * INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION private.enqueue_notification(uuid,text,jsonb,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.enqueue_notification(uuid,text,jsonb,text,text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION private.enqueue_order_notification() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target_profile uuid; order_number text; event_key text;
BEGIN
 event_key:=CASE NEW.to_status::text WHEN 'paid' THEN 'order.paid' WHEN 'processing' THEN 'order.processing' WHEN 'delivered' THEN 'order.delivered' WHEN 'completed' THEN 'order.delivered' WHEN 'failed' THEN 'order.failed' ELSE NULL END;
 IF event_key IS NULL THEN RETURN NEW; END IF;
 SELECT o.profile_id,o.order_number INTO target_profile,order_number FROM public.orders o WHERE o.id=NEW.order_id;
 IF target_profile IS NOT NULL THEN PERFORM private.enqueue_notification(target_profile,event_key,jsonb_build_object('order_id',NEW.order_id,'order_number',order_number,'status',NEW.to_status),'order-event:'||NEW.id,'order',NEW.order_id); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.enqueue_order_notification() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER order_events_phase10_notify AFTER INSERT ON public.order_events FOR EACH ROW EXECUTE FUNCTION private.enqueue_order_notification();

CREATE OR REPLACE FUNCTION private.enqueue_support_reply_notification() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ticket public.support_tickets;
BEGIN
 SELECT * INTO ticket FROM public.support_tickets WHERE id=NEW.ticket_id;
 IF NEW.author_type='staff' AND NEW.kind='message' AND ticket.profile_id IS NOT NULL THEN
   PERFORM private.enqueue_notification(ticket.profile_id,'support.reply',jsonb_build_object('ticket_id',ticket.id,'ticket_number',ticket.ticket_number),'support-message:'||NEW.id,'support_ticket',ticket.id);
 END IF;
 IF NEW.author_type='staff' AND ticket.first_responded_at IS NULL THEN UPDATE public.support_tickets SET first_responded_at=statement_timestamp() WHERE id=ticket.id; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.enqueue_support_reply_notification() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER support_messages_phase10_notify AFTER INSERT ON public.support_ticket_messages FOR EACH ROW EXECUTE FUNCTION private.enqueue_support_reply_notification();

CREATE OR REPLACE FUNCTION public.create_support_ticket(p_category_code text,p_subject text,p_description text,p_order_id uuid DEFAULT NULL)
RETURNS public.support_tickets LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE category public.support_ticket_categories; result public.support_tickets;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required'; END IF;
 IF char_length(trim(p_subject)) NOT BETWEEN 4 AND 160 OR char_length(trim(p_description)) NOT BETWEEN 10 AND 10000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ticket_content_invalid'; END IF;
 SELECT * INTO category FROM public.support_ticket_categories WHERE code=p_category_code AND active AND deleted_at IS NULL;
 IF category.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ticket_category_invalid'; END IF;
 IF p_order_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.orders WHERE id=p_order_id AND profile_id=auth.uid()) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='order_not_owned'; END IF;
 INSERT INTO public.support_tickets(ticket_number,profile_id,order_id,category,category_id,subject,description,priority,first_response_due_at,sla_due_at)
 VALUES('NX-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),auth.uid(),p_order_id,category.code,category.id,trim(p_subject),trim(p_description),category.default_priority,now()+make_interval(mins=>category.first_response_minutes),now()+make_interval(mins=>category.resolution_minutes)) RETURNING * INTO result;
 INSERT INTO public.support_ticket_messages(ticket_id,author_id,author_type,kind,body) VALUES(result.id,auth.uid(),'customer','message',trim(p_description));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.create_support_ticket(text,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_support_ticket(text,text,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.post_support_message(p_ticket_id uuid,p_body text,p_internal boolean DEFAULT false)
RETURNS public.support_ticket_messages LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ticket public.support_tickets; staff boolean; result public.support_ticket_messages;
BEGIN
 IF auth.uid() IS NULL OR char_length(trim(p_body)) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='message_invalid'; END IF;
 SELECT * INTO ticket FROM public.support_tickets WHERE id=p_ticket_id AND deleted_at IS NULL FOR UPDATE;
  staff:=private.app_can('support.manage');
 IF ticket.id IS NULL OR (ticket.profile_id<>auth.uid() AND NOT staff) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ticket_not_found'; END IF;
 IF ticket.status='closed' AND NOT staff THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='ticket_closed'; END IF;
 IF p_internal AND NOT staff THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='internal_note_forbidden'; END IF;
 INSERT INTO public.support_ticket_messages(ticket_id,author_id,author_type,kind,body)
 VALUES(ticket.id,auth.uid(),CASE WHEN staff THEN 'staff' ELSE 'customer' END,CASE WHEN p_internal THEN 'internal_note'::public.support_message_kind ELSE 'message'::public.support_message_kind END,trim(p_body)) RETURNING * INTO result;
 IF NOT staff AND ticket.status='waiting_customer' THEN UPDATE public.support_tickets SET status='in_progress' WHERE id=ticket.id; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.post_support_message(uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.post_support_message(uuid,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.reopen_support_ticket(p_ticket_id uuid) RETURNS public.support_tickets LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result public.support_tickets;
BEGIN
 UPDATE public.support_tickets SET status='open',closed_at=NULL,resolved_at=NULL,reopen_count=reopen_count+1 WHERE id=p_ticket_id AND profile_id=auth.uid() AND status IN ('resolved','closed') AND coalesce(closed_at,resolved_at)>now()-interval '14 days' RETURNING * INTO result;
 IF result.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='ticket_reopen_not_allowed'; END IF; RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.reopen_support_ticket(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reopen_support_ticket(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.rate_support_ticket(p_ticket_id uuid,p_rating integer,p_comment text DEFAULT NULL) RETURNS public.support_tickets LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result public.support_tickets;
BEGIN
 IF p_rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='rating_invalid'; END IF;
 UPDATE public.support_tickets SET satisfaction_rating=p_rating,satisfaction_comment=nullif(trim(p_comment),''),rated_at=now() WHERE id=p_ticket_id AND profile_id=auth.uid() AND status IN ('resolved','closed') AND satisfaction_rating IS NULL RETURNING * INTO result;
 IF result.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='ticket_rating_not_allowed'; END IF; RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.rate_support_ticket(uuid,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rate_support_ticket(uuid,integer,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_verified_review(p_order_item_id uuid,p_rating integer,p_title text,p_body text,p_image_paths jsonb DEFAULT '[]'::jsonb)
RETURNS public.reviews LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item record; result public.reviews;
BEGIN
 IF auth.uid() IS NULL OR p_rating NOT BETWEEN 1 AND 5 OR jsonb_typeof(p_image_paths)<>'array' OR jsonb_array_length(p_image_paths)>5 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='review_invalid'; END IF;
 SELECT oi.product_id,o.profile_id,o.status INTO item FROM public.order_items oi JOIN public.orders o ON o.id=oi.order_id WHERE oi.id=p_order_item_id;
 IF item.profile_id IS DISTINCT FROM auth.uid() OR item.status NOT IN ('delivered','completed') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='verified_purchase_required'; END IF;
 INSERT INTO public.reviews(product_id,order_item_id,profile_id,rating,title,body,image_paths,status)
 VALUES(item.product_id,p_order_item_id,auth.uid(),p_rating,nullif(trim(p_title),''),nullif(trim(p_body),''),p_image_paths,'pending')
 ON CONFLICT(order_item_id) DO UPDATE SET rating=EXCLUDED.rating,title=EXCLUDED.title,body=EXCLUDED.body,image_paths=EXCLUDED.image_paths,status='pending',moderated_by=NULL,moderated_at=NULL,moderation_reason=NULL,updated_at=now() RETURNING * INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.submit_verified_review(uuid,integer,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_verified_review(uuid,integer,text,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION private.refresh_product_review_aggregate(p_product_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.product_review_aggregates(product_id,review_count,rating_sum,average_rating,rating_distribution)
 SELECT p_product_id,count(*),coalesce(sum(rating),0),coalesce(round(avg(rating)::numeric,2),0),jsonb_build_object('1',count(*)FILTER(WHERE rating=1),'2',count(*)FILTER(WHERE rating=2),'3',count(*)FILTER(WHERE rating=3),'4',count(*)FILTER(WHERE rating=4),'5',count(*)FILTER(WHERE rating=5))
 FROM public.reviews WHERE product_id=p_product_id AND status='approved' AND deleted_at IS NULL
 ON CONFLICT(product_id) DO UPDATE SET review_count=EXCLUDED.review_count,rating_sum=EXCLUDED.rating_sum,average_rating=EXCLUDED.average_rating,rating_distribution=EXCLUDED.rating_distribution,updated_at=now();
END $$;
REVOKE ALL ON FUNCTION private.refresh_product_review_aggregate(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.reviews_refresh_aggregate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN PERFORM private.refresh_product_review_aggregate(coalesce(NEW.product_id,OLD.product_id)); RETURN coalesce(NEW,OLD); END $$;
REVOKE ALL ON FUNCTION private.reviews_refresh_aggregate() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER reviews_phase10_aggregate AFTER INSERT OR UPDATE OR DELETE ON public.reviews FOR EACH ROW EXECUTE FUNCTION private.reviews_refresh_aggregate();

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id uuid) RETURNS public.in_app_notifications LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result public.in_app_notifications; BEGIN UPDATE public.in_app_notifications SET read_at=coalesce(read_at,now()) WHERE id=p_notification_id AND profile_id=auth.uid() RETURNING * INTO result; IF result.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='notification_not_found'; END IF; RETURN result; END $$;
REVOKE ALL ON FUNCTION public.mark_notification_read(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read() RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE n bigint; BEGIN UPDATE public.in_app_notifications SET read_at=now() WHERE profile_id=auth.uid() AND read_at IS NULL; GET DIAGNOSTICS n=ROW_COUNT; RETURN n; END $$;
REVOKE ALL ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;

CREATE OR REPLACE FUNCTION public.search_knowledge(p_query text,p_locale text DEFAULT 'en',p_limit integer DEFAULT 20)
RETURNS TABLE(id uuid,slug text,title text,excerpt text,rank real) LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT a.id,a.slug,coalesce(a.title->>p_locale,a.title->>'en',''),coalesce(a.excerpt->>p_locale,a.excerpt->>'en',''),ts_rank(a.search_vector,websearch_to_tsquery('simple',p_query))
 FROM public.knowledge_articles a WHERE a.status='published' AND a.deleted_at IS NULL AND a.published_at<=now() AND (trim(p_query)='' OR a.search_vector@@websearch_to_tsquery('simple',p_query)) ORDER BY 5 DESC,a.published_at DESC LIMIT least(greatest(p_limit,1),50)
$$;
GRANT EXECUTE ON FUNCTION public.search_knowledge(text,text,integer) TO anon,authenticated;
DO $$ DECLARE r record; BEGIN FOR r IN SELECT id FROM public.products LOOP PERFORM private.refresh_product_review_aggregate(r.id); END LOOP; END $$;
COMMENT ON FUNCTION public.submit_verified_review(uuid,integer,text,text,jsonb) IS 'One moderated review per delivered order item with ownership enforced in the database.';
