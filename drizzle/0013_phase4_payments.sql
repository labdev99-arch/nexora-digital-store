-- Phase 4: payment orchestration, manual verification and atomic wallet settlement.

CREATE TYPE payment_flow AS ENUM ('automatic', 'proof');
CREATE TYPE payment_status AS ENUM (
  'created', 'requires_action', 'awaiting_payment', 'awaiting_proof',
  'under_review', 'authorized', 'paid', 'failed', 'expired', 'cancelled',
  'partially_refunded', 'refunded', 'disputed', 'chargeback'
);
CREATE TYPE payment_verification_status AS ENUM (
  'pending', 'processing', 'needs_review', 'approved', 'rejected'
);
CREATE TYPE payment_webhook_status AS ENUM ('received', 'processed', 'ignored', 'failed');
CREATE TYPE payment_refund_status AS ENUM ('pending', 'succeeded', 'failed', 'cancelled');

CREATE TABLE payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[a-z][a-z0-9_-]{1,63}$'),
  driver text NOT NULL CHECK (driver ~ '^[a-z][a-z0-9_-]{1,63}$'),
  flow payment_flow NOT NULL,
  name jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(name) = 'object'),
  description jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(description) = 'object'),
  instructions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(instructions) = 'object'),
  enabled boolean NOT NULL DEFAULT false,
  sandbox_mode boolean NOT NULL DEFAULT true,
  min_amount bigint NOT NULL DEFAULT 100 CHECK (min_amount > 0),
  max_amount bigint NOT NULL DEFAULT 1000000 CHECK (max_amount >= min_amount),
  fee_fixed bigint NOT NULL DEFAULT 0 CHECK (fee_fixed >= 0),
  fee_bps integer NOT NULL DEFAULT 0 CHECK (fee_bps BETWEEN 0 AND 10000),
  allowed_currencies text[] NOT NULL DEFAULT ARRAY['USD']::text[],
  allowed_countries text[] NOT NULL DEFAULT '{}'::text[],
  allowed_tiers text[] NOT NULL DEFAULT ARRAY['customer']::text[],
  config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cardinality(allowed_currencies) > 0)
);
CREATE INDEX payment_methods_enabled_order_idx ON payment_methods(enabled, sort_order) WHERE deleted_at IS NULL;

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  payment_method_id uuid NOT NULL REFERENCES payment_methods(id) ON DELETE RESTRICT,
  provider_code text NOT NULL,
  purpose text NOT NULL DEFAULT 'wallet_topup' CHECK (purpose = 'wallet_topup'),
  status payment_status NOT NULL DEFAULT 'created',
  currency_code text NOT NULL REFERENCES currencies(code) ON DELETE RESTRICT,
  requested_amount bigint NOT NULL CHECK (requested_amount > 0 AND requested_amount <= 9007199254740991),
  fee_amount bigint NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  payable_amount bigint NOT NULL CHECK (payable_amount > 0),
  received_amount bigint NOT NULL DEFAULT 0 CHECK (received_amount >= 0),
  credited_amount bigint NOT NULL DEFAULT 0 CHECK (credited_amount >= 0),
  refunded_amount bigint NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0),
  payment_reference text,
  provider_payment_id text,
  provider_customer_id text,
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 160),
  client_action jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(client_action) = 'object'),
  provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provider_metadata) = 'object'),
  failure_code text,
  failure_message text,
  sandbox_mode boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  rate_locked_at timestamptz,
  rate_expires_at timestamptz,
  paid_at timestamptz,
  settled_at timestamptz,
  wallet_transaction_id uuid REFERENCES wallet_transactions(id) ON DELETE RESTRICT,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, idempotency_key),
  UNIQUE (provider_code, provider_payment_id),
  UNIQUE (payment_reference),
  CHECK (payable_amount = requested_amount + fee_amount),
  CHECK (credited_amount <= received_amount),
  CHECK (refunded_amount <= credited_amount)
);
CREATE INDEX payments_profile_created_idx ON payments(profile_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX payments_status_created_idx ON payments(status, created_at) WHERE deleted_at IS NULL;
CREATE INDEX payments_provider_reference_idx ON payments(provider_code, payment_reference) WHERE payment_reference IS NOT NULL;

CREATE TABLE payment_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  storage_path text NOT NULL UNIQUE,
  original_filename text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 10485760),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  perceptual_hash text,
  status payment_verification_status NOT NULL DEFAULT 'pending',
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_proofs_payment_idx ON payment_proofs(payment_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX payment_proofs_sha256_idx ON payment_proofs(sha256) WHERE deleted_at IS NULL;
CREATE INDEX payment_proofs_phash_idx ON payment_proofs(perceptual_hash) WHERE perceptual_hash IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE payment_proof_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proof_id uuid NOT NULL UNIQUE REFERENCES payment_proofs(id) ON DELETE RESTRICT,
  engine text NOT NULL,
  extracted_amount bigint,
  extracted_currency text,
  extracted_reference text,
  extracted_date timestamptz,
  confidence_bps integer NOT NULL DEFAULT 0 CHECK (confidence_bps BETWEEN 0 AND 10000),
  flags text[] NOT NULL DEFAULT '{}'::text[],
  duplicate_of_proof_id uuid REFERENCES payment_proofs(id) ON DELETE SET NULL,
  raw_result jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(raw_result) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payment_verification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL UNIQUE REFERENCES payments(id) ON DELETE RESTRICT,
  proof_id uuid NOT NULL UNIQUE REFERENCES payment_proofs(id) ON DELETE RESTRICT,
  status payment_verification_status NOT NULL DEFAULT 'pending',
  priority integer NOT NULL DEFAULT 100,
  claimed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status NOT IN ('approved', 'rejected')) OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND nullif(trim(review_reason), '') IS NOT NULL))
);
CREATE INDEX payment_verification_queue_work_idx ON payment_verification_queue(status, priority DESC, created_at);

