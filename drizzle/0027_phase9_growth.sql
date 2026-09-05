-- Phase 9: referrals, affiliate commissions, fraud controls, loyalty and VIP.
-- Financial and points history is retained as auditable events; client writes use RPCs only.

CREATE TYPE public.referral_attribution_model AS ENUM ('first_touch','last_touch');
CREATE TYPE public.referral_fraud_status AS ENUM ('clear','review','blocked');
CREATE TYPE public.affiliate_commission_kind AS ENUM ('percent','fixed');
CREATE TYPE public.affiliate_commission_status AS ENUM ('pending','available','held_review','paid','reversed');
CREATE TYPE public.affiliate_payout_status AS ENUM ('requested','reviewing','approved','processing','paid','rejected','cancelled');
CREATE TYPE public.loyalty_entry_kind AS ENUM (
  'purchase','referral_bonus','review_bonus','streak_bonus','badge_bonus',
  'seasonal_bonus','wallet_redemption','discount_redemption','expiry','refund_reversal','admin_adjustment'
);
CREATE TYPE public.loyalty_redemption_kind AS ENUM ('wallet_credit','discount');

ALTER TABLE public.affiliate_accounts
  ADD COLUMN parent_affiliate_id uuid REFERENCES public.affiliate_accounts(id) ON DELETE SET NULL,
  ADD COLUMN application_message text,
  ADD COLUMN applied_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN rejection_reason text;
CREATE INDEX affiliate_accounts_parent_idx ON public.affiliate_accounts(parent_affiliate_id)
  WHERE parent_affiliate_id IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE public.customer_tiers
  ADD COLUMN wallet_limit_amount bigint CHECK (wallet_limit_amount IS NULL OR wallet_limit_amount >= 0),
  ADD COLUMN order_limit_amount bigint CHECK (order_limit_amount IS NULL OR order_limit_amount >= 0),
  ADD COLUMN limit_currency_code text REFERENCES public.currencies(code) ON UPDATE CASCADE,
  ADD COLUMN exclusive_products boolean NOT NULL DEFAULT false,
  ADD COLUMN dedicated_support boolean NOT NULL DEFAULT false,
  ADD COLUMN free_extras jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(free_extras)='array');

