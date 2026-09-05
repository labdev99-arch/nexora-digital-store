-- Refunds reserve customer funds before contacting an external gateway, then
-- atomically capture the hold after success. This prevents provider/ledger drift.

CREATE OR REPLACE FUNCTION reserve_payment_refund(p_refund_id uuid)
RETURNS wallet_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE request public.payment_refunds; target public.payments; held public.wallet_transactions;
BEGIN
  IF NOT private.wallet_caller_is_finance() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='payment_finance_permission_required'; END IF;
  SELECT * INTO request FROM public.payment_refunds WHERE id=p_refund_id FOR UPDATE;
  IF request.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='payment_refund_not_found'; END IF;
  SELECT * INTO target FROM public.payments WHERE id=request.payment_id FOR UPDATE;
  IF target.status NOT IN ('paid','partially_refunded') OR request.amount > target.credited_amount-target.refunded_amount THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='payment_refund_amount_invalid';
  END IF;
  held := public.wallet_hold(target.profile_id,target.currency_code,request.amount,
    'payment-refund-reserve:'||request.id::text,'payment_refund',request.id,
    jsonb_build_object('payment_id',target.id));
  INSERT INTO public.payment_audit_logs(payment_id,actor_id,actor_type,action,request_id,after)
  VALUES(target.id,request.requested_by,'staff','refund.reserved','refund-reserve:'||request.id::text,
    jsonb_build_object('refund_id',request.id,'hold_transaction_id',held.id,'amount',request.amount));
  RETURN held;
END;
$$;

CREATE OR REPLACE FUNCTION finalize_payment_refund(
  p_refund_id uuid,p_provider_refund_id text
) RETURNS payment_refunds
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE request public.payment_refunds; target public.payments; held public.wallets; cash public.wallets; ledger public.wallet_transactions;
BEGIN
  IF NOT private.wallet_caller_is_finance() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='payment_finance_permission_required'; END IF;
  SELECT * INTO request FROM public.payment_refunds WHERE id=p_refund_id FOR UPDATE;
  IF request.status='succeeded' THEN RETURN request; END IF;
  IF request.status<>'pending' THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='payment_refund_not_finalizable'; END IF;
  SELECT * INTO target FROM public.payments WHERE id=request.payment_id FOR UPDATE;
  held := private.ensure_wallet(target.profile_id,target.currency_code,'customer_hold','held');
  cash := private.ensure_wallet(NULL,target.currency_code,'platform_cash','cash:'||target.currency_code);
  ledger := private.post_wallet_transfer('payment.refund','payment-refund-capture:'||request.id::text,
    held.id,cash.id,'chargeback',request.amount,target.currency_code,'payment_refund',request.id,
    request.reason,request.requested_by,jsonb_build_object('payment_id',target.id,'provider_refund_id',p_provider_refund_id));
  UPDATE public.payment_refunds SET status='succeeded',provider_refund_id=p_provider_refund_id,
    wallet_transaction_id=ledger.id,completed_at=statement_timestamp(),updated_at=statement_timestamp()
  WHERE id=request.id RETURNING * INTO request;
  UPDATE public.payments SET refunded_amount=refunded_amount+request.amount,
    status=CASE WHEN refunded_amount+request.amount>=credited_amount THEN 'refunded' ELSE 'partially_refunded' END,
    updated_at=statement_timestamp() WHERE id=target.id;
  INSERT INTO public.payment_audit_logs(payment_id,actor_id,actor_type,action,request_id,after)
  VALUES(target.id,request.requested_by,'staff','refund.succeeded','refund-finalize:'||request.id::text,
    jsonb_build_object('refund_id',request.id,'provider_refund_id',p_provider_refund_id,'wallet_transaction_id',ledger.id));
  RETURN request;
END;
$$;

REVOKE ALL ON FUNCTION reserve_payment_refund(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION finalize_payment_refund(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION reserve_payment_refund(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION finalize_payment_refund(uuid,text) TO service_role;

COMMENT ON FUNCTION reserve_payment_refund(uuid) IS 'Idempotently holds wallet funds before an external provider refund.';
COMMENT ON FUNCTION finalize_payment_refund(uuid,text) IS 'Captures a refund hold to platform cash and records the provider result atomically.';
