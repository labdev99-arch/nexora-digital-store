-- Phase 10: unified notifications, realtime support, knowledge base, and verified reviews.
CREATE TYPE public.notification_delivery_status AS ENUM ('queued','processing','sent','delivered','failed','suppressed','dead_letter');
CREATE TYPE public.notification_connection_status AS ENUM ('pending','verified','revoked');
CREATE TYPE public.support_message_kind AS ENUM ('message','internal_note','status_change','system');
CREATE TYPE public.knowledge_status AS ENUM ('draft','published','archived');

ALTER TABLE public.notification_templates DROP CONSTRAINT IF EXISTS notification_templates_channel_check;
ALTER TABLE public.notification_templates
  ADD COLUMN provider_template_name text,
  ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  ADD CONSTRAINT notification_templates_channel_check CHECK (channel IN ('email','whatsapp','telegram','push','in_app','sms'));

CREATE TABLE public.notification_settings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
 timezone text NOT NULL DEFAULT 'UTC', quiet_hours_enabled boolean NOT NULL DEFAULT false,
 quiet_start time, quiet_end time, quiet_days smallint[] NOT NULL DEFAULT '{}'::smallint[],
 whatsapp_opted_in_at timestamptz, whatsapp_verified_at timestamptz, global_unsubscribed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (NOT quiet_hours_enabled OR (quiet_start IS NOT NULL AND quiet_end IS NOT NULL)),
 CHECK (quiet_days <@ ARRAY[0,1,2,3,4,5,6]::smallint[])
);
CREATE TABLE public.notification_event_preferences (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 event_key text NOT NULL CHECK (event_key~'^[a-z][a-z0-9_.-]{1,127}$'), channel text NOT NULL CHECK(channel IN ('email','whatsapp','telegram','push','in_app','sms')),
 enabled boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(profile_id,event_key,channel)
);
CREATE INDEX notification_event_preferences_profile_idx ON public.notification_event_preferences(profile_id,event_key);
CREATE TABLE public.notification_channel_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 channel text NOT NULL CHECK(channel IN ('email','whatsapp','telegram','push','in_app','sms')), status public.notification_connection_status NOT NULL DEFAULT 'pending',
 external_id_ciphertext text, external_id_hash text, display_hint text, verified_at timestamptz, revoked_at timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(profile_id,channel)
);
CREATE INDEX notification_connections_status_idx ON public.notification_channel_connections(channel,status);
CREATE UNIQUE INDEX notification_connections_external_uidx ON public.notification_channel_connections(channel,external_id_hash) WHERE external_id_hash IS NOT NULL AND status='verified';
CREATE TABLE public.notification_verifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 channel text NOT NULL CHECK(channel IN ('email','whatsapp','telegram','push','in_app','sms')), destination_hash text NOT NULL, code_hash text NOT NULL,
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10), expires_at timestamptz NOT NULL, verified_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notification_verifications_active_idx ON public.notification_verifications(profile_id,channel,expires_at DESC) WHERE verified_at IS NULL;
CREATE TABLE public.push_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 endpoint text NOT NULL, endpoint_hash text NOT NULL UNIQUE, p256dh text NOT NULL, auth_secret text NOT NULL,
 user_agent text, last_used_at timestamptz, revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_subscriptions_profile_active_idx ON public.push_subscriptions(profile_id,revoked_at);