CREATE TABLE public.growth_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE CHECK (key ~ '^[a-z][a-z0-9_.-]{2,95}$'),
  value jsonb NOT NULL CHECK (jsonb_typeof(value) IN ('object','array','string','number','boolean')),
  description jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(description)='object'),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.growth_settings(key,value,description) VALUES
  ('referral.attribution_model','"last_touch"'::jsonb,'{"en":"Attribution model","ar":"نموذج الإحالة"}'),
  ('referral.cookie_days','90'::jsonb,'{"en":"Referral cookie lifetime","ar":"مدة ملف الإحالة"}'),
  ('affiliate.holding_days','14'::jsonb,'{"en":"Commission holding period","ar":"مدة تعليق العمولة"}'),
  ('affiliate.minimum_payout','{"USD":1000}'::jsonb,'{"en":"Minimum payout in minor units","ar":"الحد الأدنى للدفع"}'),
  ('fraud.velocity','{"signups_per_device_24h":3,"signups_per_ip_24h":5}'::jsonb,'{"en":"Referral velocity limits","ar":"حدود سرعة الإحالات"}'),
  ('loyalty.wallet_redemption','{"points":1000,"amount_minor":100,"currency":"USD"}'::jsonb,'{"en":"Wallet redemption rate","ar":"سعر استبدال النقاط"}'),
  ('loyalty.discount_redemption','{"points":500,"discount_bps":500,"expires_days":30}'::jsonb,'{"en":"Discount redemption rate","ar":"سعر استبدال الخصم"}')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE public.affiliate_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_account_id uuid NOT NULL REFERENCES public.affiliate_accounts(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[A-Za-z0-9_-]{4,80}$'),
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  destination_path text NOT NULL DEFAULT '/' CHECK (destination_path LIKE '/%' AND destination_path NOT LIKE '//%'),
  campaign text,
  active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX affiliate_links_account_idx ON public.affiliate_links(affiliate_account_id,created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE public.referral_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_account_id uuid NOT NULL REFERENCES public.affiliate_accounts(id) ON DELETE RESTRICT,
  affiliate_link_id uuid REFERENCES public.affiliate_links(id) ON DELETE SET NULL,
  visitor_token_hash text NOT NULL CHECK (visitor_token_hash ~ '^[a-f0-9]{64}$'),
  device_hash text CHECK (device_hash IS NULL OR device_hash ~ '^[a-f0-9]{64}$'),
  ip_hash text CHECK (ip_hash IS NULL OR ip_hash ~ '^[a-f0-9]{64}$'),
  user_agent_hash text CHECK (user_agent_hash IS NULL OR user_agent_hash ~ '^[a-f0-9]{64}$'),
  landing_path text NOT NULL DEFAULT '/',
  utm jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(utm)='object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX referral_clicks_affiliate_time_idx ON public.referral_clicks(affiliate_account_id,occurred_at DESC);
CREATE INDEX referral_clicks_link_time_idx ON public.referral_clicks(affiliate_link_id,occurred_at DESC) WHERE affiliate_link_id IS NOT NULL;
CREATE INDEX referral_clicks_device_time_idx ON public.referral_clicks(device_hash,occurred_at DESC) WHERE device_hash IS NOT NULL;
CREATE INDEX referral_clicks_ip_time_idx ON public.referral_clicks(ip_hash,occurred_at DESC) WHERE ip_hash IS NOT NULL;

CREATE TABLE public.referral_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referred_profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE RESTRICT,
  affiliate_account_id uuid NOT NULL REFERENCES public.affiliate_accounts(id) ON DELETE RESTRICT,
  affiliate_link_id uuid REFERENCES public.affiliate_links(id) ON DELETE SET NULL,
  parent_affiliate_account_id uuid REFERENCES public.affiliate_accounts(id) ON DELETE SET NULL,
  click_id uuid NOT NULL REFERENCES public.referral_clicks(id) ON DELETE RESTRICT,
  attribution_model public.referral_attribution_model NOT NULL,
  fraud_status public.referral_fraud_status NOT NULL DEFAULT 'clear',
  fraud_score integer NOT NULL DEFAULT 0 CHECK (fraud_score BETWEEN 0 AND 100),
  attributed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referral_attribution_self_ck CHECK (affiliate_account_id <> parent_affiliate_account_id)
);
CREATE INDEX referral_attributions_affiliate_idx ON public.referral_attributions(affiliate_account_id,attributed_at DESC);
CREATE INDEX referral_attributions_parent_idx ON public.referral_attributions(parent_affiliate_account_id,attributed_at DESC) WHERE parent_affiliate_account_id IS NOT NULL;
CREATE INDEX referral_attributions_fraud_idx ON public.referral_attributions(fraud_status,fraud_score DESC,created_at DESC) WHERE fraud_status <> 'clear';

CREATE TABLE public.affiliate_commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(name)='object'),
  category_id uuid REFERENCES public.categories(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  level smallint NOT NULL DEFAULT 1 CHECK (level IN (1,2)),
  commission_kind public.affiliate_commission_kind NOT NULL,
  value_amount bigint NOT NULL CHECK (value_amount >= 0),
  currency_code text REFERENCES public.currencies(code) ON UPDATE CASCADE,
  holding_days integer CHECK (holding_days IS NULL OR holding_days BETWEEN 0 AND 365),
  priority integer NOT NULL DEFAULT 0,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_rule_scope_ck CHECK (num_nonnulls(category_id,product_id) <= 1),
  CONSTRAINT affiliate_rule_value_ck CHECK (
    (commission_kind='percent' AND value_amount <= 10000 AND currency_code IS NULL)
    OR (commission_kind='fixed' AND currency_code IS NOT NULL)
  ),
  CONSTRAINT affiliate_rule_window_ck CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX affiliate_rules_lookup_idx ON public.affiliate_commission_rules(level,product_id,category_id,priority DESC)
  WHERE active AND deleted_at IS NULL;

CREATE TABLE public.affiliate_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_account_id uuid NOT NULL REFERENCES public.affiliate_accounts(id) ON DELETE RESTRICT,
  referred_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE RESTRICT,
  rule_id uuid REFERENCES public.affiliate_commission_rules(id) ON DELETE SET NULL,
  level smallint NOT NULL CHECK (level IN (1,2)),
  basis_amount bigint NOT NULL CHECK (basis_amount >= 0),
  amount bigint NOT NULL CHECK (amount >= 0),
  currency_code text NOT NULL REFERENCES public.currencies(code) ON UPDATE CASCADE,
  status public.affiliate_commission_status NOT NULL DEFAULT 'pending',
  available_at timestamptz NOT NULL,
  paid_at timestamptz,
  reversed_at timestamptz,
  payout_request_id uuid,
  fraud_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(fraud_snapshot)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_item_id,affiliate_account_id,level)
);
CREATE INDEX affiliate_commissions_account_status_idx ON public.affiliate_commissions(affiliate_account_id,status,available_at,created_at DESC);
CREATE INDEX affiliate_commissions_order_idx ON public.affiliate_commissions(order_id);

