-- Phase 5: cart, promotions, authoritative pricing snapshots, checkout and orders.
-- All amounts are integer minor units and all customer-owned rows are protected by RLS.

CREATE TYPE cart_status AS ENUM ('active','converted','abandoned','expired');
CREATE TYPE coupon_kind AS ENUM ('percent','fixed','free_item');
CREATE TYPE discount_value_kind AS ENUM ('percent','fixed','unit_price');
CREATE TYPE order_status AS ENUM (
  'draft','awaiting_payment','paid','processing','partially_delivered','delivered',
  'completed','on_hold','failed','cancelled','refunded','disputed'
);
CREATE TYPE order_delivery_kind AS ENUM ('code','text','file','link');
CREATE TYPE refund_request_status AS ENUM ('pending','reviewing','approved','rejected','processed');
CREATE TYPE recovery_job_status AS ENUM ('pending','processing','sent','failed','cancelled');

CREATE TABLE carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  guest_token_hash text,
  status cart_status NOT NULL DEFAULT 'active',
  currency_code text NOT NULL REFERENCES currencies(code) ON UPDATE CASCADE,
  locale_code text NOT NULL REFERENCES locales(code) ON UPDATE CASCADE,
  country_code text,
  coupon_codes text[] NOT NULL DEFAULT '{}'::text[],
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  converted_order_id uuid,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT carts_owner_ck CHECK (num_nonnulls(profile_id,guest_token_hash)=1),
  CONSTRAINT carts_guest_hash_ck CHECK (guest_token_hash IS NULL OR guest_token_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT carts_country_ck CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$')
);
CREATE UNIQUE INDEX carts_profile_active_uidx ON carts(profile_id) WHERE profile_id IS NOT NULL AND status='active' AND deleted_at IS NULL;
CREATE UNIQUE INDEX carts_guest_active_uidx ON carts(guest_token_hash) WHERE guest_token_hash IS NOT NULL AND status='active' AND deleted_at IS NULL;
CREATE INDEX carts_recovery_idx ON carts(status,last_activity_at) WHERE status IN ('active','abandoned') AND deleted_at IS NULL;

CREATE TABLE cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  quantity integer NOT NULL DEFAULT 1,
  option_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  option_fingerprint text NOT NULL,
  validation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  unit_price_snapshot bigint NOT NULL DEFAULT 0,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cart_items_quantity_ck CHECK (quantity BETWEEN 1 AND 1000000),
  CONSTRAINT cart_items_options_ck CHECK (jsonb_typeof(option_values)='object'),
  CONSTRAINT cart_items_validation_ck CHECK (jsonb_typeof(validation_snapshot)='object'),
  CONSTRAINT cart_items_price_ck CHECK (unit_price_snapshot>=0)
);
CREATE UNIQUE INDEX cart_items_identity_uidx ON cart_items(cart_id,variant_id,option_fingerprint) WHERE deleted_at IS NULL;
CREATE INDEX cart_items_cart_idx ON cart_items(cart_id,created_at) WHERE deleted_at IS NULL;
CREATE INDEX cart_items_product_idx ON cart_items(product_id);
CREATE INDEX cart_items_variant_idx ON cart_items(variant_id);
CREATE INDEX cart_items_options_gin_idx ON cart_items USING gin(option_values jsonb_path_ops);

CREATE TABLE tier_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  tier_code text NOT NULL,
  price_amount bigint NOT NULL,
  currency_code text NOT NULL REFERENCES currencies(code) ON UPDATE CASCADE,
  starts_at timestamptz,
  ends_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tier_prices_amount_ck CHECK (price_amount>=0),
  CONSTRAINT tier_prices_window_ck CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at>starts_at),
  UNIQUE(variant_id,tier_code,currency_code)
);
CREATE INDEX tier_prices_variant_idx ON tier_prices(variant_id,tier_code) WHERE deleted_at IS NULL;

CREATE TABLE country_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  country_code text NOT NULL,
  price_amount bigint NOT NULL,
  currency_code text NOT NULL REFERENCES currencies(code) ON UPDATE CASCADE,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT country_prices_country_ck CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT country_prices_amount_ck CHECK (price_amount>=0),
  UNIQUE(variant_id,country_code,currency_code)
);
CREATE INDEX country_prices_variant_country_idx ON country_prices(variant_id,country_code) WHERE deleted_at IS NULL;

CREATE TABLE quantity_discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  minimum_quantity integer NOT NULL,
  maximum_quantity integer,
  value_kind discount_value_kind NOT NULL,
  value_amount bigint NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quantity_discounts_range_ck CHECK (minimum_quantity>0 AND (maximum_quantity IS NULL OR maximum_quantity>=minimum_quantity)),
  CONSTRAINT quantity_discounts_value_ck CHECK (value_amount>=0 AND (value_kind<>'percent' OR value_amount<=10000))
);
CREATE INDEX quantity_discounts_lookup_idx ON quantity_discounts(variant_id,minimum_quantity DESC,priority DESC) WHERE deleted_at IS NULL;

