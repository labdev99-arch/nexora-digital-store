-- Phase 7: administration, analytics, content operations, and auditability.

CREATE TYPE admin_content_status AS ENUM ('draft', 'scheduled', 'published', 'archived');
CREATE TYPE homepage_section_type AS ENUM (
  'hero', 'banner', 'product_carousel', 'categories_grid', 'testimonials', 'faq'
);
CREATE TYPE support_ticket_status AS ENUM (
  'open', 'in_progress', 'waiting_customer', 'resolved', 'closed'
);
CREATE TYPE support_ticket_priority AS ENUM ('low', 'normal', 'high', 'urgent');
CREATE TYPE review_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE affiliate_account_status AS ENUM ('pending', 'active', 'suspended', 'closed');

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS ip_address inet,
  ADD COLUMN IF NOT EXISTS user_agent text;

CREATE INDEX IF NOT EXISTS audit_logs_action_created_idx
  ON public.audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_ip_created_idx
  ON public.audit_logs(ip_address, created_at DESC)
  WHERE ip_address IS NOT NULL;

CREATE TABLE public.customer_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[a-z][a-z0-9_-]{1,63}$'),
  name jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(name) = 'object'),
  description jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(description) = 'object'),
  minimum_lifetime_spend bigint NOT NULL DEFAULT 0 CHECK (minimum_lifetime_spend >= 0),
  discount_bps integer NOT NULL DEFAULT 0 CHECK (discount_bps BETWEEN 0 AND 10000),
  points_multiplier_bps integer NOT NULL DEFAULT 10000 CHECK (points_multiplier_bps > 0),
  priority_queue boolean NOT NULL DEFAULT false,
  benefits jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(benefits) = 'array'),
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.loyalty_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[a-z][a-z0-9_.-]{1,95}$'),
  name jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(name) = 'object'),
  rule_kind text NOT NULL CHECK (rule_kind IN ('earn', 'burn', 'expiry', 'streak', 'seasonal_multiplier')),
  points_value bigint NOT NULL DEFAULT 0,
  amount_minor bigint NOT NULL DEFAULT 0 CHECK (amount_minor >= 0),
  multiplier_bps integer NOT NULL DEFAULT 10000 CHECK (multiplier_bps > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(configuration) = 'object'),
  active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX loyalty_rules_active_schedule_idx
  ON public.loyalty_rules(active, starts_at, ends_at) WHERE deleted_at IS NULL;

