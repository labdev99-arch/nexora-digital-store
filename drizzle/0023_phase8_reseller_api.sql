-- Phase 8: reseller tiers, signed API access, compatibility, and outgoing webhooks.

CREATE TYPE reseller_account_status AS ENUM ('pending', 'active', 'suspended', 'closed');
CREATE TYPE reseller_api_environment AS ENUM ('sandbox', 'live');
CREATE TYPE reseller_webhook_delivery_status AS ENUM ('pending', 'processing', 'delivered', 'retrying', 'dead_letter');

CREATE TABLE public.reseller_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[a-z][a-z0-9_-]{1,31}$'),
  name jsonb NOT NULL CHECK (jsonb_typeof(name) = 'object'),
  description jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(description) = 'object'),
  minimum_30d_volume bigint NOT NULL DEFAULT 0 CHECK (minimum_30d_volume >= 0),
  threshold_currency_code text NOT NULL DEFAULT 'USD' REFERENCES public.currencies(code) ON UPDATE CASCADE,
  default_credit_limit bigint NOT NULL DEFAULT 0 CHECK (default_credit_limit >= 0),
  credit_currency_code text NOT NULL DEFAULT 'USD' REFERENCES public.currencies(code) ON UPDATE CASCADE,
  api_rate_limit_per_minute integer NOT NULL DEFAULT 60 CHECK (api_rate_limit_per_minute BETWEEN 1 AND 10000),
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reseller_tiers_upgrade_idx
  ON public.reseller_tiers(active, minimum_30d_volume DESC) WHERE deleted_at IS NULL;

CREATE TABLE public.reseller_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status reseller_account_status NOT NULL DEFAULT 'pending',
  current_tier_id uuid NOT NULL REFERENCES public.reseller_tiers(id) ON DELETE RESTRICT,
  manual_tier_id uuid REFERENCES public.reseller_tiers(id) ON DELETE RESTRICT,
  manual_override_reason text,
  manual_override_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  manual_override_at timestamptz,
  volume_30d_amount bigint NOT NULL DEFAULT 0 CHECK (volume_30d_amount >= 0),
  volume_currency_code text NOT NULL DEFAULT 'USD' REFERENCES public.currencies(code) ON UPDATE CASCADE,
  credit_limit_override bigint CHECK (credit_limit_override IS NULL OR credit_limit_override >= 0),
  credit_currency_code text NOT NULL DEFAULT 'USD' REFERENCES public.currencies(code) ON UPDATE CASCADE,
  low_balance_threshold bigint NOT NULL DEFAULT 0 CHECK (low_balance_threshold >= 0),
  last_low_balance_alert_at timestamptz,
  auto_upgrade_enabled boolean NOT NULL DEFAULT true,
  last_evaluated_at timestamptz,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reseller_manual_override_reason_ck CHECK (
    manual_tier_id IS NULL OR char_length(trim(manual_override_reason)) >= 3
  )
);
CREATE INDEX reseller_accounts_status_tier_idx
  ON public.reseller_accounts(status, current_tier_id) WHERE deleted_at IS NULL;
CREATE INDEX reseller_accounts_manual_tier_idx
  ON public.reseller_accounts(manual_tier_id) WHERE manual_tier_id IS NOT NULL;
CREATE INDEX reseller_accounts_override_actor_idx
  ON public.reseller_accounts(manual_override_by) WHERE manual_override_by IS NOT NULL;
CREATE INDEX reseller_accounts_approver_idx
  ON public.reseller_accounts(approved_by) WHERE approved_by IS NOT NULL;

CREATE TABLE public.reseller_tier_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_account_id uuid NOT NULL REFERENCES public.reseller_accounts(id) ON DELETE RESTRICT,
  from_tier_id uuid REFERENCES public.reseller_tiers(id) ON DELETE RESTRICT,
  to_tier_id uuid NOT NULL REFERENCES public.reseller_tiers(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('automatic_upgrade', 'automatic_downgrade', 'manual_override', 'manual_override_removed')),
  volume_30d_amount bigint NOT NULL DEFAULT 0 CHECK (volume_30d_amount >= 0),
  currency_code text NOT NULL REFERENCES public.currencies(code) ON UPDATE CASCADE,
  reason text,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reseller_tier_events_account_created_idx
  ON public.reseller_tier_events(reseller_account_id, created_at DESC);
CREATE INDEX reseller_tier_events_actor_idx
  ON public.reseller_tier_events(actor_id) WHERE actor_id IS NOT NULL;