CREATE TABLE public.affiliate_commission_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_id uuid NOT NULL REFERENCES public.affiliate_commissions(id) ON DELETE RESTRICT,
  from_status public.affiliate_commission_status,
  to_status public.affiliate_commission_status NOT NULL,
  amount bigint NOT NULL CHECK (amount >= 0),
  currency_code text NOT NULL REFERENCES public.currencies(code) ON UPDATE CASCADE,
  reason text,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX affiliate_commission_events_commission_idx ON public.affiliate_commission_events(commission_id,created_at,id);

CREATE TABLE public.affiliate_payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_account_id uuid NOT NULL REFERENCES public.affiliate_accounts(id) ON DELETE RESTRICT,
  destination_kind text NOT NULL CHECK (destination_kind IN ('wallet','external')),
  amount bigint NOT NULL CHECK (amount > 0),
  currency_code text NOT NULL REFERENCES public.currencies(code) ON UPDATE CASCADE,
  status public.affiliate_payout_status NOT NULL DEFAULT 'requested',
  destination jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(destination)='object'),
  review_reason text,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  wallet_transaction_id uuid REFERENCES public.wallet_transactions(id) ON DELETE RESTRICT,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.affiliate_commissions ADD CONSTRAINT affiliate_commissions_payout_fk
  FOREIGN KEY (payout_request_id) REFERENCES public.affiliate_payout_requests(id) ON DELETE SET NULL;
CREATE INDEX affiliate_payouts_account_idx ON public.affiliate_payout_requests(affiliate_account_id,status,created_at DESC);
CREATE INDEX affiliate_payouts_queue_idx ON public.affiliate_payout_requests(status,created_at) WHERE status IN ('requested','reviewing','approved','processing');

CREATE TABLE public.affiliate_payout_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_request_id uuid NOT NULL REFERENCES public.affiliate_payout_requests(id) ON DELETE RESTRICT,
  commission_id uuid NOT NULL REFERENCES public.affiliate_commissions(id) ON DELETE RESTRICT,
  amount bigint NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(payout_request_id,commission_id)
);
CREATE INDEX affiliate_payout_allocations_commission_idx ON public.affiliate_payout_allocations(commission_id);

CREATE TABLE public.affiliate_marketing_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(name)='object'),
  description jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(description)='object'),
  asset_kind text NOT NULL CHECK (asset_kind IN ('banner','image','copy','video','document')),
  locale_code text REFERENCES public.locales(code) ON UPDATE CASCADE,
  storage_path text,
  external_url text,
  copy_text jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(copy_text)='object'),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_assets_content_ck CHECK (num_nonnulls(storage_path,external_url) > 0 OR copy_text <> '{}'::jsonb)
);

CREATE TABLE public.referral_fraud_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attribution_id uuid REFERENCES public.referral_attributions(id) ON DELETE CASCADE,
  affiliate_account_id uuid NOT NULL REFERENCES public.affiliate_accounts(id) ON DELETE RESTRICT,
  signal_kind text NOT NULL CHECK (signal_kind IN ('self_referral','same_device','ip_cluster','velocity','reused_identity','manual')),
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence)='object'),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','cleared','confirmed')),
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX referral_fraud_queue_idx ON public.referral_fraud_signals(status,severity,created_at) WHERE status IN ('open','reviewing');
CREATE INDEX referral_fraud_affiliate_idx ON public.referral_fraud_signals(affiliate_account_id,created_at DESC);

CREATE TABLE public.loyalty_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  cached_points bigint NOT NULL DEFAULT 0,
  lifetime_earned bigint NOT NULL DEFAULT 0 CHECK (lifetime_earned >= 0),
  current_tier_id uuid REFERENCES public.customer_tiers(id) ON DELETE SET NULL,
  streak_days integer NOT NULL DEFAULT 0 CHECK (streak_days >= 0),
  last_activity_date date,
  next_expiry_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX loyalty_accounts_tier_idx ON public.loyalty_accounts(current_tier_id);