CREATE TABLE flash_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name jsonb NOT NULL DEFAULT '{}'::jsonb,
  value_kind discount_value_kind NOT NULL,
  value_amount bigint NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 0,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT flash_sales_name_ck CHECK (jsonb_typeof(name)='object'),
  CONSTRAINT flash_sales_window_ck CHECK (ends_at>starts_at),
  CONSTRAINT flash_sales_value_ck CHECK (value_amount>=0 AND (value_kind<>'percent' OR value_amount<=10000))
);
CREATE INDEX flash_sales_active_window_idx ON flash_sales(active,starts_at,ends_at) WHERE deleted_at IS NULL;

CREATE TABLE flash_sale_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flash_sale_id uuid NOT NULL REFERENCES flash_sales(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES product_variants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT flash_sale_scopes_target_ck CHECK (num_nonnulls(category_id,product_id,variant_id)=1)
);
CREATE INDEX flash_sale_scopes_sale_idx ON flash_sale_scopes(flash_sale_id);
CREATE INDEX flash_sale_scopes_category_idx ON flash_sale_scopes(category_id) WHERE category_id IS NOT NULL;
CREATE INDEX flash_sale_scopes_product_idx ON flash_sale_scopes(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX flash_sale_scopes_variant_idx ON flash_sale_scopes(variant_id) WHERE variant_id IS NOT NULL;

CREATE TABLE coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  kind coupon_kind NOT NULL,
  value_amount bigint NOT NULL DEFAULT 0,
  currency_code text REFERENCES currencies(code) ON UPDATE CASCADE,
  free_variant_id uuid REFERENCES product_variants(id) ON DELETE RESTRICT,
  usage_limit integer,
  per_user_limit integer,
  minimum_cart_amount bigint NOT NULL DEFAULT 0,
  starts_at timestamptz,
  expires_at timestamptz,
  first_order_only boolean NOT NULL DEFAULT false,
  auto_apply boolean NOT NULL DEFAULT false,
  stackable boolean NOT NULL DEFAULT false,
  stack_group text NOT NULL DEFAULT 'default',
  priority integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coupons_code_ck CHECK (code=upper(code) AND code ~ '^[A-Z0-9][A-Z0-9_-]{2,39}$'),
  CONSTRAINT coupons_value_ck CHECK (value_amount>=0 AND (kind<>'percent' OR value_amount<=10000)),
  CONSTRAINT coupons_free_item_ck CHECK ((kind='free_item')=(free_variant_id IS NOT NULL)),
  CONSTRAINT coupons_currency_ck CHECK (kind<>'fixed' OR currency_code IS NOT NULL),
  CONSTRAINT coupons_limits_ck CHECK ((usage_limit IS NULL OR usage_limit>0) AND (per_user_limit IS NULL OR per_user_limit>0)),
  CONSTRAINT coupons_window_ck CHECK (expires_at IS NULL OR starts_at IS NULL OR expires_at>starts_at)
);
CREATE UNIQUE INDEX coupons_code_active_uidx ON coupons(code) WHERE deleted_at IS NULL;
CREATE INDEX coupons_auto_window_idx ON coupons(auto_apply,active,starts_at,expires_at) WHERE deleted_at IS NULL;

CREATE TABLE coupon_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(coupon_id,category_id)
);
CREATE INDEX coupon_categories_category_idx ON coupon_categories(category_id);

CREATE TABLE coupon_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(coupon_id,product_id)
);
CREATE INDEX coupon_products_product_idx ON coupon_products(product_id);

CREATE TABLE tax_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL,
  name jsonb NOT NULL DEFAULT '{}'::jsonb,
  rate_bps integer NOT NULL,
  inclusive boolean NOT NULL DEFAULT false,
  digital_products boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tax_rules_country_ck CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT tax_rules_rate_ck CHECK (rate_bps BETWEEN 0 AND 10000),
  CONSTRAINT tax_rules_name_ck CHECK (jsonb_typeof(name)='object'),
  CONSTRAINT tax_rules_window_ck CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at>starts_at)
);
CREATE INDEX tax_rules_lookup_idx ON tax_rules(country_code,active,starts_at,ends_at) WHERE deleted_at IS NULL;

CREATE SEQUENCE order_number_sequence;
CREATE OR REPLACE FUNCTION private.next_order_number()
RETURNS text LANGUAGE sql VOLATILE SET search_path='' AS $$
  SELECT 'NXR-'||to_char(statement_timestamp(),'YYYYMMDD')||'-'||lpad(nextval('public.order_number_sequence')::text,8,'0');