CREATE TABLE public.reseller_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_account_id uuid NOT NULL REFERENCES public.reseller_accounts(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 80),
  key_prefix text NOT NULL UNIQUE CHECK (key_prefix ~ '^nx_(test|live)_[a-f0-9]{16}$'),
  key_hash text NOT NULL UNIQUE CHECK (key_hash ~ '^[a-f0-9]{64}$'),
  signing_secret_ciphertext text NOT NULL,
  environment reseller_api_environment NOT NULL,
  scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  rate_limit_per_minute integer NOT NULL CHECK (rate_limit_per_minute BETWEEN 1 AND 10000),
  ip_allowlist inet[] NOT NULL DEFAULT ARRAY[]::inet[],
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reseller_api_keys_scopes_ck CHECK (cardinality(scopes) BETWEEN 1 AND 20)
);
CREATE INDEX reseller_api_keys_account_created_idx
  ON public.reseller_api_keys(reseller_account_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE public.reseller_api_nonces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid NOT NULL REFERENCES public.reseller_api_keys(id) ON DELETE CASCADE,
  nonce text NOT NULL CHECK (char_length(nonce) BETWEEN 8 AND 128),
  request_timestamp timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(api_key_id, nonce)
);
CREATE INDEX reseller_api_nonces_expiry_idx ON public.reseller_api_nonces(expires_at);

CREATE TABLE public.reseller_api_rate_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid NOT NULL REFERENCES public.reseller_api_keys(id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(api_key_id, window_started_at)
);
CREATE INDEX reseller_api_rate_windows_expiry_idx ON public.reseller_api_rate_windows(window_started_at);

CREATE TABLE public.reseller_api_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_account_id uuid NOT NULL REFERENCES public.reseller_accounts(id) ON DELETE CASCADE,
  scope text NOT NULL,
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 160),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  response_status integer,
  response_body jsonb,
  resource_type text,
  resource_id uuid,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(reseller_account_id, scope, idempotency_key)
);
CREATE INDEX reseller_api_idempotency_expiry_idx ON public.reseller_api_idempotency(expires_at);

CREATE TABLE public.reseller_sandbox_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_account_id uuid NOT NULL REFERENCES public.reseller_accounts(id) ON DELETE CASCADE,
  sandbox_order_number text NOT NULL UNIQUE DEFAULT ('SBX-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  idempotency_key text NOT NULL,
  currency_code text NOT NULL REFERENCES public.currencies(code) ON UPDATE CASCADE,
  total_amount bigint NOT NULL CHECK (total_amount >= 0),
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('processing', 'completed', 'failed')),
  request jsonb NOT NULL CHECK (jsonb_typeof(request) = 'object'),
  response jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(response) = 'object'),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(reseller_account_id, idempotency_key)
);
CREATE INDEX reseller_sandbox_orders_account_created_idx
  ON public.reseller_sandbox_orders(reseller_account_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE public.reseller_webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_account_id uuid NOT NULL REFERENCES public.reseller_accounts(id) ON DELETE CASCADE,
  url text NOT NULL CHECK (url ~ '^https://'),
  description text,
  secret_ciphertext text NOT NULL,
  events text[] NOT NULL,
  active boolean NOT NULL DEFAULT true,
  failure_count integer NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  last_delivery_at timestamptz,
  disabled_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reseller_webhook_events_ck CHECK (
    cardinality(events) BETWEEN 1 AND 10
    AND events <@ ARRAY['order.updated','order.delivered','order.failed','balance.low']::text[]
  )
);
CREATE INDEX reseller_webhook_endpoints_account_idx
  ON public.reseller_webhook_endpoints(reseller_account_id, active) WHERE deleted_at IS NULL;

CREATE TABLE public.reseller_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid NOT NULL REFERENCES public.reseller_webhook_endpoints(id) ON DELETE RESTRICT,
  event_id uuid NOT NULL,
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  signature text,
  status reseller_webhook_delivery_status NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 8 CHECK (max_attempts BETWEEN 1 AND 20),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  response_status integer,
  response_body_safe text,
  last_error_code text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(endpoint_id, event_id, event_type)
);
CREATE INDEX reseller_webhook_deliveries_queue_idx
  ON public.reseller_webhook_deliveries(status, next_attempt_at, created_at)
  WHERE status IN ('pending', 'retrying');