CREATE TABLE public.loyalty_point_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loyalty_account_id uuid NOT NULL REFERENCES public.loyalty_accounts(id) ON DELETE RESTRICT,
  entry_kind public.loyalty_entry_kind NOT NULL,
  points bigint NOT NULL CHECK (points <> 0),
  source_type text NOT NULL,
  source_id uuid,
  idempotency_key text NOT NULL UNIQUE,
  available_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT loyalty_entry_expiry_ck CHECK (expires_at IS NULL OR expires_at > available_at)
);
CREATE INDEX loyalty_entries_account_time_idx ON public.loyalty_point_entries(loyalty_account_id,created_at DESC,id);
CREATE INDEX loyalty_entries_expiry_idx ON public.loyalty_point_entries(expires_at) WHERE expires_at IS NOT NULL AND points > 0;
CREATE INDEX loyalty_entries_source_idx ON public.loyalty_point_entries(source_type,source_id) WHERE source_id IS NOT NULL;

CREATE TABLE public.loyalty_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  kind public.loyalty_redemption_kind NOT NULL,
  points_spent bigint NOT NULL CHECK (points_spent > 0),
  amount_minor bigint,
  currency_code text REFERENCES public.currencies(code) ON UPDATE CASCADE,
  discount_bps integer CHECK (discount_bps IS NULL OR discount_bps BETWEEN 1 AND 10000),
  discount_expires_at timestamptz,
  used_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  wallet_transaction_id uuid REFERENCES public.wallet_transactions(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','used','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT loyalty_redemption_value_ck CHECK (
    (kind='wallet_credit' AND amount_minor > 0 AND currency_code IS NOT NULL AND discount_bps IS NULL)
    OR (kind='discount' AND discount_bps IS NOT NULL AND amount_minor IS NULL AND currency_code IS NULL)
  )
);
CREATE INDEX loyalty_redemptions_profile_idx ON public.loyalty_redemptions(profile_id,status,created_at DESC);
CREATE INDEX loyalty_discounts_available_idx ON public.loyalty_redemptions(profile_id,discount_expires_at) WHERE kind='discount' AND status='active';

CREATE TABLE public.loyalty_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[a-z][a-z0-9_.-]{2,63}$'),
  name jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(name)='object'),
  description jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(description)='object'),
  icon_name text NOT NULL,
  criteria jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(criteria)='object'),
  reward_points bigint NOT NULL DEFAULT 0 CHECK (reward_points >= 0),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.loyalty_badge_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  badge_id uuid NOT NULL REFERENCES public.loyalty_badges(id) ON DELETE RESTRICT,
  points_entry_id uuid REFERENCES public.loyalty_point_entries(id) ON DELETE RESTRICT,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id,badge_id)
);
CREATE INDEX loyalty_badge_awards_profile_idx ON public.loyalty_badge_awards(profile_id,awarded_at DESC);

CREATE TABLE public.loyalty_streak_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  activity_date date NOT NULL,
  streak_days integer NOT NULL CHECK (streak_days > 0),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id,activity_date)
);

CREATE TABLE public.vip_tier_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  from_tier_id uuid REFERENCES public.customer_tiers(id) ON DELETE SET NULL,
  to_tier_id uuid REFERENCES public.customer_tiers(id) ON DELETE SET NULL,
  lifetime_spend bigint NOT NULL DEFAULT 0 CHECK (lifetime_spend >= 0),
  currency_code text NOT NULL DEFAULT 'USD' REFERENCES public.currencies(code) ON UPDATE CASCADE,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vip_tier_events_profile_idx ON public.vip_tier_events(profile_id,created_at DESC);

