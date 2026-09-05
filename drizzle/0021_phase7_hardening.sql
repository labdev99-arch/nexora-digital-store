-- Phase 7 advisor remediation: cover foreign keys and collapse overlapping policies.

CREATE INDEX affiliate_accounts_approved_by_idx
  ON public.affiliate_accounts(approved_by) WHERE approved_by IS NOT NULL;
CREATE INDEX affiliate_accounts_payout_currency_idx
  ON public.affiliate_accounts(payout_currency_code);
CREATE INDEX blog_posts_author_idx
  ON public.blog_posts(author_id) WHERE author_id IS NOT NULL;
CREATE INDEX exchange_rate_history_created_by_idx
  ON public.exchange_rate_history(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX reviews_moderated_by_idx
  ON public.reviews(moderated_by) WHERE moderated_by IS NOT NULL;

DROP POLICY IF EXISTS audit_logs_staff_read ON public.audit_logs;
DROP POLICY IF EXISTS staff_read_audit_logs ON public.audit_logs;
CREATE POLICY audit_logs_staff_read ON public.audit_logs FOR SELECT TO authenticated
  USING (
    (SELECT private.app_can('audit.read'))
    OR (SELECT private.app_can('identity.manage'))
    OR (SELECT private.app_can('finance.manage'))
  );

DROP POLICY IF EXISTS reviews_public_read ON public.reviews;
DROP POLICY IF EXISTS reviews_staff_read ON public.reviews;
CREATE POLICY reviews_anon_read ON public.reviews FOR SELECT TO anon
  USING (status = 'approved' AND deleted_at IS NULL);
CREATE POLICY reviews_authenticated_read ON public.reviews FOR SELECT TO authenticated
  USING (
    (status = 'approved' AND deleted_at IS NULL)
    OR (SELECT private.app_can('reviews.manage'))
  );