$$;
REVOKE ALL ON FUNCTION private.next_order_number() FROM PUBLIC,anon,authenticated;

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL DEFAULT private.next_order_number(),
  profile_id uuid REFERENCES profiles(id) ON DELETE RESTRICT,
  guest_email text,
  guest_access_token_hash text,
  cart_id uuid REFERENCES carts(id) ON DELETE SET NULL,
  checkout_idempotency_key text NOT NULL,
  status order_status NOT NULL DEFAULT 'draft',
  currency_code text NOT NULL REFERENCES currencies(code) ON UPDATE CASCADE,
  locale_code text NOT NULL REFERENCES locales(code) ON UPDATE CASCADE,
  country_code text NOT NULL,
  customer_notes text,
  terms_accepted_at timestamptz NOT NULL,
  subtotal_amount bigint NOT NULL,
  discount_amount bigint NOT NULL DEFAULT 0,
  fee_amount bigint NOT NULL DEFAULT 0,
  tax_amount bigint NOT NULL DEFAULT 0,
  total_amount bigint NOT NULL,
  paid_amount bigint NOT NULL DEFAULT 0,
  refunded_amount bigint NOT NULL DEFAULT 0,
  payment_id uuid,
  wallet_transaction_id uuid REFERENCES wallet_transactions(id) ON DELETE RESTRICT,
  pricing_snapshot jsonb NOT NULL,
  paid_at timestamptz,
  delivered_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_number_ck CHECK (order_number ~ '^NXR-[0-9]{8}-[0-9]{8}$'),
  CONSTRAINT orders_owner_ck CHECK ((profile_id IS NOT NULL AND guest_email IS NULL AND guest_access_token_hash IS NULL) OR (profile_id IS NULL AND guest_email IS NOT NULL AND guest_access_token_hash ~ '^[a-f0-9]{64}$')),
  CONSTRAINT orders_country_ck CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT orders_money_ck CHECK (subtotal_amount>=0 AND discount_amount>=0 AND fee_amount>=0 AND tax_amount>=0 AND total_amount>=0 AND paid_amount>=0 AND refunded_amount>=0 AND total_amount=subtotal_amount-discount_amount+fee_amount+tax_amount AND refunded_amount<=paid_amount),
  CONSTRAINT orders_pricing_ck CHECK (jsonb_typeof(pricing_snapshot)='object')
);
CREATE UNIQUE INDEX orders_number_uidx ON orders(order_number);
CREATE INDEX orders_profile_created_idx ON orders(profile_id,created_at DESC) WHERE profile_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX orders_status_created_idx ON orders(status,created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX orders_cart_idx ON orders(cart_id) WHERE cart_id IS NOT NULL;
CREATE UNIQUE INDEX orders_cart_checkout_idempotency_uidx ON orders(cart_id,checkout_idempotency_key) WHERE cart_id IS NOT NULL;
CREATE UNIQUE INDEX orders_profile_checkout_idempotency_uidx ON orders(profile_id,checkout_idempotency_key) WHERE profile_id IS NOT NULL;
CREATE UNIQUE INDEX orders_guest_checkout_idempotency_uidx ON orders(guest_access_token_hash,checkout_idempotency_key) WHERE guest_access_token_hash IS NOT NULL;
CREATE INDEX orders_payment_idx ON orders(payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX orders_wallet_transaction_idx ON orders(wallet_transaction_id) WHERE wallet_transaction_id IS NOT NULL;
ALTER TABLE carts ADD CONSTRAINT carts_converted_order_fk FOREIGN KEY(converted_order_id) REFERENCES orders(id) ON DELETE SET NULL;

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  sku text NOT NULL,
  product_name jsonb NOT NULL,
  variant_name jsonb NOT NULL,
  option_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  quantity integer NOT NULL,
  base_amount bigint NOT NULL,
  tier_amount bigint NOT NULL DEFAULT 0,
  country_amount bigint NOT NULL DEFAULT 0,
  quantity_discount_amount bigint NOT NULL DEFAULT 0,
  flash_discount_amount bigint NOT NULL DEFAULT 0,
  coupon_discount_amount bigint NOT NULL DEFAULT 0,
  loyalty_discount_amount bigint NOT NULL DEFAULT 0,
  fee_amount bigint NOT NULL DEFAULT 0,
  tax_amount bigint NOT NULL DEFAULT 0,
  total_amount bigint NOT NULL,
  fulfillment_mode fulfillment_mode NOT NULL,
  delivered_quantity integer NOT NULL DEFAULT 0,
  warranty_text jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_items_quantity_ck CHECK (quantity>0 AND delivered_quantity BETWEEN 0 AND quantity),
  CONSTRAINT order_items_money_ck CHECK (base_amount>=0 AND quantity_discount_amount>=0 AND flash_discount_amount>=0 AND coupon_discount_amount>=0 AND loyalty_discount_amount>=0 AND fee_amount>=0 AND tax_amount>=0 AND total_amount>=0),
  CONSTRAINT order_items_json_ck CHECK (jsonb_typeof(product_name)='object' AND jsonb_typeof(variant_name)='object' AND jsonb_typeof(option_values)='object' AND jsonb_typeof(warranty_text)='object')
);
CREATE INDEX order_items_order_idx ON order_items(order_id,created_at);
CREATE INDEX order_items_product_idx ON order_items(product_id);
CREATE INDEX order_items_variant_idx ON order_items(variant_id);

CREATE TABLE order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  from_status order_status,
  to_status order_status NOT NULL,
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  actor_type text NOT NULL DEFAULT 'system',
  source text NOT NULL DEFAULT 'system',
  reason text,
  public_message jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_events_json_ck CHECK (jsonb_typeof(public_message)='object' AND jsonb_typeof(metadata)='object')
);
CREATE INDEX order_events_order_created_idx ON order_events(order_id,created_at,id);
CREATE INDEX order_events_actor_idx ON order_events(actor_id) WHERE actor_id IS NOT NULL;