CREATE INDEX reseller_webhook_deliveries_endpoint_idx
  ON public.reseller_webhook_deliveries(endpoint_id, created_at DESC);

CREATE TABLE public.reseller_api_request_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid REFERENCES public.reseller_api_keys(id) ON DELETE SET NULL,
  reseller_account_id uuid REFERENCES public.reseller_accounts(id) ON DELETE SET NULL,
  request_id text NOT NULL,
  method text NOT NULL,
  path text NOT NULL,
  scope text,
  status_code integer NOT NULL,
  duration_ms integer NOT NULL CHECK (duration_ms >= 0),
  ip_hash text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reseller_api_request_logs_account_created_idx
  ON public.reseller_api_request_logs(reseller_account_id, created_at DESC);
CREATE INDEX reseller_api_request_logs_error_idx
  ON public.reseller_api_request_logs(error_code, created_at DESC) WHERE error_code IS NOT NULL;

DO $$
DECLARE item text;
BEGIN
  FOREACH item IN ARRAY ARRAY[
    'reseller_tiers','reseller_accounts','reseller_tier_events','reseller_api_keys',
    'reseller_api_nonces','reseller_api_rate_windows','reseller_api_idempotency',
    'reseller_sandbox_orders','reseller_webhook_endpoints','reseller_webhook_deliveries',
    'reseller_api_request_logs'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      item, item
    );
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', item);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION private.block_reseller_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'reseller_event_is_append_only';
END;
$$;
REVOKE ALL ON FUNCTION private.block_reseller_event_mutation() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER reseller_tier_events_append_only
  BEFORE UPDATE OR DELETE ON public.reseller_tier_events
  FOR EACH ROW EXECUTE FUNCTION private.block_reseller_event_mutation();
CREATE TRIGGER reseller_api_request_logs_append_only
  BEFORE UPDATE OR DELETE ON public.reseller_api_request_logs
  FOR EACH ROW EXECUTE FUNCTION private.block_reseller_event_mutation();

CREATE OR REPLACE FUNCTION private.log_reseller_manual_tier_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.manual_tier_id IS DISTINCT FROM OLD.manual_tier_id THEN
    INSERT INTO public.reseller_tier_events(
      reseller_account_id, from_tier_id, to_tier_id, event_type,
      volume_30d_amount, currency_code, reason, actor_id
    ) VALUES (
      NEW.id, coalesce(OLD.manual_tier_id, OLD.current_tier_id),
      coalesce(NEW.manual_tier_id, NEW.current_tier_id),
      CASE WHEN NEW.manual_tier_id IS NULL THEN 'manual_override_removed' ELSE 'manual_override' END,
      NEW.volume_30d_amount, NEW.volume_currency_code, NEW.manual_override_reason, NEW.manual_override_by
    );
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.log_reseller_manual_tier_change() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER reseller_accounts_manual_tier_audit
  AFTER UPDATE OF manual_tier_id ON public.reseller_accounts
  FOR EACH ROW EXECUTE FUNCTION private.log_reseller_manual_tier_change();

INSERT INTO public.reseller_tiers(
  code, name, description, minimum_30d_volume, default_credit_limit,
  api_rate_limit_per_minute, sort_order
) VALUES
  ('bronze', '{"en":"Bronze","ar":"برونزي"}', '{"en":"Starter wholesale access","ar":"بداية أسعار الجملة"}', 0, 0, 60, 10),
  ('silver', '{"en":"Silver","ar":"فضي"}', '{"en":"Growing reseller benefits","ar":"مزايا للموزعين النشطين"}', 100000, 25000, 120, 20),
  ('gold', '{"en":"Gold","ar":"ذهبي"}', '{"en":"Priority wholesale access","ar":"أولوية وأسعار جملة متقدمة"}', 500000, 100000, 300, 30),
  ('platinum', '{"en":"Platinum","ar":"بلاتيني"}', '{"en":"Highest-volume partner tier","ar":"فئة الشركاء الأعلى حجماً"}', 2000000, 500000, 600, 40)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.reseller_accounts(profile_id, status, current_tier_id, approved_at)
SELECT pr.profile_id, 'active', tier.id, now()
FROM public.profile_roles pr
CROSS JOIN LATERAL (
  SELECT id FROM public.reseller_tiers WHERE code = 'bronze' LIMIT 1
) tier
WHERE pr.role = 'reseller'
ON CONFLICT (profile_id) DO NOTHING;

