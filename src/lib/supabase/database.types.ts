export type Json = string | number | boolean | null | {[key: string]: Json | undefined} | Json[];

export type AuditLogRow = {
  id: string;
  actor_id: string | null;
  actor_type: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  before: Json | null;
  after: Json | null;
  reason: string | null;
  request_id: string | null;
  ip_hash: string | null;
  user_agent_hash: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
};

export type UserRole =
  'customer' | 'reseller' | 'affiliate' | 'support' | 'fulfiller' | 'finance' | 'admin' | 'owner';
export type KycStatus = 'not_required' | 'not_started' | 'pending' | 'approved' | 'rejected';
export type NotificationChannel = 'email' | 'whatsapp' | 'telegram' | 'push' | 'in_app' | 'sms';
export type Phase10NotificationChannel = NotificationChannel;
export type NotificationDeliveryStatus =
  'queued' | 'processing' | 'sent' | 'delivered' | 'failed' | 'suppressed' | 'dead_letter';
export type ProductStatus = 'draft' | 'active' | 'out_of_stock' | 'coming_soon' | 'archived';
export type FulfillmentMode = 'auto' | 'manual' | 'auto_then_manual';
export type CatalogMediaKind = 'image' | 'video' | 'logo';
export type QuoteRequestStatus =
  'submitted' | 'reviewing' | 'quoted' | 'accepted' | 'declined' | 'cancelled';
export type WalletAccountType =
  | 'customer'
  | 'platform_cash'
  | 'platform_revenue'
  | 'platform_liability'
  | 'supplier'
  | 'affiliate'
  | 'customer_hold';
export type WalletTransactionType =
  | 'top_up'
  | 'purchase'
  | 'refund'
  | 'admin_adjustment'
  | 'affiliate_commission'
  | 'cashback'
  | 'hold'
  | 'release'
  | 'topup'
  | 'commission'
  | 'bonus'
  | 'payout'
  | 'fee'
  | 'chargeback';