CREATE TABLE order_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
  kind order_delivery_kind NOT NULL,
  payload_ciphertext text,
  display_hint text,
  storage_path text,
  delivered_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  revealed_at timestamptz,
  reveal_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_deliveries_payload_ck CHECK ((kind='file' AND storage_path IS NOT NULL) OR (kind<>'file' AND payload_ciphertext IS NOT NULL)),
  CONSTRAINT order_deliveries_reveal_ck CHECK (reveal_count>=0)
);
CREATE INDEX order_deliveries_order_idx ON order_deliveries(order_id,created_at);
CREATE INDEX order_deliveries_item_idx ON order_deliveries(order_item_id);
CREATE INDEX order_deliveries_staff_idx ON order_deliveries(delivered_by) WHERE delivered_by IS NOT NULL;

CREATE TABLE order_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  author_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  author_type text NOT NULL,
  body text NOT NULL,
  attachment_path text,
  internal boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_messages_body_ck CHECK (char_length(trim(body)) BETWEEN 1 AND 5000)
);
CREATE INDEX order_messages_order_created_idx ON order_messages(order_id,created_at,id) WHERE deleted_at IS NULL;
CREATE INDEX order_messages_author_idx ON order_messages(author_id) WHERE author_id IS NOT NULL;

CREATE TABLE order_refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  requested_amount bigint NOT NULL,
  reason text NOT NULL,
  status refund_request_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  review_reason text,
  reviewed_at timestamptz,
  payment_refund_id uuid REFERENCES payment_refunds(id) ON DELETE SET NULL,
  wallet_transaction_id uuid REFERENCES wallet_transactions(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_refunds_amount_ck CHECK (requested_amount>0),
  CONSTRAINT order_refunds_reason_ck CHECK (char_length(trim(reason)) BETWEEN 3 AND 2000)
);
CREATE INDEX order_refunds_order_idx ON order_refund_requests(order_id,created_at DESC);
CREATE INDEX order_refunds_profile_idx ON order_refund_requests(profile_id,created_at DESC) WHERE profile_id IS NOT NULL;
CREATE INDEX order_refunds_queue_idx ON order_refund_requests(status,created_at) WHERE status IN ('pending','reviewing');
CREATE INDEX order_refunds_reviewer_idx ON order_refund_requests(reviewed_by) WHERE reviewed_by IS NOT NULL;

CREATE TABLE coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES coupons(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  discount_amount bigint NOT NULL,
  currency_code text NOT NULL REFERENCES currencies(code) ON UPDATE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coupon_redemptions_amount_ck CHECK (discount_amount>=0),
  UNIQUE(coupon_id,order_id)
);
CREATE INDEX coupon_redemptions_coupon_idx ON coupon_redemptions(coupon_id,created_at);
CREATE INDEX coupon_redemptions_profile_idx ON coupon_redemptions(profile_id,coupon_id) WHERE profile_id IS NOT NULL;

CREATE TABLE cart_recovery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  sequence_number integer NOT NULL,
  status recovery_job_status NOT NULL DEFAULT 'pending',
  run_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recovery_jobs_sequence_ck CHECK (sequence_number BETWEEN 1 AND 3),
  CONSTRAINT recovery_jobs_attempts_ck CHECK (attempts>=0),
  UNIQUE(cart_id,sequence_number)
);
CREATE INDEX cart_recovery_jobs_run_idx ON cart_recovery_jobs(status,run_at) WHERE status IN ('pending','failed');

CREATE OR REPLACE FUNCTION enqueue_abandoned_cart_jobs()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE queued integer;
BEGIN
  UPDATE public.carts SET status='abandoned',updated_at=statement_timestamp()
  WHERE status='active' AND profile_id IS NOT NULL AND last_activity_at<now()-interval '1 hour'
    AND EXISTS(SELECT 1 FROM public.cart_items i WHERE i.cart_id=carts.id AND i.deleted_at IS NULL);
  INSERT INTO public.cart_recovery_jobs(cart_id,sequence_number,run_at)
  SELECT id,1,now() FROM public.carts WHERE status='abandoned' AND profile_id IS NOT NULL
  ON CONFLICT(cart_id,sequence_number) DO NOTHING;
  INSERT INTO public.cart_recovery_jobs(cart_id,sequence_number,run_at)
  SELECT id,2,last_activity_at+interval '24 hours' FROM public.carts WHERE status='abandoned' AND profile_id IS NOT NULL
  ON CONFLICT(cart_id,sequence_number) DO NOTHING;
  INSERT INTO public.cart_recovery_jobs(cart_id,sequence_number,run_at)
  SELECT id,3,last_activity_at+interval '72 hours' FROM public.carts WHERE status='abandoned' AND profile_id IS NOT NULL
  ON CONFLICT(cart_id,sequence_number) DO NOTHING;
  GET DIAGNOSTICS queued=ROW_COUNT;
  RETURN queued;
END;
$$;
REVOKE ALL ON FUNCTION enqueue_abandoned_cart_jobs() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION enqueue_abandoned_cart_jobs() TO service_role;
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname='enqueue-abandoned-carts-hourly';
SELECT cron.schedule('enqueue-abandoned-carts-hourly','0 * * * *','SELECT public.enqueue_abandoned_cart_jobs()');