INSERT INTO public.role_permissions(role, permission)
VALUES ('admin', 'reseller.manage'), ('owner', 'reseller.manage')
ON CONFLICT (role, permission) DO NOTHING;

CREATE OR REPLACE FUNCTION public.evaluate_reseller_tiers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE account public.reseller_accounts;
DECLARE selected_tier public.reseller_tiers;
DECLARE previous_tier uuid;
DECLARE calculated_volume bigint;
DECLARE changed_count integer := 0;
BEGIN
  IF session_user NOT IN ('postgres', 'supabase_admin')
     AND coalesce((SELECT auth.jwt()->>'role' = 'service_role'), false) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service_role_required';
  END IF;
  FOR account IN
    SELECT * FROM public.reseller_accounts
    WHERE status = 'active' AND deleted_at IS NULL
    FOR UPDATE
  LOOP
    SELECT coalesce(sum(round(
      orders.total_amount::numeric
      * power(10, source_currency.rate_scale)::numeric
      / nullif(source_currency.exchange_rate_minor, 0)::numeric
    )), 0)::bigint
    INTO calculated_volume
    FROM public.orders
    JOIN public.currencies source_currency ON source_currency.code = orders.currency_code
    WHERE orders.profile_id = account.profile_id
      AND orders.status IN ('paid','processing','partially_delivered','delivered','completed')
      AND orders.created_at >= statement_timestamp() - interval '30 days'
      AND orders.deleted_at IS NULL;

    SELECT * INTO selected_tier
    FROM public.reseller_tiers
    WHERE active AND deleted_at IS NULL
      AND minimum_30d_volume <= calculated_volume
    ORDER BY minimum_30d_volume DESC, sort_order DESC
    LIMIT 1;

    previous_tier := account.current_tier_id;
    UPDATE public.reseller_accounts
    SET volume_30d_amount = calculated_volume,
        volume_currency_code = 'USD',
        current_tier_id = CASE
          WHEN auto_upgrade_enabled AND manual_tier_id IS NULL THEN selected_tier.id
          ELSE current_tier_id
        END,
        last_evaluated_at = statement_timestamp()
    WHERE id = account.id;

    IF account.auto_upgrade_enabled AND account.manual_tier_id IS NULL
       AND previous_tier IS DISTINCT FROM selected_tier.id THEN
      INSERT INTO public.reseller_tier_events(
        reseller_account_id, from_tier_id, to_tier_id, event_type,
        volume_30d_amount, currency_code, reason
      ) VALUES (
        account.id, previous_tier, selected_tier.id,
        CASE WHEN selected_tier.minimum_30d_volume > coalesce((SELECT minimum_30d_volume FROM public.reseller_tiers WHERE id = previous_tier), 0)
          THEN 'automatic_upgrade' ELSE 'automatic_downgrade' END,
        calculated_volume, 'USD', 'Scheduled 30-day volume evaluation'
      );
      changed_count := changed_count + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('evaluated', true, 'changed', changed_count);
END;
$$;
REVOKE ALL ON FUNCTION public.evaluate_reseller_tiers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_reseller_tiers() TO service_role;