CREATE TABLE public.affiliate_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE RESTRICT,
  referral_code text NOT NULL UNIQUE CHECK (referral_code ~ '^[A-Z0-9_-]{4,32}$'),
  status affiliate_account_status NOT NULL DEFAULT 'pending',
  commission_bps integer NOT NULL DEFAULT 0 CHECK (commission_bps BETWEEN 0 AND 10000),
  fixed_commission_amount bigint NOT NULL DEFAULT 0 CHECK (fixed_commission_amount >= 0),
  payout_currency_code text NOT NULL REFERENCES public.currencies(code) ON DELETE RESTRICT,
  fraud_score integer NOT NULL DEFAULT 0 CHECK (fraud_score BETWEEN 0 AND 100),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX affiliate_accounts_status_created_idx
  ON public.affiliate_accounts(status, created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text NOT NULL UNIQUE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  category text NOT NULL,
  subject text NOT NULL,
  description text NOT NULL,
  status support_ticket_status NOT NULL DEFAULT 'open',
  priority support_ticket_priority NOT NULL DEFAULT 'normal',
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sla_due_at timestamptz,
  resolved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_tickets_queue_idx
  ON public.support_tickets(status, priority, sla_due_at, created_at) WHERE deleted_at IS NULL;
CREATE INDEX support_tickets_profile_idx
  ON public.support_tickets(profile_id, created_at DESC) WHERE profile_id IS NOT NULL;
CREATE INDEX support_tickets_order_idx
  ON public.support_tickets(order_id, created_at DESC) WHERE order_id IS NOT NULL;
CREATE INDEX support_tickets_assignee_idx
  ON public.support_tickets(assigned_to, status) WHERE assigned_to IS NOT NULL;

CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  order_item_id uuid NOT NULL UNIQUE REFERENCES public.order_items(id) ON DELETE RESTRICT,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title text,
  body text,
  image_paths jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(image_paths) = 'array'),
  status review_status NOT NULL DEFAULT 'pending',
  seller_reply text,
  seller_replied_at timestamptz,
  moderated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  moderated_at timestamptz,
  moderation_reason text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reviews_product_status_created_idx
  ON public.reviews(product_id, status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX reviews_profile_idx ON public.reviews(profile_id, created_at DESC);

CREATE TABLE public.blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(title) = 'object'),
  excerpt jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(excerpt) = 'object'),
  body_mdx jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(body_mdx) = 'object'),
  seo jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(seo) = 'object'),
  cover_image_path text,
  status admin_content_status NOT NULL DEFAULT 'draft',
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  publish_at timestamptz,
  published_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX blog_posts_publish_idx
  ON public.blog_posts(status, publish_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE public.content_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  page_kind text NOT NULL DEFAULT 'standard' CHECK (page_kind IN ('standard', 'legal', 'landing')),
  title jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(title) = 'object'),
  body_mdx jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(body_mdx) = 'object'),
  seo jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(seo) = 'object'),
  status admin_content_status NOT NULL DEFAULT 'draft',
  publish_at timestamptz,
  published_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX content_pages_publish_idx
  ON public.content_pages(status, publish_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE public.homepage_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(content) = 'object'),
  image_path text,
  mobile_image_path text,
  link_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX homepage_banners_schedule_idx
  ON public.homepage_banners(active, starts_at, ends_at, sort_order) WHERE deleted_at IS NULL;

CREATE TABLE public.homepage_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_type homepage_section_type NOT NULL,
  internal_name text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(content) = 'object'),
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(configuration) = 'object'),
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX homepage_sections_render_idx
  ON public.homepage_sections(active, sort_order, starts_at, ends_at) WHERE deleted_at IS NULL;

CREATE TABLE public.notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL CHECK (template_key ~ '^[a-z][a-z0-9_.-]{1,127}$'),
  channel text NOT NULL CHECK (channel IN ('email', 'whatsapp', 'telegram', 'push', 'in_app')),
  locale_code text NOT NULL REFERENCES public.locales(code) ON DELETE RESTRICT,
  subject text,
  body text NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(variables) = 'array'),
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(template_key, channel, locale_code)
);
CREATE INDEX notification_templates_locale_channel_idx
  ON public.notification_templates(locale_code, channel, active) WHERE deleted_at IS NULL;

CREATE TABLE public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE CHECK (key ~ '^[a-z][a-z0-9_.-]{1,127}$'),
  name jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(name) = 'object'),
  description jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(description) = 'object'),
  enabled boolean NOT NULL DEFAULT false,
  rollout_percentage integer NOT NULL DEFAULT 0 CHECK (rollout_percentage BETWEEN 0 AND 100),
  rules jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(rules) = 'object'),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.platform_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE CHECK (key ~ '^[a-z][a-z0-9_.-]{1,127}$'),
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  category text NOT NULL CHECK (category IN ('general', 'seo', 'maintenance', 'legal', 'fees', 'security')),
  is_secret boolean NOT NULL DEFAULT false,
  description jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(description) = 'object'),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_settings_category_idx
  ON public.platform_settings(category, key) WHERE deleted_at IS NULL;

CREATE TABLE public.exchange_rate_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  currency_code text NOT NULL REFERENCES public.currencies(code) ON DELETE RESTRICT,
  rate_minor bigint NOT NULL CHECK (rate_minor > 0),
  rate_scale integer NOT NULL CHECK (rate_scale BETWEEN 0 AND 12),
  source text NOT NULL,
  manual_override boolean NOT NULL DEFAULT false,
  effective_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exchange_rate_history_currency_effective_idx
  ON public.exchange_rate_history(currency_code, effective_at DESC);