INSERT INTO public.customer_tiers(code,name,description,minimum_lifetime_spend,discount_bps,points_multiplier_bps,priority_queue,benefits,sort_order,active,dedicated_support,exclusive_products,free_extras)
VALUES
  ('starter','{"en":"Starter","ar":"البداية"}','{"en":"Start earning with every order.","ar":"ابدأ بجمع النقاط مع كل طلب."}',0,0,10000,false,'["points"]',10,true,false,false,'[]'),
  ('insider','{"en":"Insider","ar":"المميز"}','{"en":"Faster rewards and member pricing.","ar":"مكافآت أسرع وأسعار للأعضاء."}',25000,200,11000,false,'["discount","points"]',20,true,false,false,'[]'),
  ('elite','{"en":"Elite","ar":"النخبة"}','{"en":"Priority delivery and exclusive access.","ar":"تسليم بأولوية ووصول حصري."}',100000,500,12500,true,'["discount","priority","exclusive"]',30,true,true,true,'[{"en":"Monthly extra","ar":"إضافة شهرية"}]'),
  ('icon','{"en":"Icon","ar":"أيقونة"}','{"en":"Our highest level of service.","ar":"أعلى مستوى من الخدمة."}',500000,800,15000,true,'["discount","priority","exclusive","support"]',40,true,true,true,'[{"en":"Premium extras","ar":"إضافات مميزة"}]')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.loyalty_rules(code,name,rule_kind,points_value,amount_minor,multiplier_bps,configuration,active)
VALUES
  ('purchase.default','{"en":"Purchase points","ar":"نقاط الشراء"}','earn',1,100,10000,'{"currency":"USD","expiry_days":365}',true),
  ('referral.qualified','{"en":"Qualified referral bonus","ar":"مكافأة الإحالة المؤهلة"}','earn',250,0,10000,'{}',true),
  ('review.approved','{"en":"Approved review bonus","ar":"مكافأة التقييم المقبول"}','earn',25,0,10000,'{}',true),
  ('streak.7','{"en":"Seven day streak","ar":"سلسلة سبعة أيام"}','streak',100,0,10000,'{"days":7}',true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.loyalty_badges(code,name,description,icon_name,criteria,reward_points,sort_order)
VALUES
  ('first_order','{"en":"First spark","ar":"الشرارة الأولى"}','{"en":"Complete your first order.","ar":"أكمل طلبك الأول."}','sparkles','{"metric":"order_count","threshold":1}',25,10),
  ('loyal_regular','{"en":"Loyal regular","ar":"عميل وفي"}','{"en":"Complete ten orders.","ar":"أكمل عشرة طلبات."}','award','{"metric":"order_count","threshold":10}',100,20),
  ('streak_hero','{"en":"Streak hero","ar":"بطل الاستمرارية"}','{"en":"Reach a seven-day streak.","ar":"حقق سلسلة من سبعة أيام."}','flame','{"metric":"streak","threshold":7}',100,30),
  ('community_builder','{"en":"Community builder","ar":"باني المجتمع"}','{"en":"Bring five qualified referrals.","ar":"اجلب خمس إحالات مؤهلة."}','users','{"metric":"referrals","threshold":5}',250,40)
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION private.growth_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN NEW.updated_at=statement_timestamp(); RETURN NEW; END;
$$;
REVOKE ALL ON FUNCTION private.growth_touch_updated_at() FROM PUBLIC,anon,authenticated,service_role;

DO $$ DECLARE item text; BEGIN
  FOREACH item IN ARRAY ARRAY[
    'growth_settings','affiliate_links','referral_fraud_signals','affiliate_commission_rules',
    'affiliate_commissions','affiliate_payout_requests','affiliate_marketing_assets','loyalty_accounts',
    'loyalty_redemptions','loyalty_badges'
  ] LOOP
    EXECUTE format('CREATE TRIGGER %I_touch BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.growth_touch_updated_at()',item,item);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION private.block_growth_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='growth_event_append_only'; END;
$$;
REVOKE ALL ON FUNCTION private.block_growth_event_mutation() FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE item text; BEGIN
  FOREACH item IN ARRAY ARRAY['referral_clicks','referral_attributions','affiliate_commission_events','loyalty_point_entries','loyalty_badge_awards','loyalty_streak_events','vip_tier_events'] LOOP
    EXECUTE format('CREATE TRIGGER %I_append_only BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.block_growth_event_mutation()',item,item);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION private.apply_loyalty_entry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO public.loyalty_accounts(profile_id)
  SELECT p.id FROM public.profiles p WHERE p.id=(NEW.metadata->>'profile_id')::uuid
  ON CONFLICT (profile_id) DO NOTHING;
  PERFORM 1 FROM public.loyalty_accounts WHERE id=NEW.loyalty_account_id FOR UPDATE;
  UPDATE public.loyalty_accounts SET
    cached_points=cached_points+NEW.points,
    lifetime_earned=lifetime_earned+greatest(NEW.points,0),
    next_expiry_at=(SELECT min(e.expires_at) FROM public.loyalty_point_entries e WHERE e.loyalty_account_id=NEW.loyalty_account_id AND e.points>0 AND e.expires_at>now()),
    updated_at=statement_timestamp()
  WHERE id=NEW.loyalty_account_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.apply_loyalty_entry() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER loyalty_point_entries_apply AFTER INSERT ON public.loyalty_point_entries
  FOR EACH ROW EXECUTE FUNCTION private.apply_loyalty_entry();

CREATE OR REPLACE FUNCTION private.prevent_loyalty_cache_write()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF pg_trigger_depth()<2 AND (NEW.cached_points,NEW.lifetime_earned) IS DISTINCT FROM (OLD.cached_points,OLD.lifetime_earned) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='loyalty_cache_trigger_only';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.prevent_loyalty_cache_write() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER loyalty_accounts_protect_cache BEFORE UPDATE ON public.loyalty_accounts
  FOR EACH ROW EXECUTE FUNCTION private.prevent_loyalty_cache_write();

ALTER TABLE public.growth_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_commission_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_payout_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_marketing_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_fraud_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_point_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_badge_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_streak_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vip_tier_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY growth_settings_staff_all ON public.growth_settings FOR ALL TO authenticated
  USING ((SELECT private.app_can('loyalty.manage')) OR (SELECT private.app_can('affiliate.manage')))
  WITH CHECK ((SELECT private.app_can('loyalty.manage')) OR (SELECT private.app_can('affiliate.manage')));
CREATE POLICY affiliate_links_owner_read ON public.affiliate_links FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.affiliate_accounts a WHERE a.id=affiliate_account_id AND (a.profile_id=(SELECT auth.uid()) OR (SELECT private.app_can('affiliate.manage')))));
CREATE POLICY referral_clicks_owner_read ON public.referral_clicks FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.affiliate_accounts a WHERE a.id=affiliate_account_id AND (a.profile_id=(SELECT auth.uid()) OR (SELECT private.app_can('affiliate.manage')))));
CREATE POLICY referral_attributions_owner_read ON public.referral_attributions FOR SELECT TO authenticated
  USING (referred_profile_id=(SELECT auth.uid()) OR EXISTS(SELECT 1 FROM public.affiliate_accounts a WHERE a.id=affiliate_account_id AND (a.profile_id=(SELECT auth.uid()) OR (SELECT private.app_can('affiliate.manage')))));