CREATE OR REPLACE FUNCTION claim_order_coupon(
  p_coupon_id uuid,p_order_id uuid,p_profile_id uuid,p_discount_amount bigint,p_currency_code text
) RETURNS coupon_redemptions LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE offer public.coupons; existing public.coupon_redemptions; claimed public.coupon_redemptions; order_row public.orders; total_uses bigint; user_uses bigint;
BEGIN
  SELECT * INTO offer FROM public.coupons WHERE id=p_coupon_id FOR UPDATE;
  SELECT * INTO order_row FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF offer.id IS NULL OR order_row.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='coupon_or_order_not_found'; END IF;
  SELECT * INTO existing FROM public.coupon_redemptions WHERE coupon_id=p_coupon_id AND order_id=p_order_id;
  IF existing.id IS NOT NULL THEN RETURN existing; END IF;
  IF NOT offer.active OR offer.deleted_at IS NOT NULL OR (offer.starts_at IS NOT NULL AND offer.starts_at>now()) OR (offer.expires_at IS NOT NULL AND offer.expires_at<=now()) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='coupon_inactive';
  END IF;
  IF offer.minimum_cart_amount>order_row.subtotal_amount THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='coupon_minimum_not_met'; END IF;
  IF offer.first_order_only AND p_profile_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.orders o WHERE o.profile_id=p_profile_id AND o.id<>p_order_id AND o.status IN ('paid','processing','partially_delivered','delivered','completed')) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='coupon_first_order_only';
  END IF;
  SELECT count(*) INTO total_uses FROM public.coupon_redemptions WHERE coupon_id=p_coupon_id;
  IF offer.usage_limit IS NOT NULL AND total_uses>=offer.usage_limit THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='coupon_usage_limit'; END IF;
  IF p_profile_id IS NOT NULL THEN
    SELECT count(*) INTO user_uses FROM public.coupon_redemptions WHERE coupon_id=p_coupon_id AND profile_id=p_profile_id;
    IF offer.per_user_limit IS NOT NULL AND user_uses>=offer.per_user_limit THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='coupon_user_limit'; END IF;
  END IF;
  INSERT INTO public.coupon_redemptions(coupon_id,order_id,profile_id,discount_amount,currency_code)
  VALUES(p_coupon_id,p_order_id,p_profile_id,p_discount_amount,p_currency_code) RETURNING * INTO claimed;
  RETURN claimed;