CREATE TABLE public.notification_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 event_key text NOT NULL CHECK (event_key~'^[a-z][a-z0-9_.-]{1,127}$'), locale_code text NOT NULL REFERENCES public.locales(code),
 data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data)='object'), idempotency_key text NOT NULL,
 source_type text, source_id uuid, available_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(profile_id,idempotency_key)
);
CREATE INDEX notification_events_queue_idx ON public.notification_events(available_at,created_at) WHERE processed_at IS NULL;
CREATE INDEX notification_events_profile_idx ON public.notification_events(profile_id,created_at DESC);
CREATE TABLE public.notification_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES public.notification_events(id) ON DELETE CASCADE,
 profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, channel text NOT NULL CHECK(channel IN ('email','whatsapp','telegram','push','in_app','sms')),
 status public.notification_delivery_status NOT NULL DEFAULT 'queued', provider_message_id text,
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts>=0), max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
 next_attempt_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz, delivered_at timestamptz, failed_at timestamptz,
 last_error text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(event_id,channel)
);
CREATE INDEX notification_deliveries_queue_idx ON public.notification_deliveries(status,next_attempt_at,created_at) WHERE status IN ('queued','failed');
CREATE INDEX notification_deliveries_profile_idx ON public.notification_deliveries(profile_id,created_at DESC);
CREATE TABLE public.in_app_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), delivery_id uuid NOT NULL UNIQUE REFERENCES public.notification_deliveries(id) ON DELETE CASCADE,
 profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, event_key text NOT NULL, title text NOT NULL, body text NOT NULL,
 action_url text, data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data)='object'), read_at timestamptz, archived_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX in_app_notifications_unread_idx ON public.in_app_notifications(profile_id,created_at DESC) WHERE read_at IS NULL;
CREATE TABLE public.notification_unsubscribes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
 email_hash text, event_key text, channel text NOT NULL CHECK(channel IN ('email','whatsapp','telegram','push','in_app','sms')), reason text, token_hash text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notification_unsubscribes_profile_idx ON public.notification_unsubscribes(profile_id,channel);
CREATE TABLE public.notification_webhook_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider text NOT NULL, external_event_id text NOT NULL,
 signature_valid boolean NOT NULL, event_type text NOT NULL, payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload)='object'),
 processed_at timestamptz, error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider,external_event_id)
);
CREATE INDEX notification_webhooks_unprocessed_idx ON public.notification_webhook_events(provider,created_at) WHERE processed_at IS NULL;

CREATE TABLE public.support_ticket_categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE CHECK (code~'^[a-z][a-z0-9_-]{1,63}$'),
 name jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(name)='object'), description jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(description)='object'),
 default_priority public.support_ticket_priority NOT NULL DEFAULT 'normal', first_response_minutes integer NOT NULL DEFAULT 240 CHECK(first_response_minutes>0),
 resolution_minutes integer NOT NULL DEFAULT 1440 CHECK(resolution_minutes>0), active boolean NOT NULL DEFAULT true, sort_order integer NOT NULL DEFAULT 0,
 deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.support_tickets
 ADD COLUMN category_id uuid REFERENCES public.support_ticket_categories(id) ON DELETE RESTRICT,
 ADD COLUMN first_response_due_at timestamptz, ADD COLUMN first_responded_at timestamptz, ADD COLUMN closed_at timestamptz,
 ADD COLUMN reopen_count integer NOT NULL DEFAULT 0 CHECK(reopen_count>=0), ADD COLUMN satisfaction_rating integer CHECK(satisfaction_rating BETWEEN 1 AND 5),
 ADD COLUMN satisfaction_comment text, ADD COLUMN rated_at timestamptz;
CREATE INDEX support_tickets_category_idx ON public.support_tickets(category_id);
CREATE TABLE public.support_ticket_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
 author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL, author_type text NOT NULL CHECK(author_type IN ('customer','staff','system')),
 kind public.support_message_kind NOT NULL DEFAULT 'message', body text NOT NULL CHECK(char_length(trim(body)) BETWEEN 1 AND 10000),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(metadata)='object'), edited_at timestamptz, deleted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_ticket_messages_ticket_idx ON public.support_ticket_messages(ticket_id,created_at,id) WHERE deleted_at IS NULL;
CREATE TABLE public.support_ticket_attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
 message_id uuid REFERENCES public.support_ticket_messages(id) ON DELETE CASCADE, uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 storage_path text NOT NULL UNIQUE, file_name text NOT NULL, content_type text NOT NULL, size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 10485760),
 scan_status text NOT NULL DEFAULT 'pending' CHECK(scan_status IN ('pending','clean','blocked')), deleted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_ticket_attachments_ticket_idx ON public.support_ticket_attachments(ticket_id,created_at) WHERE deleted_at IS NULL;
