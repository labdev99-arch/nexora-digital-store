import type {Permission} from '@/features/auth/server/permissions';

export type AdminFieldType = 'text' | 'number' | 'boolean' | 'json' | 'datetime' | 'select';

export type AdminField = {
  key: string;
  label: string;
  type: AdminFieldType;
  required?: boolean;
  readOnly?: boolean;
  options?: readonly string[];
};

export type AdminResourceDefinition = {
  key: AdminResourceKey;
  table: string;
  permission: Permission;
  group: 'commerce' | 'customers' | 'marketing' | 'content' | 'operations' | 'settings';
  fields: readonly AdminField[];
  listColumns: readonly string[];
  searchColumns: readonly string[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  softDelete?: boolean;
};

const text = (key: string, required = false): AdminField => ({
  key,
  label: key,
  type: 'text',
  required
});
const number = (key: string, required = false): AdminField => ({
  key,
  label: key,
  type: 'number',
  required
});
const boolean = (key: string): AdminField => ({key, label: key, type: 'boolean'});
const json = (key: string, required = false): AdminField => ({
  key,
  label: key,
  type: 'json',
  required
});
const date = (key: string): AdminField => ({key, label: key, type: 'datetime'});
const select = (key: string, options: readonly string[], required = false): AdminField => ({
  key,
  label: key,
  type: 'select',
  options,
  required
});

export const adminResources = {
  products: {
    table: 'products',
    permission: 'catalog.manage',
    group: 'commerce',
    softDelete: true,
    fields: [
      text('category_id', true),
      text('product_type_code', true),
      text('slug', true),
      json('name', true),
      json('short_description'),
      json('description'),
      select('status', ['draft', 'active', 'out_of_stock', 'coming_soon', 'archived'], true),
      select('fulfillment_mode', ['auto', 'manual', 'auto_then_manual'], true),
      boolean('featured'),
      number('sort_order')
    ],
    listColumns: [
      'slug',
      'product_type_code',
      'status',
      'fulfillment_mode',
      'featured',
      'updated_at'
    ],
    searchColumns: ['slug', 'product_type_code', 'search_text'],
    canCreate: true,
    canUpdate: true,
    canDelete: true
  },
  variants: {
    table: 'product_variants',
    permission: 'catalog.manage',
    group: 'commerce',
    softDelete: true,
    fields: [
      text('product_id', true),
      text('sku', true),
      json('name', true),
      number('price_amount', true),
      text('currency_code', true),
      number('stock_quantity'),
      boolean('unlimited_stock'),
      text('region_code'),
      number('duration_days'),
      number('denomination_amount'),
      text('denomination_currency_code'),
      text('account_type'),
      json('attributes'),
      boolean('active'),
      number('sort_order')
    ],
    listColumns: ['sku', 'price_amount', 'currency_code', 'stock_quantity', 'active', 'updated_at'],
    searchColumns: ['sku', 'region_code', 'account_type'],
    canCreate: true,
    canUpdate: true,
    canDelete: true
  },
  categories: {
    table: 'categories',
    permission: 'catalog.manage',
    group: 'commerce',
    softDelete: true,
    fields: [
      text('parent_id'),
      text('slug', true),
      json('name', true),
      json('description'),
      text('icon_name'),
      text('image_url'),
      number('sort_order'),
      boolean('active'),
      json('seo')
    ],
    listColumns: ['slug', 'icon_name', 'sort_order', 'active', 'updated_at'],
    searchColumns: ['slug', 'icon_name'],
    canCreate: true,
    canUpdate: true,
    canDelete: true
  },
  stockCodes: {
    table: 'stock_codes',
    permission: 'fulfillment.manage',
    group: 'operations',
    fields: [
      text('variant_id'),
      select('status', ['available', 'assigned', 'expired', 'revoked']),
      text('display_hint'),
      date('expires_at'),
      text('assigned_order_item_id')
    ],
    listColumns: ['variant_id', 'status', 'display_hint', 'expires_at', 'assigned_at'],
    searchColumns: ['display_hint'],
    canCreate: false,
    canUpdate: false,
    canDelete: false
  },
  suppliers: {
    table: 'suppliers',
    permission: 'fulfillment.manage',
    group: 'operations',
    softDelete: true,
    fields: [
      text('code', true),
      text('name', true),
      select('driver', ['mock', 'smm_panel', 'reseller_api'], true),
      text('endpoint', true),
      text('currency_code', true),
      number('margin_bps'),
      number('priority'),
      boolean('enabled'),
      boolean('sandbox_mode'),
      json('settings')
    ],
    listColumns: [
      'code',
      'name',
      'driver',
      'currency_code',
      'health_status',
      'priority',
      'enabled'
    ],
    searchColumns: ['code', 'name', 'driver'],
    canCreate: true,
    canUpdate: true,
    canDelete: true
  },
  orders: {
    table: 'orders',
    permission: 'orders.manage',
    group: 'operations',
    fields: [
      text('order_number'),
      text('status'),
      text('currency_code'),
      number('total_amount'),
      number('refunded_amount'),
      text('profile_id'),
      text('guest_email'),
      date('created_at')
    ],
    listColumns: [
      'order_number',
      'status',
      'total_amount',
      'currency_code',
      'profile_id',
      'created_at'
    ],
    searchColumns: ['order_number', 'guest_email'],
    canCreate: false,
    canUpdate: false,
    canDelete: false
  },
  users: {
    table: 'profiles',
    permission: 'identity.manage',
    group: 'customers',
    softDelete: true,
    fields: [
      text('display_name'),
      text('phone'),
      text('locale_code', true),
      text('currency_code', true),
      text('timezone', true),
      text('country_code'),
      select('kyc_status', ['not_required', 'not_started', 'pending', 'approved', 'rejected']),
      boolean('marketing_consent')
    ],
    listColumns: [
      'display_name',
      'phone',
      'country_code',
      'locale_code',
      'currency_code',
      'kyc_status',
      'created_at'
    ],
    searchColumns: ['display_name', 'phone', 'country_code'],
    canCreate: false,
    canUpdate: true,
    canDelete: true
  },
  roles: {
    table: 'profile_roles',
    permission: 'platform.own',
    group: 'customers',
    fields: [
      text('profile_id', true),
      select(
        'role',
        ['customer', 'reseller', 'affiliate', 'support', 'fulfiller', 'finance', 'admin', 'owner'],
        true
      ),
      text('granted_by'),
      date('expires_at')
    ],
    listColumns: ['profile_id', 'role', 'granted_by', 'expires_at', 'created_at'],
    searchColumns: ['role'],
    canCreate: true,
    canUpdate: true,
    canDelete: true
  },
  wallets: {
    table: 'wallets',
    permission: 'wallet.manage',
    group: 'operations',
    fields: [
      text('owner_id'),
      text('account_type'),
      text('currency_code'),
      number('cached_balance'),
      boolean('locked'),
      text('label'),
      text('freeze_reason')
    ],
    listColumns: [
      'owner_id',
      'account_type',
      'currency_code',
      'cached_balance',
      'locked',
      'updated_at'
    ],
    searchColumns: ['label', 'currency_code'],
    canCreate: false,
    canUpdate: false,
    canDelete: false
  },
  payments: {
    table: 'payments',
    permission: 'finance.manage',
    group: 'operations',
    fields: [
      text('payment_reference'),
      text('provider_code'),
      text('status'),
      text('currency_code'),
      number('requested_amount'),
      number('fee_amount'),
      number('credited_amount'),
      text('profile_id'),
      date('created_at')
    ],
    listColumns: [
      'payment_reference',
      'provider_code',
      'status',
      'payable_amount',
      'currency_code',
      'created_at'
    ],
    searchColumns: ['payment_reference', 'provider_code'],
    canCreate: false,
    canUpdate: false,
    canDelete: false
  },
  coupons: {
    table: 'coupons',
    permission: 'marketing.manage',
    group: 'marketing',
    softDelete: true,
    fields: [
      text('code', true),
      select('kind', ['percent', 'fixed', 'free_item'], true),
      number('value_amount', true),
      text('currency_code'),
      number('usage_limit'),
      number('per_user_limit'),
      number('minimum_cart_amount'),
      date('starts_at'),
      date('expires_at'),
      boolean('first_order_only'),
      boolean('auto_apply'),
      boolean('stackable'),
      number('priority'),
      boolean('active')
    ],
    listColumns: [
      'code',
      'kind',
      'value_amount',
      'currency_code',
      'auto_apply',
      'active',
      'expires_at'
    ],
    searchColumns: ['code', 'stack_group'],
    canCreate: true,
    canUpdate: true,
    canDelete: true
  },
  flashSales: {
    table: 'flash_sales',
    permission: 'marketing.manage',
    group: 'marketing',
    softDelete: true,
    fields: [
      json('name', true),
      select('value_kind', ['percent', 'fixed', 'unit_price'], true),
      number('value_amount', true),
      date('starts_at'),
      date('ends_at'),
      boolean('active'),
      number('priority')
    ],
    listColumns: ['value_kind', 'value_amount', 'starts_at', 'ends_at', 'active', 'priority'],
    searchColumns: [],
    canCreate: true,
    canUpdate: true,
    canDelete: true
  },
  tiers: {
    table: 'customer_tiers',
    permission: 'loyalty.manage',
    group: 'customers',
    softDelete: true,
    fields: [
      text('code', true),
      json('name', true),
      json('description'),
      number('minimum_lifetime_spend'),
      number('discount_bps'),
      number('points_multiplier_bps'),
      boolean('priority_queue'),
      json('benefits'),
      number('sort_order'),
      boolean('active')
    ],
    listColumns: ['code', 'minimum_lifetime_spend', 'discount_bps', 'priority_queue', 'active'],
    searchColumns: ['code'],
    canCreate: true,
    canUpdate: true,
    canDelete: true
  },
  loyaltyRules: {
    table: 'loyalty_rules',
    permission: 'loyalty.manage',
    group: 'customers',
    softDelete: true,
    fields: [
      text('code', true),
      json('name', true),
      select('rule_kind', ['earn', 'burn', 'expiry', 'streak', 'seasonal_multiplier'], true),
      number('points_value'),
      number('amount_minor'),
      number('multiplier_bps'),
      date('starts_at'),
      date('ends_at'),
      json('configuration'),
      boolean('active')
    ],
    listColumns: ['code', 'rule_kind', 'points_value', 'multiplier_bps', 'active', 'ends_at'],
    searchColumns: ['code', 'rule_kind'],
    canCreate: true,
    canUpdate: true,
    canDelete: true
  },
  affiliates: {
    table: 'affiliate_accounts',
    permission: 'affiliate.manage',
    group: 'customers',
    softDelete: true,
    fields: [
      text('profile_id', true),
      text('referral_code', true),
      select('status', ['pending', 'active', 'suspended', 'closed']),
      number('commission_bps'),
      number('fixed_commission_amount'),
      text('payout_currency_code', true),
      number('fraud_score'),
      json('settings')
    ],
    listColumns: [
      'referral_code',
      'profile_id',
      'status',
      'commission_bps',
      'fraud_score',
      'created_at'
    ],
    searchColumns: ['referral_code'],
    canCreate: true,
    canUpdate: true,
    canDelete: true
  },
  affiliateRules: {
    table: 'affiliate_commission_rules',
    permission: 'affiliate.manage',
    group: 'marketing',
    softDelete: true,
    fields: [
      json('name', true),
      text('category_id'),
      text('product_id'),
      number('level', true),
      select('commission_kind', ['percent', 'fixed'], true),
      number('value_amount', true),
      text('currency_code'),
      number('holding_days'),
      number('priority'),
      date('starts_at'),
      date('ends_at'),
      boolean('active')
    ],
    listColumns: [
      'level',
      'commission_kind',
      'value_amount',
      'currency_code',
      'holding_days',
      'active'
    ],
    searchColumns: [],
    canCreate: true,
    canUpdate: true,
    canDelete: true
  },
  affiliateLinks: {
    table: 'affiliate_links',
    permission: 'affiliate.manage',
    group: 'marketing',
    softDelete: true,
    fields: [
      text('affiliate_account_id', true),
      text('slug', true),
      text('name', true),
      text('destination_path', true),
      text('campaign'),
      boolean('active')
    ],
    listColumns: ['slug', 'name', 'affiliate_account_id', 'campaign', 'active', 'created_at'],
    searchColumns: ['slug', 'name', 'campaign'],
    canCreate: true,
    canUpdate: true,
    canDelete: true
  },
  affiliatePayouts: {
    table: 'affiliate_payout_requests',
    permission: 'affiliate.manage',
    group: 'operations',
    fields: [
      text('affiliate_account_id'),
      select('destination_kind', ['wallet', 'external']),
      number('amount'),
      text('currency_code'),
      select('status', [
        'requested',
        'reviewing',
        'approved',
        'processing',
        'paid',
        'rejected',
        'cancelled'
      ]),
      json('destination'),
      text('review_reason')
    ],
    listColumns: [
      'affiliate_account_id',
      'amount',
      'currency_code',
      'destination_kind',
      'status',
      'created_at'
    ],
    searchColumns: ['affiliate_account_id', 'currency_code'],
    canCreate: false,
    canUpdate: false,
    canDelete: false
  },
  referralFraud: {
    table: 'referral_fraud_signals',
    permission: 'affiliate.manage',
    group: 'operations',
    fields: [
      text('affiliate_account_id'),
      text('signal_kind'),
      text('severity'),
      number('score'),
      json('evidence'),
      select('status', ['open', 'reviewing', 'cleared', 'confirmed']),
      text('review_reason')
    ],
    listColumns: [
      'signal_kind',
      'severity',
      'score',
      'status',
      'affiliate_account_id',
      'created_at'
    ],
    searchColumns: ['signal_kind', 'severity', 'status'],
    canCreate: false,
    canUpdate: true,
    canDelete: false
  },
  affiliateAssets: {
    table: 'affiliate_marketing_assets',
    permission: 'affiliate.manage',
    group: 'marketing',
    softDelete: true,
    fields: [
      json('name', true),
      json('description'),
      select('asset_kind', ['banner', 'image', 'copy', 'video', 'document'], true),
      text('locale_code'),
      text('storage_path'),
      text('external_url'),
      json('copy_text'),
      boolean('active'),
      number('sort_order')
    ],
    listColumns: ['asset_kind', 'locale_code', 'active', 'sort_order', 'updated_at'],
    searchColumns: ['asset_kind', 'locale_code'],
    canCreate: true,
    canUpdate: true,
    canDelete: true
  },
  loyaltyBadges: {
    table: 'loyalty_badges',
    permission: 'loyalty.manage',
    group: 'customers',
    softDelete: true,
    fields: [
      text('code', true),
      json('name', true),
      json('description'),
      text('icon_name', true),
      json('criteria'),
      number('reward_points'),
      boolean('active'),
      number('sort_order')
    ],
    listColumns: ['code', 'icon_name', 'reward_points', 'active', 'sort_order'],
    searchColumns: ['code', 'icon_name'],
    canCreate: true,
    canUpdate: true,
    canDelete: true
  },
  growthSettings: {
    table: 'growth_settings',
    permission: 'loyalty.manage',
    group: 'settings',
    fields: [text('key', true), json('value', true), json('description')],
    listColumns: ['key', 'value', 'updated_at'],
    searchColumns: ['key'],
    canCreate: true,
    canUpdate: true,
    canDelete: true
  },
  tickets: {
    table: 'support_tickets',
    permission: 'support.manage',
    group: 'operations',
    softDelete: true,
    fields: [
      text('ticket_number', true),
      text('profile_id'),
      text('order_id'),
      text('category', true),
      text('subject', true),
      text('description', true),
      select('status', ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed']),
      select('priority', ['low', 'normal', 'high', 'urgent']),
      text('assigned_to'),
      date('sla_due_at')
    ],
    listColumns: ['ticket_number', 'subject', 'status', 'priority', 'assigned_to', 'sla_due_at'],
    searchColumns: ['ticket_number', 'subject', 'category'],
    canCreate: true,
    canUpdate: true,
    canDelete: true
  },
  reviews: {
    table: 'reviews',
    permission: 'reviews.manage',
    group: 'content',
    softDelete: true,
    fields: [
      text('product_id'),
      text('profile_id'),
      number('rating'),
      text('title'),
      text('body'),
      select('status', ['pending', 'approved', 'rejected']),
      text('seller_reply'),
      text('moderation_reason')
    ],
    listColumns: ['product_id', 'rating', 'status', 'title', 'profile_id', 'created_at'],
    searchColumns: ['title', 'body'],
    canCreate: false,
    canUpdate: true,
    canDelete: true
  },
  blogPosts: {
    table: 'blog_posts',
    permission: 'content.manage',
    group: 'content',
    softDelete: true,
    fields: [
      text('slug', true),
      json('title', true),
      json('excerpt'),
      json('body_mdx'),
      json('seo'),
      text('cover_image_path'),
      select('status', ['draft', 'scheduled', 'published', 'archived']),
      date('publish_at')
    ],
    listColumns: ['slug', 'status', 'publish_at', 'published_at', 'updated_at'],
    searchColumns: ['slug'],
    canCreate: true,
    canUpdate: true,
    canDelete: true
  },
  pages: {
    table: 'content_pages',
    permission: 'content.manage',
    group: 'content',
    softDelete: true,
    fields: [
      text('slug', true),
      select('page_kind', ['standard', 'legal', 'landing']),
      json('title', true),
      json('body_mdx'),
      json('seo'),
      select('status', ['draft', 'scheduled', 'published', 'archived']),
      date('publish_at')
    ],
    listColumns: ['slug', 'page_kind', 'status', 'publish_at', 'updated_at'],
    searchColumns: ['slug', 'page_kind'],
    canCreate: true,
    canUpdate: true,
    canDelete: true
  },
  banners: {
    table: 'homepage_banners',
    permission: 'marketing.manage',
    group: 'marketing',
    softDelete: true,
    fields: [
      text('name', true),
      json('content', true),
      text('image_path'),
      text('mobile_image_path'),
      text('link_url'),
      date('starts_at'),
      date('ends_at'),
      boolean('active'),
      number('sort_order')
    ],
    listColumns: ['name', 'active', 'starts_at', 'ends_at', 'sort_order'],
    searchColumns: ['name', 'link_url'],
    canCreate: true,
    canUpdate: true,
    canDelete: true
  },
  homepageSections: {
    table: 'homepage_sections',
    permission: 'marketing.manage',
    group: 'marketing',
    softDelete: true,
    fields: [
      select(
        'section_type',
        ['hero', 'banner', 'product_carousel', 'categories_grid', 'testimonials', 'faq'],
        true
      ),
      text('internal_name', true),
      json('content', true),
      json('configuration'),
      number('sort_order'),
      boolean('active'),
      date('starts_at'),
      date('ends_at')
    ],
    listColumns: ['internal_name', 'section_type', 'sort_order', 'active', 'starts_at', 'ends_at'],
    searchColumns: ['internal_name'],
    canCreate: true,
    canUpdate: true,
    canDelete: true
  },
  notificationTemplates: {
    table: 'notification_templates',
    permission: 'settings.manage',
    group: 'settings',
    softDelete: true,
    fields: [
      text('template_key', true),
      select('channel', ['email', 'whatsapp', 'telegram', 'push', 'in_app', 'sms'], true),
      text('locale_code', true),
      text('subject'),
      text('body', true),
      text('provider_template_name'),
      json('variables'),
      boolean('active'),
      number('version')
    ],
    listColumns: ['template_key', 'channel', 'locale_code', 'active', 'version', 'updated_at'],
    searchColumns: ['template_key', 'channel', 'locale_code'],
    canCreate: true,
    canUpdate: true,
    canDelete: true
  },
  notificationDeliveries: {
    table: 'notification_deliveries',
    permission: 'notifications.manage',
    group: 'operations',
    fields: [
      text('event_id'),
      text('profile_id'),
      select('channel', ['email', 'whatsapp', 'telegram', 'push', 'in_app', 'sms']),
      select('status', [
        'queued',
        'processing',
        'sent',
        'delivered',
        'failed',
        'suppressed',
        'dead_letter'
      ]),
      text('last_error')
    ],
    listColumns: ['profile_id', 'channel', 'status', 'attempts', 'last_error', 'created_at'],
    searchColumns: ['profile_id', 'provider_message_id', 'last_error'],
    canCreate: false,
    canUpdate: false,
    canDelete: false
  },
  supportCategories: {
    table: 'support_ticket_categories',
    permission: 'support.manage',
    group: 'operations',
    softDelete: true,
    fields: [
      text('code', true),
      json('name', true),
      json('description'),
      select('default_priority', ['low', 'normal', 'high', 'urgent']),
      number('first_response_minutes'),
      number('resolution_minutes'),
      boolean('active'),
      number('sort_order')
    ],
    listColumns: [
      'code',
      'name',
      'default_priority',
      'first_response_minutes',
      'resolution_minutes',
      'active'
    ],
    searchColumns: ['code'],
    canCreate: true,
    canUpdate: true,
    canDelete: true
  },
  cannedReplies: {
    table: 'support_canned_replies',
    permission: 'support.manage',
    group: 'operations',
    softDelete: true,
    fields: [
      text('shortcut', true),
      json('title', true),
      json('body', true),
      text('category_id'),
      boolean('active')
    ],
    listColumns: ['shortcut', 'title', 'category_id', 'active', 'usage_count'],
    searchColumns: ['shortcut'],
    canCreate: true,
    canUpdate: true,
    canDelete: true
  },
  knowledgeCategories: {
    table: 'knowledge_categories',
    permission: 'knowledge.manage',
    group: 'content',
    softDelete: true,
    fields: [
      text('parent_id'),
      text('slug', true),
      json('name', true),
      json('description'),
      number('sort_order'),
      boolean('active')
    ],
    listColumns: ['slug', 'name', 'active', 'sort_order'],
    searchColumns: ['slug'],
    canCreate: true,
    canUpdate: true,
    canDelete: true
  },
  knowledgeArticles: {
    table: 'knowledge_articles',
    permission: 'knowledge.manage',
    group: 'content',
    softDelete: true,
    fields: [
      text('category_id'),
      text('slug', true),
      json('title', true),
      json('excerpt'),
      json('body', true),
      json('seo'),
      select('status', ['draft', 'published', 'archived']),
      date('published_at')
    ],
    listColumns: ['slug', 'title', 'status', 'published_at', 'updated_at'],
    searchColumns: ['slug'],
    canCreate: true,
    canUpdate: true,
    canDelete: true
  },
  knowledgeFaqs: {
    table: 'knowledge_faqs',
    permission: 'knowledge.manage',
    group: 'content',
    softDelete: true,
    fields: [
      text('category_id'),
      json('question', true),
      json('answer', true),
      number('sort_order'),
      boolean('active')
    ],
    listColumns: ['question', 'category_id', 'active', 'sort_order'],
    searchColumns: [],
    canCreate: true,
    canUpdate: true,
    canDelete: true
  },
  reviewReplies: {
    table: 'review_replies',
    permission: 'reviews.manage',
    group: 'content',
    softDelete: true,
    fields: [text('review_id', true), text('body', true)],
    listColumns: ['review_id', 'body', 'author_id', 'created_at'],
    searchColumns: ['body'],
    canCreate: true,
    canUpdate: true,
    canDelete: true
  },
  platformSettings: {
    table: 'platform_settings',
    permission: 'settings.manage',
    group: 'settings',
    softDelete: true,
    fields: [
      text('key', true),
      json('value', true),
      select('category', ['general', 'seo', 'maintenance', 'legal', 'fees', 'security'], true),
      boolean('is_secret'),
      json('description')
    ],
    listColumns: ['key', 'category', 'is_secret', 'updated_at'],
    searchColumns: ['key', 'category'],
    canCreate: true,
    canUpdate: true,
    canDelete: true
  },
  exchangeRates: {
    table: 'exchange_rate_history',
    permission: 'settings.manage',
    group: 'settings',
    fields: [
      text('currency_code', true),
      number('rate_minor', true),
      number('rate_scale', true),
      text('source', true),
      boolean('manual_override'),
      date('effective_at'),
      text('created_by')
    ],
    listColumns: [
      'currency_code',
      'rate_minor',
      'rate_scale',
      'source',
      'manual_override',
      'effective_at'
    ],
    searchColumns: ['currency_code', 'source'],
    canCreate: true,
    canUpdate: false,
    canDelete: false
  },
  auditLogs: {
    table: 'audit_logs',
    permission: 'audit.read',
    group: 'operations',
    fields: [
      text('actor_id'),
      text('actor_type'),
      text('action'),
      text('resource_type'),
      text('resource_id'),
      json('before'),
      json('after'),
      text('reason'),
      text('request_id'),
      text('ip_address'),
      text('user_agent'),
      date('created_at')
    ],
    listColumns: ['created_at', 'actor_id', 'action', 'resource_type', 'resource_id', 'ip_address'],
    searchColumns: ['action', 'resource_type', 'request_id'],
    canCreate: false,
    canUpdate: false,
    canDelete: false
  },
  paymentMethods: {
    table: 'payment_methods',
    permission: 'settings.manage',
    group: 'settings',
    softDelete: true,
    fields: [
      text('code', true),
      text('driver', true),
      select('flow', ['automatic', 'proof'], true),
      json('name', true),
      json('description'),
      json('instructions'),
      boolean('enabled'),
      boolean('sandbox_mode'),
      number('min_amount'),
      number('max_amount'),
      number('fee_fixed'),
      number('fee_bps'),
      json('allowed_currencies'),
      json('allowed_countries'),
      json('allowed_tiers'),
      json('config'),
      number('sort_order')
    ],
    listColumns: ['code', 'driver', 'flow', 'enabled', 'sandbox_mode', 'fee_fixed', 'fee_bps'],
    searchColumns: ['code', 'driver'],
    canCreate: true,
    canUpdate: true,
    canDelete: true
  },
  currencies: {
    table: 'currencies',
    permission: 'settings.manage',
    group: 'settings',
    fields: [
      text('code', true),
      text('name', true),
      text('symbol', true),
      number('minor_unit'),
      number('rounding_increment'),
      boolean('enabled'),
      boolean('is_base'),
      number('exchange_rate_minor'),
      number('rate_scale'),
      boolean('manual_rate_override')
    ],
    listColumns: ['code', 'name', 'symbol', 'exchange_rate_minor', 'enabled', 'is_base'],
    searchColumns: ['code', 'name'],
    canCreate: true,
    canUpdate: true,
    canDelete: false
  },
  locales: {
    table: 'locales',
    permission: 'settings.manage',
    group: 'settings',
    fields: [
      text('code', true),
      text('name', true),
      text('native_name', true),
      select('direction', ['ltr', 'rtl'], true),
      boolean('enabled'),
      boolean('is_default'),
      text('fallback_code'),
      text('intl_locale', true),
      number('sort_order')
    ],
    listColumns: ['code', 'name', 'native_name', 'direction', 'enabled', 'is_default'],
    searchColumns: ['code', 'name', 'native_name'],
    canCreate: true,
    canUpdate: true,
    canDelete: false
  },
  taxRules: {
    table: 'tax_rules',
    permission: 'settings.manage',
    group: 'settings',
    softDelete: true,
    fields: [
      text('country_code', true),
      json('name', true),
      number('rate_bps', true),
      boolean('inclusive'),
      boolean('digital_products'),
      boolean('active'),
      date('starts_at'),
      date('ends_at')
    ],
    listColumns: ['country_code', 'rate_bps', 'inclusive', 'active', 'starts_at', 'ends_at'],
    searchColumns: ['country_code'],
    canCreate: true,
    canUpdate: true,
    canDelete: true
  },
  resellerTiers: {
    table: 'reseller_tiers',
    permission: 'reseller.manage',
    group: 'customers',
    softDelete: true,
    fields: [
      text('code', true),
      json('name', true),
      json('description'),
      number('minimum_30d_volume', true),
      text('threshold_currency_code', true),
      number('default_credit_limit', true),
      text('credit_currency_code', true),
      number('api_rate_limit_per_minute', true),
      number('sort_order'),
      boolean('active')
    ],
    listColumns: [
      'code',
      'minimum_30d_volume',
      'default_credit_limit',
      'api_rate_limit_per_minute',
      'active'
    ],
    searchColumns: ['code'],
    canCreate: true,
    canUpdate: true,
    canDelete: true
  },
  resellerAccounts: {
    table: 'reseller_accounts',
    permission: 'reseller.manage',
    group: 'customers',
    softDelete: true,
    fields: [
      text('profile_id', true),
      select('status', ['pending', 'active', 'suspended', 'closed'], true),
      text('current_tier_id', true),
      text('manual_tier_id'),
      text('manual_override_reason'),
      number('credit_limit_override'),
      text('credit_currency_code', true),
      number('low_balance_threshold'),
      boolean('auto_upgrade_enabled')
    ],
    listColumns: [
      'profile_id',
      'status',
      'current_tier_id',
      'manual_tier_id',
      'volume_30d_amount',
      'credit_limit_override'
    ],
    searchColumns: ['profile_id'],
    canCreate: false,
    canUpdate: true,
    canDelete: false
  },
  resellerPrices: {
    table: 'tier_prices',
    permission: 'reseller.manage',
    group: 'commerce',
    softDelete: true,
    fields: [
      text('variant_id', true),
      select('tier_code', ['bronze', 'silver', 'gold', 'platinum'], true),
      text('currency_code', true),
      number('price_amount', true),
      date('starts_at'),
      date('ends_at')
    ],
    listColumns: [
      'variant_id',
      'tier_code',
      'currency_code',
      'price_amount',
      'starts_at',
      'ends_at'
    ],
    searchColumns: ['variant_id', 'tier_code', 'currency_code'],
    canCreate: true,
    canUpdate: true,
    canDelete: true
  },
  featureFlags: {
    table: 'feature_flags',
    permission: 'settings.manage',
    group: 'settings',
    softDelete: true,
    fields: [
      text('key', true),
      json('name', true),
      json('description'),
      boolean('enabled'),
      number('rollout_percentage'),
      json('rules')
    ],
    listColumns: ['key', 'enabled', 'rollout_percentage', 'updated_at'],
    searchColumns: ['key'],
    canCreate: true,
    canUpdate: true,
    canDelete: true
  }
} as const satisfies Record<string, Omit<AdminResourceDefinition, 'key'>>;

export type AdminResourceKey = keyof typeof adminResources;

export function getAdminResource(key: string): AdminResourceDefinition | null {
  if (!(key in adminResources)) return null;
  return {key: key as AdminResourceKey, ...adminResources[key as AdminResourceKey]};
}

export const adminResourceKeys = Object.keys(adminResources) as AdminResourceKey[];