END;
$$;
REVOKE ALL ON FUNCTION claim_order_coupon(uuid,uuid,uuid,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION claim_order_coupon(uuid,uuid,uuid,bigint,text) TO service_role;

-- Payments can now represent a direct order payment as well as a wallet top-up.
ALTER TABLE payments ALTER COLUMN profile_id DROP NOT NULL;
ALTER TABLE payment_proofs ALTER COLUMN profile_id DROP NOT NULL;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_purpose_check;
ALTER TABLE payments ADD COLUMN order_id uuid REFERENCES orders(id) ON DELETE RESTRICT;
ALTER TABLE payments ADD CONSTRAINT payments_purpose_check CHECK (purpose IN ('wallet_topup','order'));
ALTER TABLE payments ADD CONSTRAINT payments_target_check CHECK (
  (purpose='wallet_topup' AND profile_id IS NOT NULL AND order_id IS NULL)
  OR (purpose='order' AND order_id IS NOT NULL)
);
ALTER TABLE orders ADD CONSTRAINT orders_payment_fk FOREIGN KEY(payment_id) REFERENCES payments(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX payments_order_idempotency_uidx ON payments(order_id,idempotency_key) WHERE order_id IS NOT NULL;
CREATE INDEX payments_order_idx ON payments(order_id) WHERE order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.order_transition_allowed(p_from order_status,p_to order_status)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT p_from=p_to OR (p_from,p_to) IN (
    ('draft','awaiting_payment'),('draft','paid'),('draft','cancelled'),
    ('awaiting_payment','paid'),('awaiting_payment','failed'),('awaiting_payment','cancelled'),
    ('paid','processing'),('paid','on_hold'),('paid','cancelled'),('paid','refunded'),('paid','disputed'),
    ('processing','partially_delivered'),('processing','delivered'),('processing','on_hold'),('processing','failed'),('processing','cancelled'),('processing','refunded'),('processing','disputed'),
    ('partially_delivered','delivered'),('partially_delivered','on_hold'),('partially_delivered','failed'),('partially_delivered','refunded'),('partially_delivered','disputed'),
    ('delivered','completed'),('delivered','on_hold'),('delivered','refunded'),('delivered','disputed'),
    ('completed','refunded'),('completed','disputed'),
    ('on_hold','processing'),('on_hold','cancelled'),('on_hold','refunded'),('on_hold','disputed'),
    ('failed','processing'),('failed','cancelled'),('failed','refunded'),
    ('disputed','completed'),('disputed','refunded'),('disputed','cancelled')
  );
$$;
REVOKE ALL ON FUNCTION private.order_transition_allowed(order_status,order_status) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.orders_guard_status()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT private.order_transition_allowed(OLD.status,NEW.status) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='order_illegal_transition', DETAIL=OLD.status::text||' -> '||NEW.status::text;
  END IF;
  NEW.updated_at=statement_timestamp();
  IF NEW.status='paid' AND OLD.status<>'paid' THEN NEW.paid_at=coalesce(NEW.paid_at,statement_timestamp()); END IF;
  IF NEW.status='delivered' AND OLD.status<>'delivered' THEN NEW.delivered_at=coalesce(NEW.delivered_at,statement_timestamp()); END IF;
  IF NEW.status='completed' AND OLD.status<>'completed' THEN NEW.completed_at=coalesce(NEW.completed_at,statement_timestamp()); END IF;
  IF NEW.status='cancelled' AND OLD.status<>'cancelled' THEN NEW.cancelled_at=coalesce(NEW.cancelled_at,statement_timestamp()); END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.orders_guard_status() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER orders_guard_status BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION private.orders_guard_status();

CREATE OR REPLACE FUNCTION private.orders_record_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.order_events(order_id,from_status,to_status,actor_id,actor_type,source,reason,public_message,metadata)
    VALUES(NEW.id,CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.status END,NEW.status,
      nullif(current_setting('app.order_actor_id',true),'')::uuid,
      coalesce(nullif(current_setting('app.order_actor_type',true),''),'system'),
      coalesce(nullif(current_setting('app.order_source',true),''),'system'),
      nullif(current_setting('app.order_reason',true),''),
      coalesce(nullif(current_setting('app.order_public_message',true),'')::jsonb,'{}'::jsonb),
      coalesce(nullif(current_setting('app.order_metadata',true),'')::jsonb,'{}'::jsonb));
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.orders_record_event() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER orders_record_event AFTER INSERT OR UPDATE OF status ON orders FOR EACH ROW EXECUTE FUNCTION private.orders_record_event();

CREATE OR REPLACE FUNCTION private.block_order_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='order_events_append_only'; END;
$$;
REVOKE ALL ON FUNCTION private.block_order_event_mutation() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER order_events_no_update_delete BEFORE UPDATE OR DELETE ON order_events FOR EACH ROW EXECUTE FUNCTION private.block_order_event_mutation();

CREATE OR REPLACE FUNCTION transition_order_status(
  p_order_id uuid,p_to order_status,p_actor_id uuid DEFAULT NULL,p_actor_type text DEFAULT 'system',
  p_source text DEFAULT 'application',p_reason text DEFAULT NULL,p_public_message jsonb DEFAULT '{}'::jsonb,p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS orders LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target public.orders;
BEGIN
  SELECT * INTO target FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF target.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='order_not_found'; END IF;
  IF target.status=p_to THEN RETURN target; END IF;
  PERFORM set_config('app.order_actor_id',coalesce(p_actor_id::text,''),true);
  PERFORM set_config('app.order_actor_type',p_actor_type,true);
  PERFORM set_config('app.order_source',p_source,true);
  PERFORM set_config('app.order_reason',coalesce(p_reason,''),true);
  PERFORM set_config('app.order_public_message',coalesce(p_public_message,'{}'::jsonb)::text,true);
  PERFORM set_config('app.order_metadata',coalesce(p_metadata,'{}'::jsonb)::text,true);
  UPDATE public.orders SET status=p_to WHERE id=p_order_id RETURNING * INTO target;
  RETURN target;
END;
$$;
REVOKE ALL ON FUNCTION transition_order_status(uuid,order_status,uuid,text,text,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION transition_order_status(uuid,order_status,uuid,text,text,text,jsonb,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION pay_order_with_wallet(p_order_id uuid,p_profile_id uuid,p_idempotency_key text)
RETURNS orders LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target public.orders; ledger public.wallet_transactions;
BEGIN
  SELECT * INTO target FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF target.id IS NULL OR target.profile_id IS DISTINCT FROM p_profile_id THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='order_not_found'; END IF;
  IF target.wallet_transaction_id IS NOT NULL THEN RETURN target; END IF;
  IF target.status<>'draft' THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='order_not_payable'; END IF;
  ledger:=public.wallet_debit(p_profile_id,target.currency_code,target.total_amount,'purchase',p_idempotency_key,'order',target.id,NULL,jsonb_build_object('order_number',target.order_number));
  PERFORM set_config('app.order_actor_id',p_profile_id::text,true);
  PERFORM set_config('app.order_actor_type','customer',true);
  PERFORM set_config('app.order_source','wallet_checkout',true);
  UPDATE public.orders SET wallet_transaction_id=ledger.id,paid_amount=total_amount,status='paid' WHERE id=target.id RETURNING * INTO target;
  RETURN target;
END;
$$;
REVOKE ALL ON FUNCTION pay_order_with_wallet(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION pay_order_with_wallet(uuid,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION settle_order_payment(p_payment_id uuid,p_received_amount bigint,p_provider_event_id text)
RETURNS orders LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE payment public.payments; target public.orders; cash public.wallets; revenue public.wallets; ledger public.wallet_transactions;
BEGIN
  SELECT * INTO payment FROM public.payments WHERE id=p_payment_id FOR UPDATE;
  IF payment.id IS NULL OR payment.purpose<>'order' THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='order_payment_not_found'; END IF;
  SELECT * INTO target FROM public.orders WHERE id=payment.order_id FOR UPDATE;
  IF target.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='order_not_found'; END IF;
  IF target.payment_id IS NOT NULL AND target.paid_amount=target.total_amount THEN RETURN target; END IF;
  IF p_received_amount<payment.payable_amount THEN
    UPDATE public.payments SET received_amount=p_received_amount,status='under_review',failure_code='underpaid' WHERE id=payment.id;
    RETURN target;
  END IF;
  cash:=private.ensure_wallet(NULL,target.currency_code,'platform_cash','cash:'||target.currency_code);
  revenue:=private.ensure_wallet(NULL,target.currency_code,'platform_revenue','revenue:'||target.currency_code);
  ledger:=private.post_wallet_transfer('order.direct','order-payment:'||payment.id::text,cash.id,revenue.id,'purchase',target.total_amount,target.currency_code,'order',target.id,'Direct order payment',NULL,jsonb_build_object('provider',payment.provider_code,'event_id',p_provider_event_id));
  UPDATE public.payments SET status='paid',received_amount=p_received_amount,credited_amount=least(p_received_amount,payable_amount),paid_at=coalesce(paid_at,statement_timestamp()),settled_at=statement_timestamp(),wallet_transaction_id=ledger.id WHERE id=payment.id;
  PERFORM set_config('app.order_actor_type','system',true);
  PERFORM set_config('app.order_source','payment_webhook',true);
  PERFORM set_config('app.order_metadata',jsonb_build_object('payment_id',payment.id,'event_id',p_provider_event_id)::text,true);
  UPDATE public.orders SET payment_id=payment.id,paid_amount=total_amount,status='paid' WHERE id=target.id RETURNING * INTO target;
  RETURN target;
END;
$$;
REVOKE ALL ON FUNCTION settle_order_payment(uuid,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION settle_order_payment(uuid,bigint,text) TO service_role;

-- Standard updated_at handling for mutable commerce tables.
CREATE OR REPLACE FUNCTION private.commerce_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN NEW.updated_at=statement_timestamp(); RETURN NEW; END; $$;
REVOKE ALL ON FUNCTION private.commerce_touch_updated_at() FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE item text; BEGIN
  FOREACH item IN ARRAY ARRAY['carts','cart_items','tier_prices','country_prices','quantity_discounts','flash_sales','flash_sale_scopes','coupons','coupon_categories','coupon_products','tax_rules','order_items','order_deliveries','order_messages','order_refund_requests','coupon_redemptions','cart_recovery_jobs']
  LOOP EXECUTE format('CREATE TRIGGER %I_touch BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION private.commerce_touch_updated_at()',item,item); END LOOP;
END $$;

-- RLS: the browser may only read its own commerce rows. All writes pass through validated server code.
DO $$ DECLARE item text; BEGIN
  FOREACH item IN ARRAY ARRAY['carts','cart_items','tier_prices','country_prices','quantity_discounts','flash_sales','flash_sale_scopes','coupons','coupon_categories','coupon_products','tax_rules','orders','order_items','order_events','order_deliveries','order_messages','order_refund_requests','coupon_redemptions','cart_recovery_jobs']
  LOOP EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',item); END LOOP;
END $$;

CREATE POLICY carts_owner_read ON carts FOR SELECT TO authenticated USING (profile_id=(SELECT auth.uid()));
CREATE POLICY cart_items_owner_read ON cart_items FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM carts c WHERE c.id=cart_id AND c.profile_id=(SELECT auth.uid())));
CREATE POLICY orders_owner_read ON orders FOR SELECT TO authenticated USING (profile_id=(SELECT auth.uid()) OR (SELECT private.app_can('orders.manage')) OR (SELECT private.app_can('finance.manage')));
CREATE POLICY order_items_owner_read ON order_items FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM orders o WHERE o.id=order_id AND (o.profile_id=(SELECT auth.uid()) OR (SELECT private.app_can('orders.manage')) OR (SELECT private.app_can('finance.manage')))));
CREATE POLICY order_events_owner_read ON order_events FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM orders o WHERE o.id=order_id AND (o.profile_id=(SELECT auth.uid()) OR (SELECT private.app_can('orders.manage')) OR (SELECT private.app_can('finance.manage')))));
CREATE POLICY order_deliveries_owner_read ON order_deliveries FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM orders o WHERE o.id=order_id AND (o.profile_id=(SELECT auth.uid()) OR (SELECT private.app_can('orders.manage')))));
CREATE POLICY order_messages_owner_read ON order_messages FOR SELECT TO authenticated USING (NOT internal AND EXISTS(SELECT 1 FROM orders o WHERE o.id=order_id AND o.profile_id=(SELECT auth.uid())) OR (SELECT private.app_can('orders.manage')));
CREATE POLICY order_refunds_owner_read ON order_refund_requests FOR SELECT TO authenticated USING (profile_id=(SELECT auth.uid()) OR (SELECT private.app_can('finance.manage')));

