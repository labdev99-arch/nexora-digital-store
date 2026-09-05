-- Keep public catalogue/reference reads independent from privileged permission checks.
-- Anonymous callers cannot execute private.app_can(), so public and staff visibility
-- must be expressed as separate permissive policies.

DROP POLICY IF EXISTS "read_enabled_or_manage_locales" ON public.locales;
DROP POLICY IF EXISTS "public_read_enabled_locales" ON public.locales;
DROP POLICY IF EXISTS "staff_read_all_locales" ON public.locales;

CREATE POLICY "public_read_enabled_locales"
  ON public.locales
  FOR SELECT
  TO anon, authenticated
  USING (enabled);

CREATE POLICY "staff_read_all_locales"
  ON public.locales
  FOR SELECT
  TO authenticated
  USING ((SELECT private.app_can('settings.manage')));

DROP POLICY IF EXISTS "read_enabled_or_manage_currencies" ON public.currencies;
DROP POLICY IF EXISTS "public_read_enabled_currencies" ON public.currencies;
DROP POLICY IF EXISTS "staff_read_all_currencies" ON public.currencies;

CREATE POLICY "public_read_enabled_currencies"
  ON public.currencies
  FOR SELECT
  TO anon, authenticated
  USING (enabled);

CREATE POLICY "staff_read_all_currencies"
  ON public.currencies
  FOR SELECT
  TO authenticated
  USING ((SELECT private.app_can('settings.manage')));

DROP POLICY IF EXISTS "support_categories_public_read" ON public.support_ticket_categories;
DROP POLICY IF EXISTS "support_categories_staff_read" ON public.support_ticket_categories;

CREATE POLICY "support_categories_public_read"
  ON public.support_ticket_categories
  FOR SELECT
  TO anon, authenticated
  USING (active AND deleted_at IS NULL);

CREATE POLICY "support_categories_staff_read"
  ON public.support_ticket_categories
  FOR SELECT
  TO authenticated
  USING ((SELECT private.app_can('support.manage')));

DROP POLICY IF EXISTS "knowledge_categories_public_read" ON public.knowledge_categories;
DROP POLICY IF EXISTS "knowledge_categories_staff_read" ON public.knowledge_categories;

CREATE POLICY "knowledge_categories_public_read"
  ON public.knowledge_categories
  FOR SELECT
  TO anon, authenticated
  USING (active AND deleted_at IS NULL);

CREATE POLICY "knowledge_categories_staff_read"
  ON public.knowledge_categories
  FOR SELECT
  TO authenticated
  USING ((SELECT private.app_can('content.manage')));

DROP POLICY IF EXISTS "knowledge_articles_public_read" ON public.knowledge_articles;
DROP POLICY IF EXISTS "knowledge_articles_staff_read" ON public.knowledge_articles;

CREATE POLICY "knowledge_articles_public_read"
  ON public.knowledge_articles
  FOR SELECT
  TO anon, authenticated
  USING (status = 'published' AND deleted_at IS NULL AND published_at <= now());

CREATE POLICY "knowledge_articles_staff_read"
  ON public.knowledge_articles
  FOR SELECT
  TO authenticated
  USING ((SELECT private.app_can('content.manage')));

DROP POLICY IF EXISTS "knowledge_faqs_public_read" ON public.knowledge_faqs;
DROP POLICY IF EXISTS "knowledge_faqs_staff_read" ON public.knowledge_faqs;

CREATE POLICY "knowledge_faqs_public_read"
  ON public.knowledge_faqs
  FOR SELECT
  TO anon, authenticated
  USING (active AND deleted_at IS NULL);

CREATE POLICY "knowledge_faqs_staff_read"
  ON public.knowledge_faqs
  FOR SELECT
  TO authenticated
  USING ((SELECT private.app_can('content.manage')));