CREATE TABLE payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  signature_sha256 text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status payment_webhook_status NOT NULL DEFAULT 'received',
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  error_code text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_code, provider_event_id)
);
CREATE INDEX payment_webhooks_retry_idx ON payment_webhook_events(status, created_at) WHERE status IN ('received', 'failed');

CREATE TABLE payment_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  amount bigint NOT NULL CHECK (amount > 0),
  currency_code text NOT NULL REFERENCES currencies(code) ON DELETE RESTRICT,
  provider_refund_id text,
  idempotency_key text NOT NULL UNIQUE,
  status payment_refund_status NOT NULL DEFAULT 'pending',
  reason text NOT NULL CHECK (nullif(trim(reason), '') IS NOT NULL),
  requested_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  wallet_transaction_id uuid REFERENCES wallet_transactions(id) ON DELETE RESTRICT,
  failure_code text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_refunds_payment_idx ON payment_refunds(payment_id, created_at DESC);

CREATE TABLE payment_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  provider_dispute_id text NOT NULL,
  status text NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0),
  currency_code text NOT NULL REFERENCES currencies(code) ON DELETE RESTRICT,
  reason text,
  evidence_due_at timestamptz,
  closed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_dispute_id)
);

CREATE TABLE saved_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider_code text NOT NULL,
  provider_customer_id text NOT NULL,
  provider_payment_method_id text NOT NULL,
  brand text,
  last4 text CHECK (last4 IS NULL OR last4 ~ '^[0-9]{4}$'),
  exp_month integer CHECK (exp_month BETWEEN 1 AND 12),
  exp_year integer,
  is_default boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_code, provider_payment_method_id)
);
CREATE INDEX saved_payment_methods_profile_idx ON saved_payment_methods(profile_id) WHERE deleted_at IS NULL;

CREATE TABLE crypto_payment_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL UNIQUE REFERENCES payments(id) ON DELETE RESTRICT,
  asset text NOT NULL CHECK (asset IN ('USDT', 'BTC', 'ETH')),
  network text NOT NULL CHECK (network IN ('TRC20', 'ERC20', 'BEP20', 'BITCOIN')),
  pay_address text NOT NULL,
  expected_atomic numeric(78,0) NOT NULL CHECK (expected_atomic > 0),
  received_atomic numeric(78,0) NOT NULL DEFAULT 0 CHECK (received_atomic >= 0),
  atomic_scale integer NOT NULL CHECK (atomic_scale BETWEEN 0 AND 30),
  required_confirmations integer NOT NULL CHECK (required_confirmations > 0),
  current_confirmations integer NOT NULL DEFAULT 0 CHECK (current_confirmations >= 0),
  underpayment_tolerance_bps integer NOT NULL DEFAULT 100 CHECK (underpayment_tolerance_bps BETWEEN 0 AND 10000),
  overpayment_policy text NOT NULL DEFAULT 'credit_received' CHECK (overpayment_policy IN ('credit_requested', 'credit_received', 'manual_review')),
  quote_numerator bigint NOT NULL CHECK (quote_numerator > 0),
  quote_denominator bigint NOT NULL CHECK (quote_denominator > 0),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payment_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  actor_type text NOT NULL,
  action text NOT NULL,
  request_id text,
  ip_hash text,
  before jsonb,
  after jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_audit_payment_idx ON payment_audit_logs(payment_id, created_at DESC);