CREATE POLICY tier_prices_public_read ON tier_prices FOR SELECT TO anon,authenticated USING (deleted_at IS NULL AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>now()));
CREATE POLICY country_prices_public_read ON country_prices FOR SELECT TO anon,authenticated USING (deleted_at IS NULL);
CREATE POLICY quantity_discounts_public_read ON quantity_discounts FOR SELECT TO anon,authenticated USING (deleted_at IS NULL);
CREATE POLICY flash_sales_public_read ON flash_sales FOR SELECT TO anon,authenticated USING (active AND deleted_at IS NULL AND starts_at<=now() AND ends_at>now());
CREATE POLICY flash_scopes_public_read ON flash_sale_scopes FOR SELECT TO anon,authenticated USING (EXISTS(SELECT 1 FROM flash_sales f WHERE f.id=flash_sale_id AND f.active AND f.deleted_at IS NULL AND f.starts_at<=now() AND f.ends_at>now()));
CREATE POLICY tax_rules_public_read ON tax_rules FOR SELECT TO anon,authenticated USING (active AND deleted_at IS NULL AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>now()));

CREATE POLICY commerce_pricing_staff_all ON tier_prices FOR ALL TO authenticated USING ((SELECT private.app_can('catalog.manage'))) WITH CHECK ((SELECT private.app_can('catalog.manage')));
CREATE POLICY country_prices_staff_all ON country_prices FOR ALL TO authenticated USING ((SELECT private.app_can('catalog.manage'))) WITH CHECK ((SELECT private.app_can('catalog.manage')));
CREATE POLICY quantity_discounts_staff_all ON quantity_discounts FOR ALL TO authenticated USING ((SELECT private.app_can('catalog.manage'))) WITH CHECK ((SELECT private.app_can('catalog.manage')));
CREATE POLICY flash_sales_staff_all ON flash_sales FOR ALL TO authenticated USING ((SELECT private.app_can('catalog.manage'))) WITH CHECK ((SELECT private.app_can('catalog.manage')));
CREATE POLICY flash_scopes_staff_all ON flash_sale_scopes FOR ALL TO authenticated USING ((SELECT private.app_can('catalog.manage'))) WITH CHECK ((SELECT private.app_can('catalog.manage')));
CREATE POLICY coupons_staff_all ON coupons FOR ALL TO authenticated USING ((SELECT private.app_can('catalog.manage'))) WITH CHECK ((SELECT private.app_can('catalog.manage')));
CREATE POLICY coupon_categories_staff_all ON coupon_categories FOR ALL TO authenticated USING ((SELECT private.app_can('catalog.manage'))) WITH CHECK ((SELECT private.app_can('catalog.manage')));
CREATE POLICY coupon_products_staff_all ON coupon_products FOR ALL TO authenticated USING ((SELECT private.app_can('catalog.manage'))) WITH CHECK ((SELECT private.app_can('catalog.manage')));
CREATE POLICY tax_rules_staff_all ON tax_rules FOR ALL TO authenticated USING ((SELECT private.app_can('finance.manage'))) WITH CHECK ((SELECT private.app_can('finance.manage')));
CREATE POLICY coupon_redemptions_staff_read ON coupon_redemptions FOR SELECT TO authenticated USING ((SELECT private.app_can('finance.manage')));
CREATE POLICY recovery_jobs_staff_read ON cart_recovery_jobs FOR SELECT TO authenticated USING ((SELECT private.app_can('orders.manage')));