CREATE OR REPLACE FUNCTION public.claim_reseller_api_request(
  p_api_key_id uuid,
  p_nonce text,
  p_request_timestamp timestamptz,
  p_ip inet
) RETURNS TABLE(request_count integer, request_limit integer, reset_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE target public.reseller_api_keys;
DECLARE window_start timestamptz := date_trunc('minute', statement_timestamp());
DECLARE current_count integer;
BEGIN
  IF session_user NOT IN ('postgres', 'supabase_admin')
     AND coalesce((SELECT auth.jwt()->>'role' = 'service_role'), false) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service_role_required';
  END IF;
  SELECT * INTO target FROM public.reseller_api_keys
  WHERE id = p_api_key_id AND revoked_at IS NULL AND deleted_at IS NULL
    AND (expires_at IS NULL OR expires_at > statement_timestamp())
  FOR UPDATE;
  IF target.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'api_key_inactive';
  END IF;
  IF abs(extract(epoch FROM (statement_timestamp() - p_request_timestamp))) > 300 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'api_timestamp_expired';
  END IF;
  IF cardinality(target.ip_allowlist) > 0
     AND NOT EXISTS (SELECT 1 FROM unnest(target.ip_allowlist) allowed WHERE p_ip <<= allowed) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'api_ip_not_allowed';
  END IF;
  INSERT INTO public.reseller_api_nonces(api_key_id, nonce, request_timestamp, expires_at)
  VALUES(target.id, p_nonce, p_request_timestamp, statement_timestamp() + interval '10 minutes');
  INSERT INTO public.reseller_api_rate_windows(api_key_id, window_started_at, request_count)
  VALUES(target.id, window_start, 1)
  ON CONFLICT(api_key_id, window_started_at) DO UPDATE
    SET request_count = public.reseller_api_rate_windows.request_count + 1
  RETURNING reseller_api_rate_windows.request_count INTO current_count;
  IF current_count > target.rate_limit_per_minute THEN
    RAISE EXCEPTION USING ERRCODE = '54000', MESSAGE = 'api_rate_limit_exceeded';
  END IF;
  UPDATE public.reseller_api_keys SET last_used_at = statement_timestamp() WHERE id = target.id;
  RETURN QUERY SELECT current_count, target.rate_limit_per_minute, window_start + interval '1 minute';
END;
$$;
REVOKE ALL ON FUNCTION public.claim_reseller_api_request(uuid,text,timestamptz,inet) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_reseller_api_request(uuid,text,timestamptz,inet) TO service_role;

CREATE OR REPLACE FUNCTION public.place_reseller_order(
  p_profile_id uuid,
  p_currency_code text,
  p_locale_code text,
  p_country_code text,
  p_items jsonb,
  p_idempotency_key text,
  p_request_hash text
) RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE account public.reseller_accounts;
DECLARE selected_tier public.reseller_tiers;
DECLARE item jsonb;
DECLARE variant public.product_variants;
DECLARE product public.products;
DECLARE quantity integer;
DECLARE unit_amount bigint;
DECLARE subtotal bigint := 0;
DECLARE pricing_lines jsonb := '[]'::jsonb;
DECLARE target public.orders;
BEGIN
  IF session_user NOT IN ('postgres', 'supabase_admin')
     AND coalesce((SELECT auth.jwt()->>'role' = 'service_role'), false) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service_role_required';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'api_order_items_invalid';
  END IF;
  SELECT * INTO account FROM public.reseller_accounts
  WHERE profile_id = p_profile_id AND status = 'active' AND deleted_at IS NULL
  FOR UPDATE;
  IF account.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'reseller_account_inactive'; END IF;
  SELECT * INTO selected_tier FROM public.reseller_tiers
  WHERE id = coalesce(account.manual_tier_id, account.current_tier_id) AND active AND deleted_at IS NULL;
  SELECT * INTO target FROM public.orders
  WHERE profile_id = p_profile_id AND checkout_idempotency_key = p_idempotency_key
  LIMIT 1;
  IF target.id IS NOT NULL THEN RETURN target; END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    quantity := (item->>'quantity')::integer;
    IF quantity < 1 OR quantity > 1000000 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'api_order_quantity_invalid';
    END IF;
    SELECT * INTO variant FROM public.product_variants
    WHERE id = (item->>'variant_id')::uuid AND active AND deleted_at IS NULL
    FOR SHARE;
    IF variant.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'api_variant_not_found'; END IF;
    SELECT * INTO product FROM public.products
    WHERE id = variant.product_id AND status = 'active' AND deleted_at IS NULL
    FOR SHARE;
    IF product.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'api_product_not_found'; END IF;
    IF variant.currency_code <> p_currency_code THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'api_currency_mismatch';
    END IF;
    IF NOT variant.unlimited_stock AND variant.stock_quantity < quantity THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'api_insufficient_stock';
    END IF;
    SELECT coalesce((
      SELECT price_amount FROM public.tier_prices
      WHERE variant_id = variant.id AND tier_code = selected_tier.code
        AND currency_code = p_currency_code AND deleted_at IS NULL
        AND (starts_at IS NULL OR starts_at <= statement_timestamp())
        AND (ends_at IS NULL OR ends_at > statement_timestamp())
      LIMIT 1
    ), variant.price_amount) INTO unit_amount;
    subtotal := subtotal + unit_amount * quantity;
    pricing_lines := pricing_lines || jsonb_build_array(jsonb_build_object(
      'variant_id', variant.id, 'quantity', quantity, 'unit_amount', unit_amount
    ));
  END LOOP;

  PERFORM set_config('app.order_actor_id', p_profile_id::text, true);
  PERFORM set_config('app.order_actor_type', 'reseller_api', true);
  PERFORM set_config('app.order_source', 'reseller_api_v1', true);
  INSERT INTO public.orders(
    profile_id, checkout_idempotency_key, currency_code, locale_code, country_code,
    terms_accepted_at, subtotal_amount, total_amount, pricing_snapshot
  ) VALUES (
    p_profile_id, p_idempotency_key, p_currency_code, p_locale_code, p_country_code,
    statement_timestamp(), subtotal, subtotal,
    jsonb_build_object('source','reseller_api_v1','tier',selected_tier.code,'request_hash',p_request_hash,'lines',pricing_lines)
  ) RETURNING * INTO target;

  FOR item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    quantity := (item->>'quantity')::integer;
    SELECT * INTO variant FROM public.product_variants WHERE id = (item->>'variant_id')::uuid;
    SELECT * INTO product FROM public.products WHERE id = variant.product_id;
    SELECT coalesce((
      SELECT price_amount FROM public.tier_prices
      WHERE variant_id = variant.id AND tier_code = selected_tier.code
        AND currency_code = p_currency_code AND deleted_at IS NULL
        AND (starts_at IS NULL OR starts_at <= statement_timestamp())
        AND (ends_at IS NULL OR ends_at > statement_timestamp()) LIMIT 1
    ), variant.price_amount) INTO unit_amount;
    INSERT INTO public.order_items(
      order_id, product_id, variant_id, sku, product_name, variant_name,
      option_values, quantity, base_amount, tier_amount, total_amount,
      fulfillment_mode, warranty_text
    ) VALUES (
      target.id, product.id, variant.id, variant.sku, product.name, variant.name,
      coalesce(item->'option_values','{}'::jsonb), quantity,
      variant.price_amount * quantity, unit_amount * quantity, unit_amount * quantity,
      product.fulfillment_mode, product.warranty_text
    );
  END LOOP;
  SELECT * INTO target FROM public.pay_order_with_wallet(
    target.id, p_profile_id, 'reseller-api:' || p_idempotency_key
  );
  RETURN target;
END;
$$;
REVOKE ALL ON FUNCTION public.place_reseller_order(uuid,text,text,text,jsonb,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_reseller_order(uuid,text,text,text,jsonb,text,text) TO service_role;

CREATE OR REPLACE FUNCTION private.queue_reseller_order_webhooks()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target public.orders;
DECLARE account_id uuid;
DECLARE specific_event text;
DECLARE base_payload jsonb;
BEGIN
  SELECT * INTO target FROM public.orders WHERE id = NEW.order_id;
  SELECT id INTO account_id FROM public.reseller_accounts
  WHERE profile_id = target.profile_id AND status = 'active' AND deleted_at IS NULL;
  IF account_id IS NULL THEN RETURN NEW; END IF;
  specific_event := CASE
    WHEN NEW.to_status = 'delivered' THEN 'order.delivered'
    WHEN NEW.to_status = 'failed' THEN 'order.failed'
    ELSE NULL
  END;
  base_payload := jsonb_build_object(
    'order_id', target.id, 'order_number', target.order_number,
    'status', target.status, 'currency', target.currency_code,
    'total_amount', target.total_amount, 'occurred_at', NEW.created_at
  );
  INSERT INTO public.reseller_webhook_deliveries(
    endpoint_id, event_id, event_type, aggregate_type, aggregate_id, payload
  )
  SELECT endpoint.id, gen_random_uuid(), 'order.updated', 'order', target.id, base_payload
  FROM public.reseller_webhook_endpoints endpoint
  WHERE endpoint.reseller_account_id = account_id AND endpoint.active
    AND endpoint.deleted_at IS NULL AND 'order.updated' = ANY(endpoint.events);
  IF specific_event IS NOT NULL THEN
    INSERT INTO public.reseller_webhook_deliveries(
      endpoint_id, event_id, event_type, aggregate_type, aggregate_id, payload
    )
    SELECT endpoint.id, gen_random_uuid(), specific_event, 'order', target.id, base_payload
    FROM public.reseller_webhook_endpoints endpoint
    WHERE endpoint.reseller_account_id = account_id AND endpoint.active
      AND endpoint.deleted_at IS NULL AND specific_event = ANY(endpoint.events);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.queue_reseller_order_webhooks() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER order_events_reseller_webhooks
  AFTER INSERT ON public.order_events
  FOR EACH ROW EXECUTE FUNCTION private.queue_reseller_order_webhooks();

CREATE OR REPLACE FUNCTION private.queue_reseller_balance_webhook()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE account public.reseller_accounts;
BEGIN
  IF NEW.owner_id IS NULL OR NEW.account_type <> 'customer' OR NEW.bucket <> 'available' THEN RETURN NEW; END IF;
  SELECT * INTO account FROM public.reseller_accounts
  WHERE profile_id = NEW.owner_id AND status = 'active' AND deleted_at IS NULL
  FOR UPDATE;
  IF account.id IS NULL OR account.low_balance_threshold <= 0
     OR NEW.cached_balance >= account.low_balance_threshold
     OR account.last_low_balance_alert_at > statement_timestamp() - interval '1 hour' THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.reseller_webhook_deliveries(
    endpoint_id, event_id, event_type, aggregate_type, aggregate_id, payload
  )
  SELECT endpoint.id, gen_random_uuid(), 'balance.low', 'wallet', NEW.id,
    jsonb_build_object('wallet_id',NEW.id,'currency',NEW.currency_code,'balance',NEW.cached_balance,'threshold',account.low_balance_threshold)
  FROM public.reseller_webhook_endpoints endpoint
  WHERE endpoint.reseller_account_id = account.id AND endpoint.active
    AND endpoint.deleted_at IS NULL AND 'balance.low' = ANY(endpoint.events);
  UPDATE public.reseller_accounts SET last_low_balance_alert_at = statement_timestamp() WHERE id = account.id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.queue_reseller_balance_webhook() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER wallets_reseller_balance_webhook
  AFTER UPDATE OF cached_balance ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION private.queue_reseller_balance_webhook();

CREATE OR REPLACE FUNCTION public.claim_reseller_webhook_deliveries(p_worker_id text, p_limit integer DEFAULT 20)
RETURNS SETOF public.reseller_webhook_deliveries
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF session_user NOT IN ('postgres','supabase_admin')
     AND coalesce((SELECT auth.jwt()->>'role' = 'service_role'), false) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service_role_required';
  END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT id FROM public.reseller_webhook_deliveries
    WHERE status IN ('pending','retrying') AND next_attempt_at <= statement_timestamp()
      AND (locked_at IS NULL OR locked_at < statement_timestamp() - interval '2 minutes')
    ORDER BY next_attempt_at, created_at
    FOR UPDATE SKIP LOCKED LIMIT greatest(1, least(p_limit, 100))
  )
  UPDATE public.reseller_webhook_deliveries delivery
  SET status = 'processing', locked_at = statement_timestamp(), locked_by = p_worker_id,
      attempts = attempts + 1
  FROM candidates WHERE delivery.id = candidates.id RETURNING delivery.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_reseller_webhook_deliveries(text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_reseller_webhook_deliveries(text,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_reseller_webhook_delivery(
  p_delivery_id uuid, p_worker_id text, p_succeeded boolean, p_signature text,
  p_response_status integer DEFAULT NULL, p_response_body_safe text DEFAULT NULL,
  p_error_code text DEFAULT NULL
) RETURNS public.reseller_webhook_deliveries
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target public.reseller_webhook_deliveries;
BEGIN
  IF session_user NOT IN ('postgres','supabase_admin')
     AND coalesce((SELECT auth.jwt()->>'role' = 'service_role'), false) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service_role_required';
  END IF;
  SELECT * INTO target FROM public.reseller_webhook_deliveries
  WHERE id = p_delivery_id AND locked_by = p_worker_id AND status = 'processing' FOR UPDATE;
  IF target.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'webhook_delivery_not_claimed'; END IF;
  UPDATE public.reseller_webhook_deliveries
  SET signature = p_signature, response_status = p_response_status,
      response_body_safe = left(p_response_body_safe, 1000), last_error_code = p_error_code,
      status = CASE WHEN p_succeeded THEN 'delivered'::public.reseller_webhook_delivery_status
        WHEN attempts >= max_attempts THEN 'dead_letter'::public.reseller_webhook_delivery_status
        ELSE 'retrying'::public.reseller_webhook_delivery_status END,
      delivered_at = CASE WHEN p_succeeded THEN statement_timestamp() ELSE NULL END,
      next_attempt_at = CASE WHEN p_succeeded OR attempts >= max_attempts THEN next_attempt_at
        ELSE statement_timestamp() + make_interval(secs => least(3600, 15 * power(2, least(attempts, 8))::integer)) END,
      locked_at = NULL, locked_by = NULL
  WHERE id = target.id RETURNING * INTO target;
  UPDATE public.reseller_webhook_endpoints
  SET failure_count = CASE WHEN p_succeeded THEN 0 ELSE failure_count + 1 END,
      last_delivery_at = CASE WHEN p_succeeded THEN statement_timestamp() ELSE last_delivery_at END
  WHERE id = target.endpoint_id;
  RETURN target;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_reseller_webhook_delivery(uuid,text,boolean,text,integer,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_reseller_webhook_delivery(uuid,text,boolean,text,integer,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.prune_reseller_api_security_data()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE nonce_count integer; window_count integer; idem_count integer;
BEGIN
  DELETE FROM public.reseller_api_nonces WHERE expires_at < statement_timestamp(); GET DIAGNOSTICS nonce_count = ROW_COUNT;
  DELETE FROM public.reseller_api_rate_windows WHERE window_started_at < statement_timestamp() - interval '1 day'; GET DIAGNOSTICS window_count = ROW_COUNT;
  DELETE FROM public.reseller_api_idempotency WHERE expires_at < statement_timestamp(); GET DIAGNOSTICS idem_count = ROW_COUNT;
  RETURN jsonb_build_object('nonces',nonce_count,'windows',window_count,'idempotency',idem_count);
END;
$$;
REVOKE ALL ON FUNCTION public.prune_reseller_api_security_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_reseller_api_security_data() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('reseller-tier-evaluation-daily','17 2 * * *','SELECT public.evaluate_reseller_tiers()');
    PERFORM cron.schedule('reseller-api-security-prune-hourly','23 * * * *','SELECT public.prune_reseller_api_security_data()');
  END IF;
END $$;

CREATE POLICY reseller_tiers_authenticated_read ON public.reseller_tiers FOR SELECT TO authenticated
  USING (active AND deleted_at IS NULL);
CREATE POLICY reseller_accounts_owner_read ON public.reseller_accounts FOR SELECT TO authenticated
  USING (profile_id = (SELECT auth.uid()) OR (SELECT private.app_can('identity.manage')));
CREATE POLICY reseller_tier_events_owner_read ON public.reseller_tier_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.reseller_accounts account
    WHERE account.id = reseller_account_id
      AND (account.profile_id = (SELECT auth.uid()) OR (SELECT private.app_can('identity.manage')))
  ));
CREATE POLICY reseller_sandbox_orders_owner_read ON public.reseller_sandbox_orders FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.reseller_accounts account
    WHERE account.id = reseller_account_id AND account.profile_id = (SELECT auth.uid())
  ));
CREATE POLICY reseller_webhook_deliveries_owner_read ON public.reseller_webhook_deliveries FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.reseller_webhook_endpoints endpoint
    JOIN public.reseller_accounts account ON account.id = endpoint.reseller_account_id
    WHERE endpoint.id = endpoint_id AND account.profile_id = (SELECT auth.uid())
  ));