CREATE POLICY affiliate_rules_active_read ON public.affiliate_commission_rules FOR SELECT TO authenticated
  USING ((active AND deleted_at IS NULL) OR (SELECT private.app_can('affiliate.manage')));
CREATE POLICY affiliate_commissions_owner_read ON public.affiliate_commissions FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.affiliate_accounts a WHERE a.id=affiliate_account_id AND (a.profile_id=(SELECT auth.uid()) OR (SELECT private.app_can('affiliate.manage')))));
CREATE POLICY affiliate_commission_events_owner_read ON public.affiliate_commission_events FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.affiliate_commissions c JOIN public.affiliate_accounts a ON a.id=c.affiliate_account_id WHERE c.id=commission_id AND (a.profile_id=(SELECT auth.uid()) OR (SELECT private.app_can('affiliate.manage')))));
CREATE POLICY affiliate_payouts_owner_read ON public.affiliate_payout_requests FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.affiliate_accounts a WHERE a.id=affiliate_account_id AND (a.profile_id=(SELECT auth.uid()) OR (SELECT private.app_can('affiliate.manage')))));
CREATE POLICY affiliate_payout_allocations_owner_read ON public.affiliate_payout_allocations FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.affiliate_payout_requests p JOIN public.affiliate_accounts a ON a.id=p.affiliate_account_id WHERE p.id=payout_request_id AND (a.profile_id=(SELECT auth.uid()) OR (SELECT private.app_can('affiliate.manage')))));
CREATE POLICY affiliate_assets_member_read ON public.affiliate_marketing_assets FOR SELECT TO authenticated USING (active AND deleted_at IS NULL OR (SELECT private.app_can('affiliate.manage')));
CREATE POLICY referral_fraud_staff_all ON public.referral_fraud_signals FOR ALL TO authenticated
  USING ((SELECT private.app_can('affiliate.manage'))) WITH CHECK ((SELECT private.app_can('affiliate.manage')));