-- Explicit grants are required by the 2026 Data API exposure model; RLS remains authoritative.
GRANT SELECT ON tier_prices,country_prices,quantity_discounts,flash_sales,flash_sale_scopes,tax_rules TO anon,authenticated;
GRANT SELECT ON carts,cart_items,orders,order_items,order_events,order_deliveries,order_messages,order_refund_requests,coupon_redemptions,cart_recovery_jobs TO authenticated;
GRANT ALL ON carts,cart_items,tier_prices,country_prices,quantity_discounts,flash_sales,flash_sale_scopes,coupons,coupon_categories,coupon_products,tax_rules,orders,order_items,order_events,order_deliveries,order_messages,order_refund_requests,coupon_redemptions,cart_recovery_jobs TO service_role;
GRANT USAGE,SELECT ON SEQUENCE order_number_sequence TO service_role;

INSERT INTO role_permissions(role,permission,description) VALUES
  ('support','orders.manage','Read orders and customer conversations'),
  ('fulfiller','orders.manage','Process and deliver orders'),
  ('admin','orders.manage','Manage all orders'),
  ('owner','orders.manage','Manage all orders')
ON CONFLICT(role,permission) DO UPDATE SET description=EXCLUDED.description;

-- Realtime only exposes rows that pass the subscriber's SELECT policy.
ALTER PUBLICATION supabase_realtime ADD TABLE order_events,order_messages;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('order-deliveries','order-deliveries',false,52428800,ARRAY['application/pdf','application/zip','image/jpeg','image/png','text/plain','application/octet-stream'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
CREATE POLICY order_delivery_files_owner_read ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id='order-deliveries' AND EXISTS(
    SELECT 1 FROM orders o WHERE o.id=(storage.foldername(name))[1]::uuid
      AND (o.profile_id=(SELECT auth.uid()) OR (SELECT private.app_can('orders.manage')))
  )
);

COMMENT ON FUNCTION pay_order_with_wallet(uuid,uuid,text) IS 'Atomic idempotent wallet checkout; order row and wallet are locked in one transaction.';
COMMENT ON FUNCTION settle_order_payment(uuid,bigint,text) IS 'Idempotent direct-payment settlement into the double-entry platform ledger.';
COMMENT ON TABLE order_events IS 'Append-only public order state timeline generated by the database transition trigger.';