CREATE UNIQUE INDEX payment_audit_request_idx ON payment_audit_logs(request_id) WHERE request_id IS NOT NULL;

-- Uniform updated_at handling.
CREATE OR REPLACE FUNCTION private.payment_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN NEW.updated_at = statement_timestamp(); RETURN NEW; END;
$$;
REVOKE ALL ON FUNCTION private.payment_touch_updated_at() FROM PUBLIC, anon, authenticated, service_role;
DO $$ DECLARE item text; BEGIN
  FOREACH item IN ARRAY ARRAY['payment_methods','payments','payment_proofs','payment_proof_checks','payment_verification_queue','payment_webhook_events','payment_refunds','payment_disputes','saved_payment_methods','crypto_payment_details']
  LOOP EXECUTE format('CREATE TRIGGER %I_touch BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION private.payment_touch_updated_at()', item, item); END LOOP;
END $$;

-- The only payment settlement path. Locks the payment, posts one idempotent
-- double-entry credit, then stores the immutable wallet transaction reference.
CREATE OR REPLACE FUNCTION settle_wallet_topup(
  p_payment_id uuid,
  p_received_amount bigint,
  p_provider_event_id text,
  p_actor_id uuid DEFAULT NULL
) RETURNS payments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target public.payments; ledger public.wallet_transactions; credit_amount bigint;
BEGIN
  IF NOT private.wallet_caller_is_finance() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'payment_finance_permission_required';
  END IF;
  SELECT * INTO target FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF target.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'payment_not_found'; END IF;
  IF target.wallet_transaction_id IS NOT NULL THEN RETURN target; END IF;
  IF target.status IN ('failed','expired','cancelled','refunded','chargeback') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'payment_not_settleable';
  END IF;
  IF p_received_amount < target.payable_amount THEN
    UPDATE public.payments SET received_amount = p_received_amount, status = 'under_review', failure_code = 'underpaid'
    WHERE id = target.id RETURNING * INTO target;
    RETURN target;
  END IF;
  credit_amount := CASE
    WHEN coalesce(target.provider_metadata->>'overpayment_policy','credit_requested') = 'credit_received'
      THEN p_received_amount - target.fee_amount ELSE target.requested_amount END;
  ledger := public.wallet_credit(
    target.profile_id, target.currency_code, credit_amount, 'topup',
    'payment:' || target.id::text, 'payment', target.id, NULL,
    jsonb_build_object('provider', target.provider_code, 'event_id', p_provider_event_id, 'sandbox', target.sandbox_mode)
  );
  IF target.fee_amount > 0 THEN
    PERFORM private.post_wallet_transfer(
      'payment.fee', 'payment-fee:' || target.id::text,
      (private.ensure_wallet(NULL, target.currency_code, 'platform_cash', 'cash:' || target.currency_code)).id,
      (private.ensure_wallet(NULL, target.currency_code, 'platform_revenue', 'revenue:' || target.currency_code)).id,
      'fee', target.fee_amount, target.currency_code, 'payment', target.id,
      'Payment processing fee', p_actor_id,
      jsonb_build_object('provider', target.provider_code, 'event_id', p_provider_event_id)
    );
  END IF;
  UPDATE public.payments SET status = 'paid', received_amount = p_received_amount,
    credited_amount = credit_amount, paid_at = coalesce(paid_at, statement_timestamp()),
    settled_at = statement_timestamp(), wallet_transaction_id = ledger.id,
    updated_at = statement_timestamp()
  WHERE id = target.id RETURNING * INTO target;
  INSERT INTO public.payment_audit_logs(payment_id, actor_id, actor_type, action, request_id, after)
  VALUES (target.id, p_actor_id, CASE WHEN p_actor_id IS NULL THEN 'system' ELSE 'staff' END,
    'payment.settled', p_provider_event_id,
    jsonb_build_object('wallet_transaction_id', ledger.id, 'credited_amount', credit_amount));
  RETURN target;