REVOKE ALL ON TABLE
  public.reseller_tiers, public.reseller_accounts, public.reseller_tier_events,
  public.reseller_api_keys, public.reseller_api_nonces, public.reseller_api_rate_windows,
  public.reseller_api_idempotency, public.reseller_sandbox_orders,
  public.reseller_webhook_endpoints, public.reseller_webhook_deliveries,
  public.reseller_api_request_logs
FROM anon, authenticated;
GRANT SELECT ON TABLE public.reseller_tiers, public.reseller_accounts,
  public.reseller_tier_events, public.reseller_sandbox_orders,
  public.reseller_webhook_deliveries TO authenticated;
GRANT ALL ON TABLE
  public.reseller_tiers, public.reseller_accounts, public.reseller_tier_events,
  public.reseller_api_keys, public.reseller_api_nonces, public.reseller_api_rate_windows,
  public.reseller_api_idempotency, public.reseller_sandbox_orders,
  public.reseller_webhook_endpoints, public.reseller_webhook_deliveries,
  public.reseller_api_request_logs
TO service_role;

COMMENT ON FUNCTION public.place_reseller_order(uuid,text,text,text,jsonb,text,text)
  IS 'Atomically validates wholesale prices and stock, creates a reseller order, debits the Phase 3 wallet, and triggers Phase 6 fulfillment.';
COMMENT ON TABLE public.reseller_api_keys
  IS 'API identifiers and encrypted HMAC secrets. Plaintext credentials are returned once and never persisted.';
COMMENT ON TABLE public.reseller_api_nonces
  IS 'Replay-prevention nonces with short retention and a unique key/nonce constraint.';