type ProfileRow = {
  id: string;
  display_name: string | null;
  phone: string | null;
  phone_verified: boolean;
  locale_code: string;
  currency_code: string;
  timezone: string;
  country_code: string | null;
  avatar_path: string | null;
  marketing_consent: boolean;
  marketing_consent_at: string | null;
  referred_by: string | null;
  kyc_status: KycStatus;
  metadata: Json;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type LocaleRow = {
  id: string;
  code: string;
  name: string;
  native_name: string;
  direction: 'ltr' | 'rtl';
  enabled: boolean;
  is_default: boolean;
  fallback_code: string | null;
  intl_locale: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type CurrencyRow = {
  id: string;
  code: string;
  name: string;
  symbol: string;
  minor_unit: number;
  rounding_increment: number;
  enabled: boolean;
  is_base: boolean;
  exchange_rate_minor: number;
  rate_scale: number;
  rate_updated_at: string | null;
  manual_rate_override: boolean;
  created_at: string;
  updated_at: string;
};

type ProfileRoleRow = {
  id: string;
  profile_id: string;
  role: UserRole;
  granted_by: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

type RolePermissionRow = {
  id: string;
  role: UserRole;
  permission: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

type NotificationPreferenceRow = {
  id: string;
  profile_id: string;
  channel: NotificationChannel;
  transactional: boolean;
  order_updates: boolean;
  security_alerts: boolean;
  promotions: boolean;
  created_at: string;
  updated_at: string;
};

type UserSessionRow = {
  id: string;
  profile_id: string;
  user_agent: string | null;
  device_name: string;
  ip_hash: string | null;
  country_code: string | null;
  last_seen_at: string;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WalletRow = {
  id: string;
  owner_id: string | null;
  account_type: WalletAccountType;
  currency_code: string;
  cached_balance: number;
  locked: boolean;
  label: string | null;
  frozen_at: string | null;
  frozen_by: string | null;
  freeze_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type WalletTransactionRow = {
  id: string;
  debit_wallet_id: string;
  credit_wallet_id: string;
  type: WalletTransactionType;
  status: 'posted' | 'reversed';
  amount: number;
  currency_code: string;
  idempotency_scope: string;
  idempotency_key: string;
  reference_type: string;
  reference_id: string | null;
  reason: string | null;
  metadata: Json;
  reversal_of_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type WalletReconciliationRow = {
  id: string;
  wallet_id: string;
  derived_balance: number;
  cached_balance: number;
  difference: number;
  status: 'matched' | 'mismatch';
  checked_at: string;
  created_at: string;
  updated_at: string;
};

export type AdminAlertRow = {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  alert_type: string;
  title: Json;
  message: Json;
  resource_type: string;
  resource_id: string | null;
  fingerprint: string;
  status: 'open' | 'acknowledged' | 'resolved';
  metadata: Json;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductTypeRow = {
  id: string;
  code: string;
  name: Json;
  description: Json;
  icon_name: string | null;
  enabled: boolean;
  sort_order: number;
  capabilities: Json;
  created_at: string;
  updated_at: string;
};

export type CategoryRow = {
  id: string;
  parent_id: string | null;
  slug: string;
  name: Json;
  description: Json;
  icon_name: string | null;
  image_url: string | null;
  sort_order: number;
  active: boolean;
  seo: Json;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductRow = {
  id: string;
  category_id: string;
  product_type_code: string;
  slug: string;
  name: Json;
  short_description: Json;
  description: Json;
  badges: Json;
  status: ProductStatus;
  fulfillment_mode: FulfillmentMode;
  warranty_text: Json;
  delivery_estimate: Json;
  input_schema: Json;
  seo: Json;
  featured: boolean;
  sort_order: number;
  published_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  search_text: string;
  search_vector: unknown;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductVariantRow = {
  id: string;
  product_id: string;
  sku: string;
  name: Json;
  price_amount: number;
  currency_code: string;
  stock_quantity: number;
  unlimited_stock: boolean;
  region_code: string | null;
  duration_days: number | null;
  denomination_amount: number | null;
  denomination_currency_code: string | null;
  account_type: string | null;
  attributes: Json;
  active: boolean;
  sort_order: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductMediaRow = {
  id: string;
  product_id: string;
  variant_id: string | null;
  kind: CatalogMediaKind;
  url: string | null;
  storage_path: string | null;
  alt_text: Json;
  blur_data_url: string | null;
  sort_order: number;
  is_primary: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SmmProductConfigRow = {
  id: string;
  variant_id: string;
  min_quantity: number;
  max_quantity: number;
  quantity_step: number;
  price_per_1000_amount: number;
  currency_code: string;
  drip_feed_enabled: boolean;
  max_drip_runs: number | null;
  min_drip_interval_minutes: number | null;
  created_at: string;
  updated_at: string;
};

export type ServiceProductConfigRow = {
  id: string;
  product_id: string;
  requirement_schema: Json;
  milestone_templates: Json;
  included_revisions: number;
  custom_quote_required: boolean;
  created_at: string;
  updated_at: string;
};

export type ServiceQuoteRequestRow = {
  id: string;
  profile_id: string;
  product_id: string;
  variant_id: string | null;
  requirements: Json;
  budget_min_amount: number | null;
  budget_max_amount: number | null;
  currency_code: string | null;
  desired_due_at: string | null;
  status: QuoteRequestStatus;
  assigned_to: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CatalogSearchRow = {
  id: string;
  slug: string;
  name: Json;
  short_description: Json;
  badges: Json;
  status: ProductStatus;
  product_type_code: string;
  category_slug: string;
  price_amount: number;
  currency_code: string;
  primary_media_url: string | null;
  search_rank: number;
  total_count: number;
};

type PaymentMethodDbRow = {
  id: string;
  code: string;
  driver: string;
  flow: 'automatic' | 'proof';
  name: Json;
  description: Json;
  instructions: Json;
  enabled: boolean;
  sandbox_mode: boolean;
  min_amount: number;
  max_amount: number;
  fee_fixed: number;
  fee_bps: number;
  allowed_currencies: string[];
  allowed_countries: string[];
  allowed_tiers: string[];
  config: Json;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};
type PaymentDbStatus =
  | 'created'
  | 'requires_action'
  | 'awaiting_payment'
  | 'awaiting_proof'
  | 'under_review'
  | 'authorized'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'cancelled'
  | 'partially_refunded'
  | 'refunded'
  | 'disputed'
  | 'chargeback';
type PaymentDbRow = {
  id: string;
  profile_id: string | null;
  payment_method_id: string;
  provider_code: string;
  purpose: 'wallet_topup' | 'order';
  order_id: string | null;
  status: PaymentDbStatus;
  currency_code: string;
  requested_amount: number;
  fee_amount: number;
  payable_amount: number;
  received_amount: number;
  credited_amount: number;
  refunded_amount: number;
  payment_reference: string | null;
  provider_payment_id: string | null;
  provider_customer_id: string | null;
  idempotency_key: string;
  client_action: Json;
  provider_metadata: Json;
  failure_code: string | null;
  failure_message: string | null;
  sandbox_mode: boolean;
  expires_at: string | null;
  rate_locked_at: string | null;
  rate_expires_at: string | null;
  paid_at: string | null;
  settled_at: string | null;
  wallet_transaction_id: string | null;
  ai_risk_score: number | null;
  ai_risk_decision: 'allow' | 'review' | 'hold' | 'block' | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};
type PaymentProofDbRow = {
  id: string;
  payment_id: string;
  profile_id: string | null;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  byte_size: number;
  sha256: string;
  perceptual_hash: string | null;
  status: 'pending' | 'processing' | 'needs_review' | 'approved' | 'rejected';
  uploaded_at: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};
type PaymentProofCheckDbRow = {
  id: string;
  proof_id: string;
  engine: string;
  extracted_amount: number | null;
  extracted_currency: string | null;
  extracted_reference: string | null;
  extracted_date: string | null;
  extracted_sender: string | null;
  ai_model: string | null;
  confidence_bps: number;
  flags: string[];
  duplicate_of_proof_id: string | null;
  raw_result: Json;
  created_at: string;
  updated_at: string;
};
type PaymentQueueDbRow = {
  id: string;
  payment_id: string;
  proof_id: string;
  status: 'pending' | 'processing' | 'needs_review' | 'approved' | 'rejected';
  priority: number;
  claimed_by: string | null;
  claimed_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_reason: string | null;
  created_at: string;
  updated_at: string;
};
type PaymentWebhookDbRow = {
  id: string;
  provider_code: string;
  provider_event_id: string;
  event_type: string;
  signature_sha256: string;
  payload: Json;
  status: 'received' | 'processed' | 'ignored' | 'failed';
  attempts: number;
  payment_id: string | null;
  error_code: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
};
type PaymentRefundDbRow = {
  id: string;
  payment_id: string;
  amount: number;
  currency_code: string;
  provider_refund_id: string | null;
  idempotency_key: string;
  status: 'pending' | 'succeeded' | 'failed' | 'cancelled';
  reason: string;
  requested_by: string | null;
  wallet_transaction_id: string | null;
  failure_code: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};
type PaymentDisputeDbRow = {
  id: string;
  payment_id: string;
  provider_dispute_id: string;
  status: string;
  amount: number;
  currency_code: string;
  reason: string | null;
  evidence_due_at: string | null;
  closed_at: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};
type SavedPaymentMethodDbRow = {
  id: string;
  profile_id: string;
  provider_code: string;
  provider_customer_id: string;
  provider_payment_method_id: string;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  is_default: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};
type CryptoPaymentDbRow = {
  id: string;
  payment_id: string;
  asset: 'USDT' | 'BTC' | 'ETH';
  network: 'TRC20' | 'ERC20' | 'BEP20' | 'BITCOIN';
  pay_address: string;
  expected_atomic: string;
  received_atomic: string;
  atomic_scale: number;
  required_confirmations: number;
  current_confirmations: number;
  underpayment_tolerance_bps: number;
  overpayment_policy: string;
  quote_numerator: number;
  quote_denominator: number;
  expires_at: string;
  created_at: string;
  updated_at: string;
};
type PaymentAuditDbRow = {
  id: string;
  payment_id: string | null;
  actor_id: string | null;
  actor_type: string;
  action: string;
  request_id: string | null;
  ip_hash: string | null;
  before: Json | null;
  after: Json | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export type OrderStatus =
  | 'draft'
  | 'awaiting_payment'
  | 'paid'
  | 'processing'
  | 'partially_delivered'
  | 'delivered'
  | 'completed'
  | 'on_hold'
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'disputed';

type CartDbRow = {
  id: string;
  profile_id: string | null;
  guest_token_hash: string | null;
  status: 'active' | 'converted' | 'abandoned' | 'expired';
  currency_code: string;
  locale_code: string;
  country_code: string | null;
  coupon_codes: string[];
  last_activity_at: string;
  converted_order_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};
type CartItemDbRow = {
  id: string;
  cart_id: string;
  product_id: string;
  variant_id: string;
  quantity: number;
  option_values: Json;
  option_fingerprint: string;
  validation_snapshot: Json;
  unit_price_snapshot: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};
type PricingRuleDbRow = {
  id: string;
  variant_id: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: Json | string | number | boolean | null;
};
type FlashSaleDbRow = {
  id: string;
  name: Json;
  value_kind: 'percent' | 'fixed' | 'unit_price';
  value_amount: number;
  starts_at: string;
  ends_at: string;
  active: boolean;
  priority: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};
type CouponDbRow = {
  id: string;
  code: string;
  kind: 'percent' | 'fixed' | 'free_item';
  value_amount: number;
  currency_code: string | null;
  free_variant_id: string | null;
  usage_limit: number | null;
  per_user_limit: number | null;
  minimum_cart_amount: number;
  starts_at: string | null;
  expires_at: string | null;
  first_order_only: boolean;
  auto_apply: boolean;
  stackable: boolean;
  stack_group: string;
  priority: number;
  active: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};
type OrderDbRow = {
  id: string;
  order_number: string;
  profile_id: string | null;
  guest_email: string | null;
  guest_access_token_hash: string | null;
  cart_id: string | null;
  checkout_idempotency_key: string;
  status: OrderStatus;
  currency_code: string;
  locale_code: string;
  country_code: string;
  customer_notes: string | null;
  terms_accepted_at: string;
  subtotal_amount: number;
  discount_amount: number;
  fee_amount: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  refunded_amount: number;
  payment_id: string | null;
  wallet_transaction_id: string | null;
  pricing_snapshot: Json;
  ai_risk_score: number | null;
  ai_risk_decision: 'allow' | 'review' | 'hold' | 'block' | null;
  paid_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};
type OrderItemDbRow = {
  id: string;
  order_id: string;
  product_id: string;
  variant_id: string;
  sku: string;
  product_name: Json;
  variant_name: Json;
  option_values: Json;
  quantity: number;
  base_amount: number;
  tier_amount: number;
  country_amount: number;
  quantity_discount_amount: number;
  flash_discount_amount: number;
  coupon_discount_amount: number;
  loyalty_discount_amount: number;
  fee_amount: number;
  tax_amount: number;
  total_amount: number;
  fulfillment_mode: FulfillmentMode;
  delivered_quantity: number;
  warranty_text: Json;
  created_at: string;
  updated_at: string;
};
type OrderEventDbRow = {
  id: string;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  actor_id: string | null;
  actor_type: string;
  source: string;
  reason: string | null;
  public_message: Json;
  metadata: Json;
  created_at: string;
  updated_at: string;
};
type OrderDeliveryDbRow = {
  id: string;
  order_id: string;
  order_item_id: string;
  kind: 'code' | 'text' | 'file' | 'link';
  payload_ciphertext: string | null;
  display_hint: string | null;
  storage_path: string | null;
  delivered_by: string | null;
  revealed_at: string | null;
  reveal_count: number;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};
type OrderMessageDbRow = {
  id: string;
  order_id: string;
  author_id: string | null;
  author_type: string;
  body: string;
  attachment_path: string | null;
  internal: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};
type OrderRefundDbRow = {
  id: string;
  order_id: string;
  profile_id: string | null;
  requested_amount: number;
  reason: string;
  status: 'pending' | 'reviewing' | 'approved' | 'rejected' | 'processed';
  reviewed_by: string | null;
  review_reason: string | null;
  reviewed_at: string | null;
  payment_refund_id: string | null;
  wallet_transaction_id: string | null;
  created_at: string;
  updated_at: string;
};

export type FulfillmentJobStatus =
  'pending' | 'running' | 'retrying' | 'completed' | 'failed' | 'dead_letter' | 'cancelled';
export type SupplierOrderStatus =
  'queued' | 'submitted' | 'processing' | 'partial' | 'completed' | 'failed' | 'cancelled';
export type ManualFulfillmentStatus =
  | 'queued'
  | 'claimed'
  | 'in_progress'
  | 'waiting_customer'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'sla_breached';

export type FulfillmentJobDbRow = {
  id: string;
  kind: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: Json;
  status: FulfillmentJobStatus;
  priority: number;
  run_at: string;
  attempt_count: number;
  max_attempts: number;
  locked_by: string | null;
  locked_until: string | null;
  last_error_code: string | null;
  last_error_safe: string | null;
  result: Json | null;
  idempotency_key: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type StockCodeDbRow = {
  id: string;
  variant_id: string;
  import_batch_id: string | null;
  payload_ciphertext: string;
  payload_hash: string;
  display_hint: string | null;
  status: 'available' | 'assigned' | 'expired' | 'disabled';
  expires_at: string | null;
  assigned_order_item_id: string | null;
  assigned_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SupplierDbRow = {
  id: string;
  code: string;
  name: string;
  driver: 'smm_panel' | 'reseller_api' | 'mock';
  endpoint: string;
  api_key_ciphertext: string | null;
  currency_code: string;
  margin_bps: number;
  priority: number;
  enabled: boolean;
  sandbox_mode: boolean;
  health_status: 'healthy' | 'degraded' | 'open' | 'disabled';
  consecutive_failures: number;
  success_count: number;
  failure_count: number;
  partial_count: number;
  average_latency_ms: number | null;
  last_health_check_at: string | null;
  settings: Json;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SupplierProductDbRow = {
  id: string;
  supplier_id: string;
  variant_id: string;
  external_service_id: string;
  cost_amount: number;
  cost_currency_code: string;
  minimum_quantity: number;
  maximum_quantity: number | null;
  quantity_step: number;
  priority: number;
  active: boolean;
  mapping: Json;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SupplierOrderDbRow = {
  id: string;
  supplier_id: string;
  supplier_product_id: string;
  order_id: string;
  order_item_id: string;
  external_order_id: string | null;
  idempotency_key: string;
  status: SupplierOrderStatus;
  requested_quantity: number;
  delivered_quantity: number;
  target_ciphertext: string | null;
  request_safe: Json;
  response_safe: Json;
  cost_amount: number;
  cost_currency_code: string;
  placed_at: string | null;
  completed_at: string | null;
  last_checked_at: string | null;
  next_poll_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ManualFulfillmentTaskDbRow = {
  id: string;
  order_id: string;
  order_item_id: string;
  fallback_attempt_id: string | null;
  status: ManualFulfillmentStatus;
  priority: 'normal' | 'high' | 'vip' | 'urgent';
  sla_due_at: string;
  claimed_by: string | null;
  assigned_to: string | null;
  claimed_at: string | null;
  started_at: string | null;
  waiting_since: string | null;
  completed_at: string | null;
  failure_context: Json;
  version: number;
  created_at: string;
  updated_at: string;
};

type TableDefinition<Row, Insert = Partial<Row>, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};
type Phase10GenericRow = {id: string; [key: string]: Json | undefined};
type Phase10GenericInsert = {id?: string; [key: string]: Json | undefined};

export type NotificationEventRow = {
  id: string;
  profile_id: string;
  event_key: string;
  locale_code: string;
  data: Json;
  idempotency_key: string;
  source_type: string | null;
  source_id: string | null;
  available_at: string;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
};
export type NotificationDeliveryRow = {
  id: string;
  event_id: string;
  profile_id: string;
  channel: Phase10NotificationChannel;
  status: NotificationDeliveryStatus;
  provider_message_id: string | null;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  last_error: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};
export type InAppNotificationRow = {
  id: string;
  delivery_id: string;
  profile_id: string;
  event_key: string;
  title: string;
  body: string;
  action_url: string | null;
  data: Json;
  read_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};
export type SupportTicketMessageRow = {
  id: string;
  ticket_id: string;
  author_id: string | null;
  author_type: 'customer' | 'staff' | 'system';
  kind: 'message' | 'internal_note' | 'status_change' | 'system';
  body: string;
  metadata: Json;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: TableDefinition<ProfileRow, Partial<ProfileRow> & {id: string}>;
      locales: TableDefinition<
        LocaleRow,
        Partial<LocaleRow> & {code: string; name: string; native_name: string; intl_locale: string}
      >;
      currencies: TableDefinition<
        CurrencyRow,
        Partial<CurrencyRow> & {code: string; name: string; symbol: string}
      >;
      profile_roles: TableDefinition<
        ProfileRoleRow,
        Partial<ProfileRoleRow> & {profile_id: string; role: UserRole}
      >;
      role_permissions: TableDefinition<
        RolePermissionRow,
        Partial<RolePermissionRow> & {role: UserRole; permission: string}
      >;
      notification_preferences: TableDefinition<
        NotificationPreferenceRow,
        Partial<NotificationPreferenceRow> & {profile_id: string; channel: NotificationChannel}
      >;
      notification_settings: TableDefinition<Phase10GenericRow, Phase10GenericInsert>;
      notification_event_preferences: TableDefinition<Phase10GenericRow, Phase10GenericInsert>;
      notification_channel_connections: TableDefinition<Phase10GenericRow, Phase10GenericInsert>;
      notification_verifications: TableDefinition<Phase10GenericRow, Phase10GenericInsert>;
      push_subscriptions: TableDefinition<Phase10GenericRow, Phase10GenericInsert>;
      notification_events: TableDefinition<
        NotificationEventRow,
        Partial<NotificationEventRow> & {
          profile_id: string;
          event_key: string;
          locale_code: string;
          idempotency_key: string;
        }
      >;
      notification_deliveries: TableDefinition<
        NotificationDeliveryRow,
        Partial<NotificationDeliveryRow> & {
          event_id: string;
          profile_id: string;
          channel: Phase10NotificationChannel;
        }
      >;
      in_app_notifications: TableDefinition<
        InAppNotificationRow,
        Partial<InAppNotificationRow> & {
          delivery_id: string;
          profile_id: string;
          event_key: string;
          title: string;
          body: string;
        }
      >;
      notification_unsubscribes: TableDefinition<Phase10GenericRow, Phase10GenericInsert>;
      notification_webhook_events: TableDefinition<Phase10GenericRow, Phase10GenericInsert>;
      notification_templates: TableDefinition<Phase10GenericRow, Phase10GenericInsert>;
      privacy_consents: TableDefinition<Phase10GenericRow, Phase10GenericInsert>;
      data_export_requests: TableDefinition<Phase10GenericRow, Phase10GenericInsert>;
      account_deletion_requests: TableDefinition<Phase10GenericRow, Phase10GenericInsert>;
      retention_runs: TableDefinition<Phase10GenericRow, Phase10GenericInsert>;
      support_ticket_categories: TableDefinition<Phase10GenericRow, Phase10GenericInsert>;
      support_tickets: TableDefinition<Phase10GenericRow, Phase10GenericInsert>;
      support_ticket_messages: TableDefinition<
        SupportTicketMessageRow,
        Partial<SupportTicketMessageRow> & {
          ticket_id: string;
          author_type: 'customer' | 'staff' | 'system';
          body: string;
        }
      >;
      support_ticket_attachments: TableDefinition<Phase10GenericRow, Phase10GenericInsert>;
      support_canned_replies: TableDefinition<Phase10GenericRow, Phase10GenericInsert>;
      knowledge_categories: TableDefinition<Phase10GenericRow, Phase10GenericInsert>;
      knowledge_articles: TableDefinition<Phase10GenericRow, Phase10GenericInsert>;
      knowledge_faqs: TableDefinition<Phase10GenericRow, Phase10GenericInsert>;
      reviews: TableDefinition<Phase10GenericRow, Phase10GenericInsert>;
      review_replies: TableDefinition<Phase10GenericRow, Phase10GenericInsert>;
      product_review_aggregates: TableDefinition<Phase10GenericRow, Phase10GenericInsert>;
      user_sessions: TableDefinition<
        UserSessionRow,
        Partial<UserSessionRow> & {id: string; profile_id: string}
      >;
      audit_logs: TableDefinition<
        AuditLogRow,
        Partial<AuditLogRow> & {
          actor_type: string;
          action: string;
          resource_type: string;
        }
      >;
      wallets: TableDefinition<
        WalletRow,
        Partial<WalletRow> & {account_type: WalletAccountType; currency_code: string}
      >;
      wallet_transactions: TableDefinition<
        WalletTransactionRow,
        Partial<WalletTransactionRow> & {
          debit_wallet_id: string;
          credit_wallet_id: string;
          type: WalletTransactionType;
          amount: number;
          currency_code: string;
          idempotency_scope: string;
          idempotency_key: string;
          reference_type: string;
        }
      >;
      wallet_reconciliations: TableDefinition<
        WalletReconciliationRow,
        Partial<WalletReconciliationRow> & {
          wallet_id: string;
          derived_balance: number;
          cached_balance: number;
          difference: number;
          status: 'matched' | 'mismatch';
        }
      >;
      admin_alerts: TableDefinition<
        AdminAlertRow,
        Partial<AdminAlertRow> & {
          severity: 'info' | 'warning' | 'critical';
          alert_type: string;
          title: Json;
          message: Json;
          resource_type: string;
          fingerprint: string;
        }
      >;
      product_types: TableDefinition<
        ProductTypeRow,
        Partial<ProductTypeRow> & {code: string; name: Json}
      >;
      categories: TableDefinition<CategoryRow, Partial<CategoryRow> & {slug: string; name: Json}>;
      category_closure: TableDefinition<
        {
          id: string;
          ancestor_id: string;
          descendant_id: string;
          depth: number;
          created_at: string;
          updated_at: string;
        },
        {
          ancestor_id: string;
          descendant_id: string;
          depth: number;
          id?: string;
          created_at?: string;
          updated_at?: string;
        }
      >;
      products: TableDefinition<
        ProductRow,
        Partial<ProductRow> & {
          category_id: string;
          product_type_code: string;
          slug: string;
          name: Json;
        }
      >;
      product_variants: TableDefinition<
        ProductVariantRow,
        Partial<ProductVariantRow> & {
          product_id: string;
          sku: string;
          name: Json;
          price_amount: number;
          currency_code: string;
        }
      >;
      product_variant_costs: TableDefinition<
        {
          id: string;
          variant_id: string;
          cost_amount: number;
          currency_code: string;
          source: string;
          created_at: string;
          updated_at: string;
        },
        {
          variant_id: string;
          cost_amount: number;
          currency_code: string;
          source?: string;
          id?: string;
          created_at?: string;
          updated_at?: string;
        }
      >;
      product_media: TableDefinition<
        ProductMediaRow,
        Partial<ProductMediaRow> & {product_id: string; alt_text: Json}
      >;
      product_relations: TableDefinition<
        {
          id: string;
          product_id: string;
          related_product_id: string;
          relation_type: string;
          score: number;
          sort_order: number;
          created_at: string;
          updated_at: string;
        },
        {
          product_id: string;
          related_product_id: string;
          relation_type?: string;
          score?: number;
          sort_order?: number;
          id?: string;
          created_at?: string;
          updated_at?: string;
        }
      >;
      smm_product_configs: TableDefinition<
        SmmProductConfigRow,
        Partial<SmmProductConfigRow> & {
          variant_id: string;
          min_quantity: number;
          max_quantity: number;
          price_per_1000_amount: number;
          currency_code: string;
        }
      >;
      service_product_configs: TableDefinition<
        ServiceProductConfigRow,
        Partial<ServiceProductConfigRow> & {product_id: string}
      >;
      service_quote_requests: TableDefinition<
        ServiceQuoteRequestRow,
        Partial<ServiceQuoteRequestRow> & {
          profile_id: string;
          product_id: string;
          requirements: Json;
        }
      >;
      recently_viewed_products: TableDefinition<
        {
          id: string;
          profile_id: string;
          product_id: string;
          viewed_at: string;
          created_at: string;
          updated_at: string;
        },
        {
          profile_id: string;
          product_id: string;
          id?: string;
          viewed_at?: string;
          created_at?: string;
          updated_at?: string;
        }
      >;
      payment_methods: TableDefinition<
        PaymentMethodDbRow,
        Partial<PaymentMethodDbRow> & {code: string; driver: string; flow: 'automatic' | 'proof'}
      >;
      payments: TableDefinition<
        PaymentDbRow,
        Partial<PaymentDbRow> & {
          payment_method_id: string;
          provider_code: string;
          currency_code: string;
          requested_amount: number;
          payable_amount: number;
          idempotency_key: string;
        }
      >;
      payment_proofs: TableDefinition<
        PaymentProofDbRow,
        Partial<PaymentProofDbRow> & {
          payment_id: string;
          storage_path: string;
          original_filename: string;
          mime_type: string;
          byte_size: number;
          sha256: string;
        }
      >;
      payment_proof_checks: TableDefinition<
        PaymentProofCheckDbRow,
        Partial<PaymentProofCheckDbRow> & {proof_id: string; engine: string}
      >;
      payment_verification_queue: TableDefinition<
        PaymentQueueDbRow,
        Partial<PaymentQueueDbRow> & {payment_id: string; proof_id: string}
      >;
      payment_webhook_events: TableDefinition<
        PaymentWebhookDbRow,
        Partial<PaymentWebhookDbRow> & {
          provider_code: string;
          provider_event_id: string;
          event_type: string;
          signature_sha256: string;
        }
      >;
      payment_refunds: TableDefinition<
        PaymentRefundDbRow,
        Partial<PaymentRefundDbRow> & {
          payment_id: string;
          amount: number;
          currency_code: string;
          idempotency_key: string;
          reason: string;
        }
      >;
      payment_disputes: TableDefinition<
        PaymentDisputeDbRow,
        Partial<PaymentDisputeDbRow> & {
          payment_id: string;
          provider_dispute_id: string;
          status: string;
          amount: number;
          currency_code: string;
        }
      >;
      saved_payment_methods: TableDefinition<
        SavedPaymentMethodDbRow,
        Partial<SavedPaymentMethodDbRow> & {
          profile_id: string;
          provider_code: string;
          provider_customer_id: string;
          provider_payment_method_id: string;
        }
      >;
      crypto_payment_details: TableDefinition<
        CryptoPaymentDbRow,
        Partial<CryptoPaymentDbRow> & {
          payment_id: string;
          asset: 'USDT' | 'BTC' | 'ETH';
          network: 'TRC20' | 'ERC20' | 'BEP20' | 'BITCOIN';
          pay_address: string;
          expected_atomic: string;
          atomic_scale: number;
          required_confirmations: number;
          quote_numerator: number;
          quote_denominator: number;
          expires_at: string;
        }
      >;
      payment_audit_logs: TableDefinition<
        PaymentAuditDbRow,
        Partial<PaymentAuditDbRow> & {actor_type: string; action: string}
      >;
      carts: TableDefinition<
        CartDbRow,
        Partial<CartDbRow> & {currency_code: string; locale_code: string}
      >;
      cart_items: TableDefinition<
        CartItemDbRow,
        Partial<CartItemDbRow> & {
          cart_id: string;
          product_id: string;
          variant_id: string;
          option_fingerprint: string;
        }
      >;
      tier_prices: TableDefinition<PricingRuleDbRow>;
      country_prices: TableDefinition<PricingRuleDbRow>;
      quantity_discounts: TableDefinition<PricingRuleDbRow>;
      flash_sales: TableDefinition<FlashSaleDbRow>;
      flash_sale_scopes: TableDefinition<PricingRuleDbRow>;
      coupons: TableDefinition<CouponDbRow>;
      coupon_categories: TableDefinition<PricingRuleDbRow>;
      coupon_products: TableDefinition<PricingRuleDbRow>;
      tax_rules: TableDefinition<PricingRuleDbRow>;
      orders: TableDefinition<
        OrderDbRow,
        Partial<OrderDbRow> & {
          currency_code: string;
          locale_code: string;
          country_code: string;
          terms_accepted_at: string;
          subtotal_amount: number;
          total_amount: number;
          pricing_snapshot: Json;
        }
      >;
      order_items: TableDefinition<
        OrderItemDbRow,
        Partial<OrderItemDbRow> & {
          order_id: string;
          product_id: string;
          variant_id: string;
          sku: string;
          product_name: Json;
          variant_name: Json;
          quantity: number;
          base_amount: number;
          total_amount: number;
          fulfillment_mode: FulfillmentMode;
        }
      >;
      order_events: TableDefinition<OrderEventDbRow>;
      order_deliveries: TableDefinition<OrderDeliveryDbRow>;
      order_messages: TableDefinition<
        OrderMessageDbRow,
        Partial<OrderMessageDbRow> & {order_id: string; author_type: string; body: string}
      >;
      order_refund_requests: TableDefinition<
        OrderRefundDbRow,
        Partial<OrderRefundDbRow> & {order_id: string; requested_amount: number; reason: string}
      >;
      coupon_redemptions: TableDefinition<PricingRuleDbRow>;
      cart_recovery_jobs: TableDefinition<PricingRuleDbRow>;
      fulfillment_jobs: TableDefinition<
        FulfillmentJobDbRow,
        Partial<FulfillmentJobDbRow> & {
          kind: string;
          aggregate_type: string;
          aggregate_id: string;
          idempotency_key: string;
        }
      >;
      fulfillment_job_attempts: TableDefinition<Record<string, Json>>;
      fulfillment_dead_letters: TableDefinition<Record<string, Json>>;
      stock_code_import_batches: TableDefinition<Record<string, Json>>;
      stock_codes: TableDefinition<
        StockCodeDbRow,
        Partial<StockCodeDbRow> & {
          variant_id: string;
          payload_ciphertext: string;
          payload_hash: string;
        }
      >;
      suppliers: TableDefinition<
        SupplierDbRow,
        Partial<SupplierDbRow> & {
          code: string;
          name: string;
          driver: SupplierDbRow['driver'];
          endpoint: string;
          currency_code: string;
        }
      >;
      supplier_products: TableDefinition<
        SupplierProductDbRow,
        Partial<SupplierProductDbRow> & {
          supplier_id: string;
          variant_id: string;
          external_service_id: string;
          cost_amount: number;
          cost_currency_code: string;
        }
      >;
      supplier_circuits: TableDefinition<Record<string, Json>>;
      supplier_orders: TableDefinition<
        SupplierOrderDbRow,
        Partial<SupplierOrderDbRow> & {
          supplier_id: string;
          supplier_product_id: string;
          order_id: string;
          order_item_id: string;
          idempotency_key: string;
          requested_quantity: number;
          cost_currency_code: string;
        }
      >;
      supplier_order_events: TableDefinition<Record<string, Json>>;
      fulfillment_attempts: TableDefinition<Record<string, Json>>;
      manual_fulfillment_tasks: TableDefinition<
        ManualFulfillmentTaskDbRow,
        Partial<ManualFulfillmentTaskDbRow> & {
          order_id: string;
          order_item_id: string;
          sla_due_at: string;
        }
      >;
      manual_fulfillment_notes: TableDefinition<Record<string, Json>>;
      fulfillment_notifications: TableDefinition<Record<string, Json>>;
      growth_settings: TableDefinition<Record<string, Json>>;
      affiliate_links: TableDefinition<Record<string, Json>>;
      referral_clicks: TableDefinition<Record<string, Json>>;
      referral_attributions: TableDefinition<Record<string, Json>>;
      affiliate_commission_rules: TableDefinition<Record<string, Json>>;
      affiliate_commissions: TableDefinition<Record<string, Json>>;
      affiliate_commission_events: TableDefinition<Record<string, Json>>;
      affiliate_payout_requests: TableDefinition<Record<string, Json>>;
      affiliate_payout_allocations: TableDefinition<Record<string, Json>>;
      affiliate_marketing_assets: TableDefinition<Record<string, Json>>;
      referral_fraud_signals: TableDefinition<Record<string, Json>>;
      loyalty_accounts: TableDefinition<Record<string, Json>>;
      loyalty_point_entries: TableDefinition<Record<string, Json>>;
      loyalty_redemptions: TableDefinition<Record<string, Json>>;
      loyalty_badges: TableDefinition<Record<string, Json>>;
      loyalty_badge_awards: TableDefinition<Record<string, Json>>;
      loyalty_streak_events: TableDefinition<Record<string, Json>>;
      vip_tier_events: TableDefinition<Record<string, Json>>;
    };
    Views: {
      supplier_reliability: {
        Row: {
          id: string;
          code: string;
          name: string;
          health_status: SupplierDbRow['health_status'];
          success_count: number;
          failure_count: number;
          partial_count: number;
          average_latency_ms: number | null;
          reliability_bps: number;
          tracked_cost_amount: number;
          currency_code: string;
        };
        Relationships: [];
      };
      fulfillment_profit_summary: {
        Row: {
          order_id: string;
          order_number: string;
          currency_code: string;
          total_amount: number;
          supplier_cost_amount: number;
          gross_profit_amount: number;
        };
        Relationships: [];
      };
      fulfiller_performance: {
        Row: {
          profile_id: string;
          completed_tasks: number;
          sla_breaches: number;
          average_completion_seconds: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      create_support_ticket: {
        Args: {
          p_category_code: string;
          p_subject: string;
          p_description: string;
          p_order_id?: string | null;
        };
        Returns: Phase10GenericRow;
      };
      post_support_message: {
        Args: {p_ticket_id: string; p_body: string; p_internal?: boolean};
        Returns: SupportTicketMessageRow;
      };
      reopen_support_ticket: {Args: {p_ticket_id: string}; Returns: Phase10GenericRow};
      rate_support_ticket: {
        Args: {p_ticket_id: string; p_rating: number; p_comment?: string | null};
        Returns: Phase10GenericRow;
      };
      submit_verified_review: {
        Args: {
          p_order_item_id: string;
          p_rating: number;
          p_title: string;
          p_body: string;
          p_image_paths?: Json;
        };
        Returns: Phase10GenericRow;
      };
      mark_notification_read: {Args: {p_notification_id: string}; Returns: InAppNotificationRow};
      mark_all_notifications_read: {Args: Record<never, never>; Returns: number};
      search_knowledge: {
        Args: {p_query: string; p_locale?: string; p_limit?: number};
        Returns: Array<{id: string; slug: string; title: string; excerpt: string; rank: number}>;
      };
      app_can: {Args: {required_permission: string}; Returns: boolean};
      app_has_role: {Args: {required_role: UserRole}; Returns: boolean};
      touch_user_session: {
        Args: {
          p_device_name: string;
          p_user_agent?: string | null;
          p_ip_hash?: string | null;
          p_country_code?: string | null;
        };
        Returns: UserSessionRow;
      };
      revoke_user_session: {Args: {p_session_id: string}; Returns: undefined};
      search_catalog: {
        Args: {
          p_locale?: string;
          p_query?: string | null;
          p_category_slug?: string | null;
          p_product_type?: string | null;
          p_region?: string | null;
          p_min_price?: number | null;
          p_max_price?: number | null;
          p_sort?: string;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: CatalogSearchRow[];
      };
      wallet_credit: {
        Args: {
          p_owner_id: string;
          p_currency_code: string;
          p_amount: number;
          p_type: WalletTransactionType;
          p_idempotency_key: string;
          p_reference_type: string;
          p_reference_id?: string | null;
          p_reason?: string | null;
          p_metadata?: Json;
        };
        Returns: WalletTransactionRow;
      };
      wallet_debit: {
        Args: {
          p_owner_id: string;
          p_currency_code: string;
          p_amount: number;
          p_type: WalletTransactionType;
          p_idempotency_key: string;
          p_reference_type: string;
          p_reference_id?: string | null;
          p_reason?: string | null;
          p_metadata?: Json;
        };
        Returns: WalletTransactionRow;
      };
      wallet_hold: {
        Args: {
          p_owner_id: string;
          p_currency_code: string;
          p_amount: number;
          p_idempotency_key: string;
          p_reference_type: string;
          p_reference_id?: string | null;
          p_metadata?: Json;
        };
        Returns: WalletTransactionRow;
      };
      wallet_release: {
        Args: {
          p_owner_id: string;
          p_currency_code: string;
          p_amount: number;
          p_idempotency_key: string;
          p_reference_type: string;
          p_reference_id?: string | null;
          p_metadata?: Json;
        };
        Returns: WalletTransactionRow;
      };
      wallet_admin_adjust: {
        Args: {
          p_owner_id: string;
          p_currency_code: string;
          p_signed_amount: number;
          p_idempotency_key: string;
          p_reason: string;
        };
        Returns: WalletTransactionRow;
      };
      wallet_set_frozen: {
        Args: {p_wallet_id: string; p_frozen: boolean; p_reason: string; p_request_id: string};
        Returns: WalletRow;
      };
      run_wallet_reconciliation: {Args: Record<never, never>; Returns: number};
      settle_wallet_topup: {
        Args: {
          p_payment_id: string;
          p_received_amount: number;
          p_provider_event_id: string;
          p_actor_id?: string | null;
        };
        Returns: PaymentDbRow;
      };
      review_payment_proof: {
        Args: {p_queue_id: string; p_approve: boolean; p_reason: string};
        Returns: PaymentDbRow;
      };
      reserve_payment_refund: {Args: {p_refund_id: string}; Returns: WalletTransactionRow};
      finalize_payment_refund: {
        Args: {p_refund_id: string; p_provider_refund_id: string};
        Returns: PaymentRefundDbRow;
      };
      transition_order_status: {
        Args: {
          p_order_id: string;
          p_to: OrderStatus;
          p_actor_id?: string | null;
          p_actor_type?: string;
          p_source?: string;
          p_reason?: string | null;
          p_public_message?: Json;
          p_metadata?: Json;
        };
        Returns: OrderDbRow;
      };
      pay_order_with_wallet: {
        Args: {p_order_id: string; p_profile_id: string; p_idempotency_key: string};
        Returns: OrderDbRow;
      };
      settle_order_payment: {
        Args: {p_payment_id: string; p_received_amount: number; p_provider_event_id: string};
        Returns: OrderDbRow;
      };
      claim_order_coupon: {
        Args: {
          p_coupon_id: string;
          p_order_id: string;
          p_profile_id: string | null;
          p_discount_amount: number;
          p_currency_code: string;
        };
        Returns: PricingRuleDbRow;
      };
      enqueue_abandoned_cart_jobs: {Args: Record<never, never>; Returns: number};
      claim_fulfillment_jobs: {
        Args: {p_worker_id: string; p_limit?: number; p_lease_seconds?: number};
        Returns: FulfillmentJobDbRow[];
      };
      finish_fulfillment_job: {
        Args: {
          p_job_id: string;
          p_worker_id: string;
          p_succeeded: boolean;
          p_result?: Json;
          p_error_code?: string | null;
          p_error_safe?: string | null;
        };
        Returns: FulfillmentJobDbRow;
      };
      assign_stock_code: {Args: {p_order_item_id: string}; Returns: StockCodeDbRow};
      create_manual_fulfillment_task: {
        Args: {
          p_order_item_id: string;
          p_failure_context?: Json;
          p_fallback_attempt_id?: string | null;
        };
        Returns: ManualFulfillmentTaskDbRow;
      };
      claim_manual_fulfillment_task: {
        Args: {p_task_id: string; p_staff_id: string};
        Returns: ManualFulfillmentTaskDbRow;
      };
      complete_manual_delivery: {
        Args: {
          p_task_id: string;
          p_staff_id: string;
          p_kind: 'code' | 'text' | 'file' | 'link';
          p_payload_ciphertext?: string | null;
          p_display_hint?: string | null;
          p_storage_path?: string | null;
          p_quantity?: number;
        };
        Returns: OrderDeliveryDbRow;
      };
      refund_unrecoverable_order: {
        Args: {p_order_id: string; p_reason: string};
        Returns: OrderDbRow;
      };
      expire_stock_codes_and_alert: {Args: Record<never, never>; Returns: Json};
      apply_for_affiliate: {Args: {p_message?: string | null}; Returns: Record<string, Json>};
      create_affiliate_link: {
        Args: {p_name: string; p_destination_path: string; p_campaign?: string | null};
        Returns: Record<string, Json>;
      };
      claim_referral_attribution: {
        Args: {p_click_id: string};
        Returns: Record<string, Json>;
      };
      request_affiliate_payout: {
        Args: {
          p_amount: number;
          p_currency_code: string;
          p_destination_kind: string;
          p_destination?: Json;
        };
        Returns: Record<string, Json>;
      };
      redeem_loyalty_points: {
        Args: {p_kind: 'wallet_credit' | 'discount'; p_idempotency_key: string};
        Returns: Record<string, Json>;
      };
      run_data_retention: {Args: Record<never, never>; Returns: Json};
    };
    Enums: {
      user_role: UserRole;
      kyc_status: KycStatus;
      notification_channel: NotificationChannel;
      product_status: ProductStatus;
      fulfillment_mode: FulfillmentMode;
      catalog_media_kind: CatalogMediaKind;
      quote_request_status: QuoteRequestStatus;
      wallet_account_type: WalletAccountType;
      wallet_transaction_type: WalletTransactionType;
      wallet_transaction_status: 'posted' | 'reversed';
      payment_flow: 'automatic' | 'proof';
      payment_status: PaymentDbStatus;
      payment_verification_status:
        'pending' | 'processing' | 'needs_review' | 'approved' | 'rejected';
      payment_webhook_status: 'received' | 'processed' | 'ignored' | 'failed';
      payment_refund_status: 'pending' | 'succeeded' | 'failed' | 'cancelled';
      cart_status: 'active' | 'converted' | 'abandoned' | 'expired';
      coupon_kind: 'percent' | 'fixed' | 'free_item';
      discount_value_kind: 'percent' | 'fixed' | 'unit_price';
      order_status: OrderStatus;
      order_delivery_kind: 'code' | 'text' | 'file' | 'link';
      refund_request_status: 'pending' | 'reviewing' | 'approved' | 'rejected' | 'processed';
      fulfillment_job_status: FulfillmentJobStatus;
      stock_code_status: 'available' | 'assigned' | 'expired' | 'disabled';
      supplier_health_status: SupplierDbRow['health_status'];
      supplier_order_status: SupplierOrderStatus;
      fulfillment_attempt_status: 'queued' | 'running' | 'succeeded' | 'failed' | 'manual_fallback';
      manual_fulfillment_status: ManualFulfillmentStatus;
      manual_fulfillment_priority: ManualFulfillmentTaskDbRow['priority'];
    };
    CompositeTypes: Record<never, never>;
  };
};