CREATE INDEX support_ticket_attachments_message_idx ON public.support_ticket_attachments(message_id) WHERE message_id IS NOT NULL;
CREATE TABLE public.support_canned_replies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shortcut text NOT NULL UNIQUE CHECK(shortcut~'^/[a-z0-9_-]{2,63}$'),
 title jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(title)='object'), body jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(body)='object'),
 category_id uuid REFERENCES public.support_ticket_categories(id) ON DELETE SET NULL, active boolean NOT NULL DEFAULT true,
 usage_count bigint NOT NULL DEFAULT 0 CHECK(usage_count>=0), created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_canned_replies_category_idx ON public.support_canned_replies(category_id) WHERE category_id IS NOT NULL;
CREATE INDEX support_canned_replies_creator_idx ON public.support_canned_replies(created_by) WHERE created_by IS NOT NULL;

CREATE TABLE public.knowledge_categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), parent_id uuid REFERENCES public.knowledge_categories(id) ON DELETE SET NULL,
 slug text NOT NULL UNIQUE CHECK(slug~'^[a-z0-9]+(?:-[a-z0-9]+)*$'), name jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(name)='object'),
 description jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(description)='object'), sort_order integer NOT NULL DEFAULT 0,
 active boolean NOT NULL DEFAULT true, deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX knowledge_categories_parent_idx ON public.knowledge_categories(parent_id,sort_order);
CREATE TABLE public.knowledge_articles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), category_id uuid REFERENCES public.knowledge_categories(id) ON DELETE SET NULL,
 slug text NOT NULL UNIQUE CHECK(slug~'^[a-z0-9]+(?:-[a-z0-9]+)*$'), title jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(title)='object'),
 excerpt jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(excerpt)='object'), body jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(body)='object'),
 seo jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(seo)='object'), status public.knowledge_status NOT NULL DEFAULT 'draft',
 author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL, published_at timestamptz,
 search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple',coalesce(title::text,'')||' '||coalesce(excerpt::text,'')||' '||coalesce(body::text,''))) STORED,
 deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX knowledge_articles_search_idx ON public.knowledge_articles USING gin(search_vector);
CREATE INDEX knowledge_articles_public_idx ON public.knowledge_articles(status,published_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX knowledge_articles_category_idx ON public.knowledge_articles(category_id);
CREATE INDEX knowledge_articles_author_idx ON public.knowledge_articles(author_id) WHERE author_id IS NOT NULL;
CREATE TABLE public.knowledge_faqs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), category_id uuid REFERENCES public.knowledge_categories(id) ON DELETE SET NULL,
 question jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(question)='object'), answer jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(answer)='object'),
 sort_order integer NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true, deleted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX knowledge_faqs_category_idx ON public.knowledge_faqs(category_id,sort_order);
CREATE TABLE public.review_replies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), review_id uuid NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
 author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL, body text NOT NULL CHECK(char_length(trim(body)) BETWEEN 1 AND 3000),
 deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX review_replies_review_idx ON public.review_replies(review_id,created_at);
CREATE INDEX review_replies_author_idx ON public.review_replies(author_id) WHERE author_id IS NOT NULL;
CREATE TABLE public.product_review_aggregates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL UNIQUE REFERENCES public.products(id) ON DELETE CASCADE,
 review_count bigint NOT NULL DEFAULT 0 CHECK(review_count>=0), rating_sum bigint NOT NULL DEFAULT 0 CHECK(rating_sum>=0),
 average_rating numeric(3,2) NOT NULL DEFAULT 0 CHECK(average_rating BETWEEN 0 AND 5),
 rating_distribution jsonb NOT NULL DEFAULT '{"1":0,"2":0,"3":0,"4":0,"5":0}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.support_ticket_categories(code,name,description,default_priority,first_response_minutes,resolution_minutes,sort_order) VALUES
 ('orders','{"en":"Orders","ar":"الطلبات"}','{"en":"Delivery and order status","ar":"التسليم وحالة الطلب"}','normal',120,1440,10),
 ('payments','{"en":"Payments","ar":"المدفوعات"}','{"en":"Top-ups and payment verification","ar":"الشحن والتحقق من الدفع"}','high',60,720,20),
 ('account','{"en":"Account","ar":"الحساب"}','{"en":"Identity and account access","ar":"الهوية والوصول إلى الحساب"}','normal',240,1440,30),
 ('other','{"en":"Other","ar":"أخرى"}','{"en":"Anything else","ar":"أي مساعدة أخرى"}','normal',240,2880,40)