END;
$$;
REVOKE ALL ON FUNCTION settle_wallet_topup(uuid,bigint,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settle_wallet_topup(uuid,bigint,text,uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION review_payment_proof(
  p_queue_id uuid, p_approve boolean, p_reason text
) RETURNS payments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE work public.payment_verification_queue; target public.payments;
BEGIN
  IF NOT coalesce((SELECT private.app_can('finance.manage')), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'payment_finance_permission_required';
  END IF;
  IF nullif(trim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'payment_review_reason_required';
  END IF;
  SELECT * INTO work FROM public.payment_verification_queue WHERE id = p_queue_id FOR UPDATE;
  IF work.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'payment_queue_not_found'; END IF;
  IF work.status IN ('approved','rejected') THEN SELECT * INTO target FROM public.payments WHERE id=work.payment_id; RETURN target; END IF;
  UPDATE public.payment_verification_queue SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    reviewed_by = auth.uid(), reviewed_at = statement_timestamp(), review_reason = trim(p_reason)
  WHERE id = work.id;
  UPDATE public.payment_proofs SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END WHERE id = work.proof_id;
  IF p_approve THEN
    SELECT * INTO target FROM public.settle_wallet_topup(work.payment_id,
      (SELECT payable_amount FROM public.payments WHERE id=work.payment_id),
      'manual-review:' || work.id::text, auth.uid());
  ELSE
    UPDATE public.payments SET status='failed', failure_code='proof_rejected', failure_message=trim(p_reason)
    WHERE id=work.payment_id RETURNING * INTO target;
    INSERT INTO public.payment_audit_logs(payment_id,actor_id,actor_type,action,request_id,after)
    VALUES(target.id,auth.uid(),'staff','proof.rejected','manual-review:'||work.id::text,jsonb_build_object('reason',trim(p_reason)));
  END IF;
  RETURN target;
END;
$$;
REVOKE ALL ON FUNCTION review_payment_proof(uuid,boolean,text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION review_payment_proof(uuid,boolean,text) TO authenticated;

-- Append-only payment audit records.
CREATE OR REPLACE FUNCTION private.block_payment_audit_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='payment_audit_append_only'; END;
$$;
CREATE TRIGGER payment_audit_no_update_delete BEFORE UPDATE OR DELETE ON payment_audit_logs
FOR EACH ROW EXECUTE FUNCTION private.block_payment_audit_mutation();

ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_proof_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_verification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE crypto_payment_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY payment_methods_customer_read ON payment_methods FOR SELECT TO authenticated
  USING ((enabled AND deleted_at IS NULL) OR (SELECT private.app_can('finance.manage')));
CREATE POLICY payment_methods_finance_manage ON payment_methods FOR ALL TO authenticated
  USING ((SELECT private.app_can('finance.manage'))) WITH CHECK ((SELECT private.app_can('finance.manage')));
CREATE POLICY payments_owner_or_finance_read ON payments FOR SELECT TO authenticated
  USING (profile_id=(SELECT auth.uid()) OR (SELECT private.app_can('finance.manage')));
CREATE POLICY payment_proofs_owner_or_finance_read ON payment_proofs FOR SELECT TO authenticated
  USING (profile_id=(SELECT auth.uid()) OR (SELECT private.app_can('finance.manage')));
CREATE POLICY payment_proof_checks_finance_read ON payment_proof_checks FOR SELECT TO authenticated
  USING ((SELECT private.app_can('finance.manage')));
CREATE POLICY payment_queue_finance_read ON payment_verification_queue FOR SELECT TO authenticated
  USING ((SELECT private.app_can('finance.manage')));
CREATE POLICY payment_webhooks_finance_read ON payment_webhook_events FOR SELECT TO authenticated
  USING ((SELECT private.app_can('finance.manage')));
CREATE POLICY payment_refunds_owner_or_finance_read ON payment_refunds FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM payments p WHERE p.id=payment_id AND (p.profile_id=(SELECT auth.uid()) OR (SELECT private.app_can('finance.manage')))));
CREATE POLICY payment_disputes_owner_or_finance_read ON payment_disputes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM payments p WHERE p.id=payment_id AND (p.profile_id=(SELECT auth.uid()) OR (SELECT private.app_can('finance.manage')))));
CREATE POLICY saved_methods_owner_read ON saved_payment_methods FOR SELECT TO authenticated
  USING (profile_id=(SELECT auth.uid()));
CREATE POLICY saved_methods_owner_delete ON saved_payment_methods FOR DELETE TO authenticated
  USING (profile_id=(SELECT auth.uid()));
CREATE POLICY crypto_payment_owner_or_finance_read ON crypto_payment_details FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM payments p WHERE p.id=payment_id AND (p.profile_id=(SELECT auth.uid()) OR (SELECT private.app_can('finance.manage')))));
CREATE POLICY payment_audit_finance_read ON payment_audit_logs FOR SELECT TO authenticated
  USING ((SELECT private.app_can('finance.manage')));