CREATE TABLE public.admin_saved_filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  resource text NOT NULL,
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(filters) = 'object'),
  sort jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(sort) = 'object'),
  is_default boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id, resource, name)
);
CREATE INDEX admin_saved_filters_owner_resource_idx
  ON public.admin_saved_filters(owner_id, resource) WHERE deleted_at IS NULL;

DO $$
DECLARE item text;
BEGIN
  FOREACH item IN ARRAY ARRAY[
    'customer_tiers', 'loyalty_rules', 'affiliate_accounts', 'support_tickets',
    'reviews', 'blog_posts', 'content_pages', 'homepage_banners', 'homepage_sections',
    'notification_templates', 'feature_flags', 'platform_settings',
    'exchange_rate_history', 'admin_saved_filters'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      item,
      item
    );
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', item);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION private.block_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'audit_log_is_append_only';
END;
$$;
REVOKE ALL ON FUNCTION private.block_audit_log_mutation()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS audit_logs_append_only ON public.audit_logs;
CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION private.block_audit_log_mutation();

INSERT INTO public.role_permissions(role, permission, description) VALUES
  ('support', 'admin.access', 'Access support administration'),
  ('support', 'orders.manage', 'Manage customer orders'),
  ('support', 'reviews.manage', 'Moderate reviews'),
  ('fulfiller', 'admin.access', 'Access fulfillment administration'),
  ('finance', 'admin.access', 'Access finance administration'),
  ('finance', 'analytics.read', 'Read business analytics'),
  ('finance', 'audit.read', 'Read financial audit records'),
  ('admin', 'analytics.read', 'Read business analytics'),
  ('admin', 'audit.read', 'Read audit records'),
  ('admin', 'content.manage', 'Manage localized content'),
  ('admin', 'marketing.manage', 'Manage promotions and homepage content'),
  ('admin', 'reviews.manage', 'Moderate reviews'),
  ('admin', 'loyalty.manage', 'Manage tiers and loyalty rules'),
  ('admin', 'affiliate.manage', 'Manage affiliate accounts'),
  ('admin', 'import_export.manage', 'Run administrative imports and exports'),
  ('owner', 'analytics.read', 'Read business analytics'),
  ('owner', 'audit.read', 'Read audit records'),
  ('owner', 'content.manage', 'Manage localized content'),
  ('owner', 'marketing.manage', 'Manage promotions and homepage content'),
  ('owner', 'reviews.manage', 'Moderate reviews'),
  ('owner', 'loyalty.manage', 'Manage tiers and loyalty rules'),
  ('owner', 'affiliate.manage', 'Manage affiliate accounts'),
  ('owner', 'import_export.manage', 'Run administrative imports and exports')
ON CONFLICT DO NOTHING;

CREATE POLICY customer_tiers_staff_read ON public.customer_tiers FOR SELECT TO authenticated
  USING ((SELECT private.app_can('loyalty.manage')));
CREATE POLICY loyalty_rules_staff_read ON public.loyalty_rules FOR SELECT TO authenticated
  USING ((SELECT private.app_can('loyalty.manage')));
CREATE POLICY affiliate_accounts_staff_read ON public.affiliate_accounts FOR SELECT TO authenticated
  USING ((SELECT private.app_can('affiliate.manage')));
CREATE POLICY support_tickets_staff_read ON public.support_tickets FOR SELECT TO authenticated
  USING ((SELECT private.app_can('support.manage')));
CREATE POLICY reviews_staff_read ON public.reviews FOR SELECT TO authenticated
  USING ((SELECT private.app_can('reviews.manage')));
CREATE POLICY reviews_public_read ON public.reviews FOR SELECT TO anon, authenticated
  USING (status = 'approved' AND deleted_at IS NULL);
CREATE POLICY blog_posts_public_read ON public.blog_posts FOR SELECT TO anon, authenticated
  USING (status = 'published' AND deleted_at IS NULL AND (publish_at IS NULL OR publish_at <= now()));
CREATE POLICY content_pages_public_read ON public.content_pages FOR SELECT TO anon, authenticated
  USING (status = 'published' AND deleted_at IS NULL AND (publish_at IS NULL OR publish_at <= now()));
