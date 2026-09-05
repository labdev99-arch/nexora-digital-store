-- Advisor-driven hardening: keep settlement service-only, expose an invoker
-- wrapper for finance proof review, avoid overlapping policies, and cover FKs.

REVOKE EXECUTE ON FUNCTION settle_wallet_topup(uuid,bigint,text,uuid) FROM authenticated;

ALTER FUNCTION public.review_payment_proof(uuid,boolean,text) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.review_payment_proof(uuid,boolean,text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION private.review_payment_proof(uuid,boolean,text) TO authenticated;

CREATE FUNCTION public.review_payment_proof(
  p_queue_id uuid, p_approve boolean, p_reason text
) RETURNS public.payments
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT private.review_payment_proof(p_queue_id,p_approve,p_reason);
$$;
REVOKE ALL ON FUNCTION public.review_payment_proof(uuid,boolean,text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.review_payment_proof(uuid,boolean,text) TO authenticated;

DROP POLICY payment_methods_finance_manage ON payment_methods;
CREATE POLICY payment_methods_finance_insert ON payment_methods FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.app_can('finance.manage')));
CREATE POLICY payment_methods_finance_update ON payment_methods FOR UPDATE TO authenticated
  USING ((SELECT private.app_can('finance.manage'))) WITH CHECK ((SELECT private.app_can('finance.manage')));
CREATE POLICY payment_methods_finance_delete ON payment_methods FOR DELETE TO authenticated
  USING ((SELECT private.app_can('finance.manage')));

CREATE INDEX payment_methods_created_by_idx ON payment_methods(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX payment_methods_updated_by_idx ON payment_methods(updated_by) WHERE updated_by IS NOT NULL;
CREATE INDEX payments_method_idx ON payments(payment_method_id);
CREATE INDEX payments_currency_idx ON payments(currency_code);
CREATE INDEX payments_wallet_transaction_idx ON payments(wallet_transaction_id) WHERE wallet_transaction_id IS NOT NULL;
CREATE INDEX payment_proofs_profile_idx ON payment_proofs(profile_id);
CREATE INDEX payment_proof_checks_duplicate_idx ON payment_proof_checks(duplicate_of_proof_id) WHERE duplicate_of_proof_id IS NOT NULL;
CREATE INDEX payment_queue_claimed_by_idx ON payment_verification_queue(claimed_by) WHERE claimed_by IS NOT NULL;
CREATE INDEX payment_queue_reviewed_by_idx ON payment_verification_queue(reviewed_by) WHERE reviewed_by IS NOT NULL;
CREATE INDEX payment_webhooks_payment_idx ON payment_webhook_events(payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX payment_refunds_currency_idx ON payment_refunds(currency_code);
CREATE INDEX payment_refunds_requested_by_idx ON payment_refunds(requested_by) WHERE requested_by IS NOT NULL;
CREATE INDEX payment_refunds_wallet_tx_idx ON payment_refunds(wallet_transaction_id) WHERE wallet_transaction_id IS NOT NULL;
CREATE INDEX payment_disputes_payment_idx ON payment_disputes(payment_id);
CREATE INDEX payment_disputes_currency_idx ON payment_disputes(currency_code);
CREATE INDEX payment_audit_actor_idx ON payment_audit_logs(actor_id,created_at DESC) WHERE actor_id IS NOT NULL;

COMMENT ON FUNCTION public.review_payment_proof(uuid,boolean,text) IS
  'Security-invoker PostgREST wrapper. The private implementation performs a live finance permission check.';