ON CONFLICT(code) DO NOTHING;
INSERT INTO public.knowledge_categories(slug,name,description,sort_order) VALUES
 ('getting-started','{"en":"Getting started","ar":"البدء"}','{"en":"Learn the Nexora basics","ar":"تعرّف على أساسيات نكسورا"}',10),
 ('orders-delivery','{"en":"Orders and delivery","ar":"الطلبات والتسليم"}','{"en":"Track and receive digital orders","ar":"تتبع واستلام الطلبات الرقمية"}',20),
 ('payments-wallet','{"en":"Payments and wallet","ar":"الدفع والمحفظة"}','{"en":"Wallet and payment guidance","ar":"إرشادات المحفظة والدفع"}',30)
ON CONFLICT(slug) DO NOTHING;
INSERT INTO public.knowledge_faqs(category_id,question,answer,sort_order)
SELECT id,'{"en":"Where is my order?","ar":"أين طلبي؟"}','{"en":"Open your order to see its live timeline. Automatic deliveries usually arrive in seconds.","ar":"افتح طلبك لرؤية مساره المباشر. عادةً تصل الطلبات التلقائية خلال ثوانٍ."}',10 FROM public.knowledge_categories WHERE slug='orders-delivery';

INSERT INTO public.notification_templates(template_key,channel,locale_code,subject,body,variables,provider_template_name)
SELECT event_key,channel,locale_code,CASE WHEN channel='email' THEN subject END,body,variables,CASE WHEN channel='whatsapp' THEN replace(event_key,'.','_') END
FROM (VALUES
 ('order.paid','Order paid','Your order {{order_number}} is paid.','تم دفع الطلب','تم دفع طلبك {{order_number}}.','["order_number","order_url"]'::jsonb),
 ('order.processing','Order processing','We are processing order {{order_number}}.','الطلب قيد المعالجة','نعالج طلبك {{order_number}} الآن.','["order_number","order_url"]'::jsonb),
 ('order.delivered','Order delivered','Order {{order_number}} is ready.','تم تسليم الطلب','طلبك {{order_number}} جاهز.','["order_number","order_url"]'::jsonb),
 ('order.failed','Order needs attention','Order {{order_number}} could not be completed.','تعذر إكمال الطلب','تعذر إكمال طلبك {{order_number}}.','["order_number","order_url"]'::jsonb),
 ('wallet.topup_confirmed','Top-up confirmed','{{amount}} was added to your wallet.','تم شحن المحفظة','تمت إضافة {{amount}} إلى محفظتك.','["amount","wallet_url"]'::jsonb),
 ('wallet.low_balance','Low wallet balance','Your {{currency}} balance is low.','رصيد المحفظة منخفض','رصيد {{currency}} لديك منخفض.','["currency","balance","wallet_url"]'::jsonb),
 ('support.reply','New support reply','There is a new reply on ticket {{ticket_number}}.','رد دعم جديد','لديك رد جديد على التذكرة {{ticket_number}}.','["ticket_number","ticket_url"]'::jsonb)
) e(event_key,en_subject,en_body,ar_subject,ar_body,variables)
CROSS JOIN (VALUES('email'),('whatsapp'),('telegram'),('push'),('in_app'),('sms')) c(channel)
CROSS JOIN LATERAL (VALUES('en',e.en_subject,e.en_body),('ar',e.ar_subject,e.ar_body)) l(locale_code,subject,body)
ON CONFLICT(template_key,channel,locale_code) DO UPDATE SET subject=EXCLUDED.subject,body=EXCLUDED.body,variables=EXCLUDED.variables,provider_template_name=EXCLUDED.provider_template_name,active=true,deleted_at=NULL,updated_at=now();

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES
 ('support-attachments','support-attachments',false,10485760,ARRAY['image/jpeg','image/png','image/webp','application/pdf','text/plain']),
 ('review-images','review-images',false,5242880,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;

DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['notification_settings','notification_event_preferences','notification_channel_connections','notification_verifications','push_subscriptions','notification_events','notification_deliveries','in_app_notifications','notification_unsubscribes','notification_webhook_events','support_ticket_categories','support_ticket_messages','support_ticket_attachments','support_canned_replies','knowledge_categories','knowledge_articles','knowledge_faqs','review_replies','product_review_aggregates'] LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t); END LOOP; END $$;
CREATE POLICY notification_settings_owner_all ON public.notification_settings FOR ALL TO authenticated USING(profile_id=(SELECT auth.uid())) WITH CHECK(profile_id=(SELECT auth.uid()));
CREATE POLICY notification_event_preferences_owner_all ON public.notification_event_preferences FOR ALL TO authenticated USING(profile_id=(SELECT auth.uid())) WITH CHECK(profile_id=(SELECT auth.uid()));
CREATE POLICY notification_connections_owner_read ON public.notification_channel_connections FOR SELECT TO authenticated USING(profile_id=(SELECT auth.uid()));
CREATE POLICY notification_verifications_owner_read ON public.notification_verifications FOR SELECT TO authenticated USING(profile_id=(SELECT auth.uid()));
CREATE POLICY push_subscriptions_owner_all ON public.push_subscriptions FOR ALL TO authenticated USING(profile_id=(SELECT auth.uid())) WITH CHECK(profile_id=(SELECT auth.uid()));
CREATE POLICY notification_events_owner_read ON public.notification_events FOR SELECT TO authenticated USING(profile_id=(SELECT auth.uid()));
CREATE POLICY notification_deliveries_owner_read ON public.notification_deliveries FOR SELECT TO authenticated USING(profile_id=(SELECT auth.uid()));
CREATE POLICY in_app_notifications_owner_all ON public.in_app_notifications FOR ALL TO authenticated USING(profile_id=(SELECT auth.uid())) WITH CHECK(profile_id=(SELECT auth.uid()));
CREATE POLICY notification_unsubscribes_owner_read ON public.notification_unsubscribes FOR SELECT TO authenticated USING(profile_id=(SELECT auth.uid()));
CREATE POLICY notification_webhooks_staff_read ON public.notification_webhook_events FOR SELECT TO authenticated USING((SELECT private.app_can('settings.manage')));
CREATE POLICY support_categories_public_read ON public.support_ticket_categories FOR SELECT TO anon,authenticated USING((active AND deleted_at IS NULL) OR (SELECT private.app_can('support.manage')));
CREATE POLICY support_tickets_owner_read ON public.support_tickets FOR SELECT TO authenticated USING(profile_id=(SELECT auth.uid()) OR (SELECT private.app_can('support.manage')));
CREATE POLICY support_messages_owner_read ON public.support_ticket_messages FOR SELECT TO authenticated USING((kind<>'internal_note' AND EXISTS(SELECT 1 FROM public.support_tickets t WHERE t.id=ticket_id AND t.profile_id=(SELECT auth.uid()))) OR (SELECT private.app_can('support.manage')));
CREATE POLICY support_attachments_owner_read ON public.support_ticket_attachments FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.support_tickets t WHERE t.id=ticket_id AND (t.profile_id=(SELECT auth.uid()) OR (SELECT private.app_can('support.manage')))));
CREATE POLICY support_canned_replies_staff_read ON public.support_canned_replies FOR SELECT TO authenticated USING((SELECT private.app_can('support.manage')));
CREATE POLICY knowledge_categories_public_read ON public.knowledge_categories FOR SELECT TO anon,authenticated USING((active AND deleted_at IS NULL) OR (SELECT private.app_can('content.manage')));
CREATE POLICY knowledge_articles_public_read ON public.knowledge_articles FOR SELECT TO anon,authenticated USING((status='published' AND deleted_at IS NULL AND published_at<=now()) OR (SELECT private.app_can('content.manage')));
CREATE POLICY knowledge_faqs_public_read ON public.knowledge_faqs FOR SELECT TO anon,authenticated USING((active AND deleted_at IS NULL) OR (SELECT private.app_can('content.manage')));
CREATE POLICY review_replies_public_read ON public.review_replies FOR SELECT TO anon,authenticated USING(deleted_at IS NULL AND EXISTS(SELECT 1 FROM public.reviews r WHERE r.id=review_id AND r.status='approved' AND r.deleted_at IS NULL));
CREATE POLICY review_aggregates_public_read ON public.product_review_aggregates FOR SELECT TO anon,authenticated USING(true);
CREATE POLICY reviews_owner_read ON public.reviews FOR SELECT TO authenticated USING(profile_id=(SELECT auth.uid()));