CREATE POLICY homepage_banners_public_read ON public.homepage_banners FOR SELECT TO anon, authenticated
  USING (active AND deleted_at IS NULL AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now()));
CREATE POLICY homepage_sections_public_read ON public.homepage_sections FOR SELECT TO anon, authenticated
  USING (active AND deleted_at IS NULL AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now()));
CREATE POLICY notification_templates_staff_read ON public.notification_templates FOR SELECT TO authenticated
  USING ((SELECT private.app_can('settings.manage')));
CREATE POLICY feature_flags_staff_read ON public.feature_flags FOR SELECT TO authenticated
  USING ((SELECT private.app_can('settings.manage')));
CREATE POLICY platform_settings_staff_read ON public.platform_settings FOR SELECT TO authenticated
  USING ((SELECT private.app_can('settings.manage')) AND NOT is_secret);
CREATE POLICY exchange_rate_history_staff_read ON public.exchange_rate_history FOR SELECT TO authenticated
  USING ((SELECT private.app_can('finance.manage')) OR (SELECT private.app_can('settings.manage')));
CREATE POLICY admin_saved_filters_owner_all ON public.admin_saved_filters FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE POLICY audit_logs_staff_read ON public.audit_logs FOR SELECT TO authenticated
  USING ((SELECT private.app_can('audit.read')));

REVOKE ALL ON TABLE
  public.customer_tiers, public.loyalty_rules, public.affiliate_accounts,
  public.support_tickets, public.notification_templates, public.feature_flags,
  public.platform_settings, public.exchange_rate_history, public.admin_saved_filters
FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE
  public.reviews, public.blog_posts, public.content_pages,
  public.homepage_banners, public.homepage_sections
FROM anon, authenticated;

GRANT SELECT ON TABLE
  public.reviews, public.blog_posts, public.content_pages,
  public.homepage_banners, public.homepage_sections
TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_saved_filters TO authenticated;

GRANT ALL ON TABLE
  public.customer_tiers, public.loyalty_rules, public.affiliate_accounts,
  public.support_tickets, public.reviews, public.blog_posts, public.content_pages,
  public.homepage_banners, public.homepage_sections, public.notification_templates,
  public.feature_flags, public.platform_settings, public.exchange_rate_history,
  public.admin_saved_filters
TO service_role;

REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.audit_logs TO service_role;

INSERT INTO public.customer_tiers(
  code, name, description, minimum_lifetime_spend, discount_bps,
  points_multiplier_bps, priority_queue, sort_order
) VALUES
  ('bronze', '{"en":"Bronze","ar":"برونزي"}', '{"en":"Member benefits","ar":"مزايا العضوية"}', 0, 0, 10000, false, 10),
  ('silver', '{"en":"Silver","ar":"فضي"}', '{"en":"Growing customer benefits","ar":"مزايا للعملاء النشطين"}', 25000, 200, 11000, false, 20),
  ('gold', '{"en":"Gold","ar":"ذهبي"}', '{"en":"Priority benefits","ar":"مزايا أولوية"}', 100000, 500, 12500, true, 30),
  ('platinum', '{"en":"Platinum","ar":"بلاتيني"}', '{"en":"Premium priority benefits","ar":"مزايا أولوية مميزة"}', 500000, 800, 15000, true, 40)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.platform_settings(key, value, category, description) VALUES
  ('maintenance.enabled', 'false', 'maintenance', '{"en":"Maintenance mode","ar":"وضع الصيانة"}'),
  ('seo.defaults', '{"title":"Nexora","description":"Premium digital goods and services"}', 'seo', '{"en":"Default SEO metadata","ar":"بيانات SEO الافتراضية"}'),
  ('legal.terms_slug', '"terms"', 'legal', '{"en":"Terms page slug","ar":"مسار صفحة الشروط"}')
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.audit_logs IS 'Append-only administrative and system audit trail with before/after snapshots.';
COMMENT ON TABLE public.homepage_sections IS 'Scheduled, localized, drag-sortable homepage composition.';
COMMENT ON TABLE public.notification_templates IS 'Localized multi-channel templates with declared preview variables.';