-- Proofs are always private. A user's first path segment is their auth UUID.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('payment-proofs','payment-proofs',false,10485760,ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
CREATE POLICY payment_proofs_storage_owner_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='payment-proofs' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);
CREATE POLICY payment_proofs_storage_owner_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='payment-proofs' AND ((storage.foldername(name))[1]=(SELECT auth.uid())::text OR (SELECT private.app_can('finance.manage'))));
CREATE POLICY payment_proofs_storage_owner_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='payment-proofs' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);

INSERT INTO payment_methods(code,driver,flow,name,description,instructions,enabled,sandbox_mode,min_amount,max_amount,fee_fixed,fee_bps,allowed_currencies,sort_order,config)
VALUES
('stripe','stripe','automatic','{"en":"Card","ar":"بطاقة مصرفية"}','{"en":"Visa or Mastercard with 3D Secure","ar":"فيزا أو ماستركارد مع 3D Secure"}','{"en":["Enter your card securely","Complete bank verification if requested"],"ar":["أدخل بيانات البطاقة بأمان","أكمل تحقق المصرف عند الطلب"]}',true,true,100,1000000,0,290,ARRAY['USD','EUR','AED','SAR'],10,'{"capture_method":"automatic"}'),
('whish','whish','proof','{"en":"Whish Money","ar":"ويش موني"}','{"en":"Pay using the generated reference","ar":"ادفع باستخدام المرجع المولّد"}','{"en":["Open Whish Money","Pay the exact total using the reference","Upload a clear receipt"],"ar":["افتح Whish Money","ادفع المبلغ الإجمالي تماماً مستخدماً المرجع","ارفع صورة إيصال واضحة"]}',true,true,100,500000,0,0,ARRAY['USD','LBP'],20,'{}'),
('omt','omt','proof','{"en":"OMT","ar":"OMT"}','{"en":"Pay at an OMT branch and upload the receipt","ar":"ادفع في فرع OMT وارفع الإيصال"}','{"en":["Show the reference at OMT","Pay the exact total including the displayed fee","Upload the stamped receipt"],"ar":["أبرز المرجع في OMT","ادفع الإجمالي تماماً شاملاً الرسم الظاهر","ارفع الإيصال المختوم"]}',true,true,100,500000,100,100,ARRAY['USD','LBP'],30,'{}'),
('crypto','nowpayments','automatic','{"en":"Crypto","ar":"عملات رقمية"}','{"en":"USDT, BTC or ETH","ar":"USDT أو BTC أو ETH"}','{"en":["Choose asset and network carefully","Send the exact amount before expiry","Wait for network confirmations"],"ar":["اختر العملة والشبكة بدقة","أرسل المبلغ تماماً قبل انتهاء المهلة","انتظر تأكيدات الشبكة"]}',true,true,500,1000000,0,100,ARRAY['USD','EUR'],40,'{"rate_lock_minutes":20,"confirmations":{"BTC":2,"ETH":12,"USDT_TRC20":20,"USDT_ERC20":12,"USDT_BEP20":15}}'),
('bank_transfer','manual_bank','proof','{"en":"Bank transfer","ar":"تحويل مصرفي"}','{"en":"Transfer and upload proof","ar":"حوّل وارفع إثبات الدفع"}','{"en":["Copy the reference into transfer notes","Transfer the exact total","Upload the bank confirmation"],"ar":["انسخ المرجع في ملاحظات التحويل","حوّل الإجمالي تماماً","ارفع تأكيد المصرف"]}',true,true,1000,2000000,0,0,ARRAY['USD','EUR','LBP'],50,'{}'),
('cash','manual_cash','proof','{"en":"Cash deposit","ar":"إيداع نقدي"}','{"en":"Deposit using the generated reference","ar":"أودع نقداً باستخدام المرجع المولّد"}','{"en":["Use an approved cash point","Keep the generated reference","Upload the stamped receipt"],"ar":["استخدم نقطة نقدية معتمدة","احتفظ بالمرجع المولّد","ارفع الإيصال المختوم"]}',true,true,500,500000,0,0,ARRAY['USD','LBP'],60,'{}')
ON CONFLICT(code) DO NOTHING;

COMMENT ON TABLE payment_methods IS 'Data-driven provider availability, limits, fees and localized instructions. Credentials remain environment-only.';
COMMENT ON FUNCTION settle_wallet_topup(uuid,bigint,text,uuid) IS 'Atomic, idempotent payment-to-double-entry-wallet settlement.';