GRANT SELECT,INSERT,UPDATE,DELETE ON public.notification_settings,public.notification_event_preferences,public.push_subscriptions,public.in_app_notifications TO authenticated;
GRANT SELECT ON public.notification_channel_connections,public.notification_verifications,public.notification_events,public.notification_deliveries,public.notification_unsubscribes TO authenticated;
GRANT SELECT ON public.support_ticket_categories,public.support_ticket_messages,public.support_ticket_attachments,public.support_canned_replies TO authenticated;
GRANT SELECT ON public.knowledge_categories,public.knowledge_articles,public.knowledge_faqs,public.review_replies,public.product_review_aggregates TO anon,authenticated;
GRANT ALL ON public.notification_settings,public.notification_event_preferences,public.notification_channel_connections,public.notification_verifications,public.push_subscriptions,public.notification_events,public.notification_deliveries,public.in_app_notifications,public.notification_unsubscribes,public.notification_webhook_events,public.support_ticket_categories,public.support_ticket_messages,public.support_ticket_attachments,public.support_canned_replies,public.knowledge_categories,public.knowledge_articles,public.knowledge_faqs,public.review_replies,public.product_review_aggregates TO service_role;
CREATE POLICY support_attachments_storage_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='support-attachments' AND EXISTS(SELECT 1 FROM public.support_ticket_attachments a JOIN public.support_tickets t ON t.id=a.ticket_id WHERE a.storage_path=name AND (t.profile_id=(SELECT auth.uid()) OR (SELECT private.app_can('support.manage')))));
CREATE POLICY support_attachments_storage_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='support-attachments' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);
CREATE POLICY review_images_storage_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='review-images');
CREATE POLICY review_images_storage_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='review-images' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);

DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
 IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='in_app_notifications') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.in_app_notifications; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='support_ticket_messages') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_messages; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='support_tickets') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='wallets') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.wallets; END IF;
 END IF; END $$;
INSERT INTO public.role_permissions(role,permission,description) VALUES
 ('support','notifications.manage','Review notification delivery and connections'),('support','knowledge.manage','Manage public support content'),
 ('admin','notifications.manage','Manage notification delivery and templates'),('admin','knowledge.manage','Manage knowledge base and FAQ'),
 ('owner','notifications.manage','Manage notification delivery and templates'),('owner','knowledge.manage','Manage knowledge base and FAQ') ON CONFLICT DO NOTHING;
COMMENT ON TABLE public.notification_events IS 'Idempotent logical events consumed by the unified notification worker.';
COMMENT ON TABLE public.notification_deliveries IS 'Per-channel delivery attempts with retry and dead-letter state.';