CREATE POLICY loyalty_accounts_owner_read ON public.loyalty_accounts FOR SELECT TO authenticated USING (profile_id=(SELECT auth.uid()) OR (SELECT private.app_can('loyalty.manage')));
CREATE POLICY loyalty_entries_owner_read ON public.loyalty_point_entries FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.loyalty_accounts a WHERE a.id=loyalty_account_id AND (a.profile_id=(SELECT auth.uid()) OR (SELECT private.app_can('loyalty.manage')))));
CREATE POLICY loyalty_redemptions_owner_read ON public.loyalty_redemptions FOR SELECT TO authenticated USING (profile_id=(SELECT auth.uid()) OR (SELECT private.app_can('loyalty.manage')));
CREATE POLICY loyalty_badges_member_read ON public.loyalty_badges FOR SELECT TO authenticated USING (active AND deleted_at IS NULL OR (SELECT private.app_can('loyalty.manage')));
CREATE POLICY loyalty_badge_awards_owner_read ON public.loyalty_badge_awards FOR SELECT TO authenticated USING (profile_id=(SELECT auth.uid()) OR (SELECT private.app_can('loyalty.manage')));
CREATE POLICY loyalty_streak_owner_read ON public.loyalty_streak_events FOR SELECT TO authenticated USING (profile_id=(SELECT auth.uid()) OR (SELECT private.app_can('loyalty.manage')));
CREATE POLICY vip_events_owner_read ON public.vip_tier_events FOR SELECT TO authenticated USING (profile_id=(SELECT auth.uid()) OR (SELECT private.app_can('loyalty.manage')));

REVOKE ALL ON public.growth_settings,public.affiliate_links,public.referral_clicks,public.referral_attributions,
  public.affiliate_commission_rules,public.affiliate_commissions,public.affiliate_commission_events,
  public.affiliate_payout_requests,public.affiliate_marketing_assets,public.referral_fraud_signals,
  public.affiliate_payout_allocations,
  public.loyalty_accounts,public.loyalty_point_entries,public.loyalty_redemptions,public.loyalty_badges,
  public.loyalty_badge_awards,public.loyalty_streak_events,public.vip_tier_events FROM anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.affiliate_links,public.referral_clicks,public.referral_attributions,
  public.affiliate_commission_rules,public.affiliate_commissions,public.affiliate_commission_events,
  public.affiliate_payout_requests,public.affiliate_marketing_assets,public.loyalty_accounts,
  public.affiliate_payout_allocations,
  public.loyalty_point_entries,public.loyalty_redemptions,public.loyalty_badges,public.loyalty_badge_awards,
  public.loyalty_streak_events,public.vip_tier_events FROM authenticated;
GRANT SELECT ON public.affiliate_links,public.referral_clicks,public.referral_attributions,
  public.affiliate_commission_rules,public.affiliate_commissions,public.affiliate_commission_events,
  public.affiliate_payout_requests,public.affiliate_marketing_assets,public.loyalty_accounts,
  public.affiliate_payout_allocations,
  public.loyalty_point_entries,public.loyalty_redemptions,public.loyalty_badges,public.loyalty_badge_awards,
  public.loyalty_streak_events,public.vip_tier_events TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.growth_settings,public.referral_fraud_signals TO authenticated;
GRANT ALL ON public.growth_settings,public.affiliate_links,public.referral_clicks,public.referral_attributions,
  public.affiliate_commission_rules,public.affiliate_commissions,public.affiliate_commission_events,
  public.affiliate_payout_requests,public.affiliate_marketing_assets,public.referral_fraud_signals,
  public.affiliate_payout_allocations,
  public.loyalty_accounts,public.loyalty_point_entries,public.loyalty_redemptions,public.loyalty_badges,
  public.loyalty_badge_awards,public.loyalty_streak_events,public.vip_tier_events TO service_role;

COMMENT ON TABLE public.referral_clicks IS 'Append-only, PII-safe referral click stream; IP, device and user-agent are stored only as salted hashes.';
COMMENT ON TABLE public.affiliate_commission_events IS 'Append-only commission state audit trail including refund reversals and payouts.';
COMMENT ON TABLE public.loyalty_point_entries IS 'Append-only signed loyalty points ledger; expiry and refunds use compensating negative entries.';
