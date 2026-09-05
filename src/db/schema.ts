import {sql} from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  customType,
  date,
  foreignKey,
  inet,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', {withTimezone: true, mode: 'date'}).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', {withTimezone: true, mode: 'date'}).notNull().defaultNow()
};

export const accountType = pgEnum('wallet_account_type', [
  'customer',
  'platform_cash',
  'platform_revenue',
  'platform_liability',
  'supplier',
  'affiliate',
  'customer_hold'
]);
export const walletTransactionType = pgEnum('wallet_transaction_type', [
  'top_up',
  'purchase',
  'refund',
  'admin_adjustment',
  'affiliate_commission',
  'cashback',
  'hold',
  'release',
  'topup',
  'commission',
  'bonus',
  'payout',
  'fee',
  'chargeback'
]);
export const transactionStatus = pgEnum('wallet_transaction_status', ['posted', 'reversed']);
export const userRole = pgEnum('user_role', [
  'customer',
  'reseller',
  'affiliate',
  'support',
  'fulfiller',
  'finance',
  'admin',
  'owner'
]);
export const kycStatus = pgEnum('kyc_status', [
  'not_required',
  'not_started',
  'pending',
  'approved',
  'rejected'
]);
export const notificationChannel = pgEnum('notification_channel', [
  'email',
  'whatsapp',
  'telegram',
  'push',
  'in_app'
]);
export const notificationDeliveryStatus = pgEnum('notification_delivery_status', [
  'queued',
  'processing',
  'sent',
  'delivered',
  'failed',
  'suppressed',
  'dead_letter'
]);
export const notificationConnectionStatus = pgEnum('notification_connection_status', [
  'pending',
  'verified',
  'revoked'
]);
export const supportMessageKind = pgEnum('support_message_kind', [
  'message',
  'internal_note',
  'status_change',
  'system'
]);
export const knowledgeStatus = pgEnum('knowledge_status', ['draft', 'published', 'archived']);
export const productStatus = pgEnum('product_status', [
  'draft',
  'active',
  'out_of_stock',
  'coming_soon',
  'archived'
]);
export const fulfillmentMode = pgEnum('fulfillment_mode', ['auto', 'manual', 'auto_then_manual']);
export const catalogMediaKind = pgEnum('catalog_media_kind', ['image', 'video', 'logo']);
export const resellerAccountStatus = pgEnum('reseller_account_status', [
  'pending',
  'active',
  'suspended',
  'closed'
]);
export const resellerApiEnvironment = pgEnum('reseller_api_environment', ['sandbox', 'live']);
export const resellerWebhookDeliveryStatus = pgEnum('reseller_webhook_delivery_status', [
  'pending',
  'processing',
  'delivered',
  'retrying',
  'dead_letter'
]);
export const quoteRequestStatus = pgEnum('quote_request_status', [
  'submitted',
  'reviewing',
  'quoted',
  'accepted',
  'declined',
  'cancelled'
]);
export const adminContentStatus = pgEnum('admin_content_status', [
  'draft',
  'scheduled',
  'published',
  'archived'
]);
export const homepageSectionType = pgEnum('homepage_section_type', [
  'hero',
  'banner',
  'product_carousel',
  'categories_grid',
  'testimonials',
  'faq'
]);
export const supportTicketStatus = pgEnum('support_ticket_status', [
  'open',
  'in_progress',
  'waiting_customer',
  'resolved',
  'closed'
]);
export const supportTicketPriority = pgEnum('support_ticket_priority', [
  'low',
  'normal',
  'high',
  'urgent'
]);
export const reviewStatus = pgEnum('review_status', ['pending', 'approved', 'rejected']);
export const affiliateAccountStatus = pgEnum('affiliate_account_status', [
  'pending',
  'active',
  'suspended',
  'closed'
]);

const tsvector = customType<{data: string}>({dataType: () => 'tsvector'});
const vector1536 = customType<{data: number[]}>({dataType: () => 'extensions.vector(1536)'});

export const locales = pgTable(
  'locales',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    nativeName: text('native_name').notNull(),
    direction: text('direction').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    isDefault: boolean('is_default').notNull().default(false),
    fallbackCode: text('fallback_code'),
    intlLocale: text('intl_locale').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps
  },
  (table) => [
    uniqueIndex('locales_code_uidx').on(table.code),
    check('locales_code_ck', sql`${table.code} ~ '^[a-z]{2}(-[A-Z]{2})?$'`),
    check('locales_direction_ck', sql`${table.direction} in ('ltr', 'rtl')`)
  ]
);

export const currencies = pgTable(
  'currencies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    symbol: text('symbol').notNull(),
    minorUnit: integer('minor_unit').notNull().default(2),
    roundingIncrement: bigint('rounding_increment', {mode: 'number'}).notNull().default(1),
    enabled: boolean('enabled').notNull().default(true),
    isBase: boolean('is_base').notNull().default(false),
    exchangeRateMinor: bigint('exchange_rate_minor', {mode: 'number'}).notNull().default(1000000),
    rateScale: integer('rate_scale').notNull().default(6),
    rateUpdatedAt: timestamp('rate_updated_at', {withTimezone: true, mode: 'date'}),
    manualRateOverride: boolean('manual_rate_override').notNull().default(false),
    ...timestamps
  },
  (table) => [
    uniqueIndex('currencies_code_uidx').on(table.code),
    check('currencies_code_ck', sql`${table.code} ~ '^[A-Z]{3}$'`),
    check('currencies_minor_unit_ck', sql`${table.minorUnit} between 0 and 3`),
    check('currencies_rounding_ck', sql`${table.roundingIncrement} > 0`)
  ]
);

export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').primaryKey(),
    displayName: text('display_name'),
    phone: text('phone'),
    phoneVerified: boolean('phone_verified').notNull().default(false),
    localeCode: text('locale_code').notNull().default('en'),
    currencyCode: text('currency_code').notNull().default('USD'),
    timezone: text('timezone').notNull().default('UTC'),
    countryCode: text('country_code'),
    avatarPath: text('avatar_path'),
    marketingConsent: boolean('marketing_consent').notNull().default(false),
    marketingConsentAt: timestamp('marketing_consent_at', {withTimezone: true, mode: 'date'}),
    referredBy: uuid('referred_by'),
    kycStatus: kycStatus('kyc_status').notNull().default('not_required'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    index('profiles_phone_idx').on(table.phone),
    index('profiles_deleted_at_idx').on(table.deletedAt),
    index('profiles_referred_by_idx').on(table.referredBy),
    foreignKey({
      name: 'profiles_referred_by_fk',
      columns: [table.referredBy],
      foreignColumns: [table.id]
    }).onDelete('set null')
  ]
);

export const profileRoles = pgTable(
  'profile_roles',
  {
    id: uuid('id').notNull().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, {onDelete: 'cascade'}),
    role: userRole('role').notNull(),
    grantedBy: uuid('granted_by').references(() => profiles.id, {onDelete: 'set null'}),
    expiresAt: timestamp('expires_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    primaryKey({name: 'profile_roles_pk', columns: [table.profileId, table.role]}),
    uniqueIndex('profile_roles_id_uidx').on(table.id),
    index('profile_roles_role_idx').on(table.role, table.profileId)
  ]
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    id: uuid('id').notNull().defaultRandom(),
    role: userRole('role').notNull(),
    permission: text('permission').notNull(),
    description: text('description'),
    ...timestamps
  },
  (table) => [
    primaryKey({name: 'role_permissions_pk', columns: [table.role, table.permission]}),
    uniqueIndex('role_permissions_id_uidx').on(table.id),
    index('role_permissions_permission_idx').on(table.permission, table.role)
  ]
);

export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, {onDelete: 'cascade'}),
    channel: notificationChannel('channel').notNull(),
    transactional: boolean('transactional').notNull().default(true),
    orderUpdates: boolean('order_updates').notNull().default(true),
    securityAlerts: boolean('security_alerts').notNull().default(true),
    promotions: boolean('promotions').notNull().default(false),
    ...timestamps
  },
  (table) => [
    uniqueIndex('notification_preferences_profile_channel_uidx').on(table.profileId, table.channel),
    index('notification_preferences_profile_idx').on(table.profileId)
  ]
);

export const userSessions = pgTable(
  'user_sessions',
  {
    id: uuid('id').primaryKey(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, {onDelete: 'cascade'}),
    userAgent: text('user_agent'),
    deviceName: text('device_name').notNull().default('unknown'),
    ipHash: text('ip_hash'),
    countryCode: text('country_code'),
    lastSeenAt: timestamp('last_seen_at', {withTimezone: true, mode: 'date'})
      .notNull()
      .defaultNow(),
    revokedAt: timestamp('revoked_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    index('user_sessions_profile_active_idx').on(table.profileId, table.revokedAt),
    index('user_sessions_last_seen_idx').on(table.lastSeenAt)
  ]
);

export const wallets = pgTable(
  'wallets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id'),
    accountType: accountType('account_type').notNull(),
    currencyCode: text('currency_code').notNull(),
    cachedBalance: bigint('cached_balance', {mode: 'number'}).notNull().default(0),
    locked: boolean('locked').notNull().default(false),
    label: text('label'),
    frozenAt: timestamp('frozen_at', {withTimezone: true, mode: 'date'}),
    frozenBy: uuid('frozen_by').references(() => profiles.id, {onDelete: 'set null'}),
    freezeReason: text('freeze_reason'),
    ...timestamps
  },
  (table) => [
    uniqueIndex('wallets_owner_currency_type_uidx')
      .on(table.ownerId, table.currencyCode, table.accountType)
      .where(sql`${table.ownerId} is not null`),
    uniqueIndex('wallets_system_currency_label_uidx')
      .on(table.accountType, table.currencyCode, table.label)
      .where(sql`${table.ownerId} is null`),
    index('wallets_owner_currency_idx').on(table.ownerId, table.currencyCode, table.accountType),
    index('wallets_account_type_idx').on(table.accountType),
    index('wallets_frozen_idx').on(table.locked, table.updatedAt),
    index('wallets_frozen_by_idx').on(table.frozenBy),
    check(
      'wallets_owner_ck',
      sql`(${table.accountType} in ('customer', 'customer_hold') and ${table.ownerId} is not null)
        or ${table.accountType} not in ('customer', 'customer_hold')`
    ),
    check(
      'wallets_customer_nonnegative_ck',
      sql`${table.accountType} not in ('customer', 'customer_hold', 'supplier', 'affiliate')
        or ${table.cachedBalance} >= 0`
    ),
    check(
      'wallets_cached_balance_safe_integer_ck',
      sql`${table.cachedBalance} between -9007199254740991 and 9007199254740991`
    )
  ]
);

export const walletTransactions = pgTable(
  'wallet_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    debitWalletId: uuid('debit_wallet_id')
      .notNull()
      .references(() => wallets.id),
    creditWalletId: uuid('credit_wallet_id')
      .notNull()
      .references(() => wallets.id),
    type: walletTransactionType('type').notNull(),
    status: transactionStatus('status').notNull().default('posted'),
    amount: bigint('amount', {mode: 'number'}).notNull(),
    currencyCode: text('currency_code').notNull(),
    idempotencyScope: text('idempotency_scope').notNull().default('wallet.legacy'),
    idempotencyKey: text('idempotency_key').notNull(),
    referenceType: text('reference_type').notNull(),
    referenceId: uuid('reference_id'),
    reason: text('reason'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    reversalOfId: uuid('reversal_of_id'),
    createdBy: uuid('created_by'),
    ...timestamps
  },
  (table) => [
    uniqueIndex('wallet_transactions_idempotency_scope_key_uidx').on(
      table.idempotencyScope,
      table.idempotencyKey
    ),
    uniqueIndex('wallet_transactions_reversal_uidx').on(table.reversalOfId),
    index('wallet_transactions_debit_created_idx').on(table.debitWalletId, table.createdAt),
    index('wallet_transactions_credit_created_idx').on(table.creditWalletId, table.createdAt),
    index('wallet_transactions_reference_idx').on(table.referenceType, table.referenceId),
    check('wallet_transactions_amount_ck', sql`${table.amount} > 0`),
    check('wallet_transactions_safe_integer_ck', sql`${table.amount} <= 9007199254740991`),
    check(
      'wallet_transactions_distinct_accounts_ck',
      sql`${table.debitWalletId} <> ${table.creditWalletId}`
    ),
    check(
      'wallet_transactions_adjustment_reason_ck',
      sql`${table.type} <> 'admin_adjustment' or ${table.reason} is not null`
    )
  ]
);

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scope: text('scope').notNull(),
    key: text('key').notNull(),
    actorId: uuid('actor_id'),
    requestHash: text('request_hash').notNull(),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body').$type<Record<string, unknown>>(),
    lockedUntil: timestamp('locked_until', {withTimezone: true, mode: 'date'}),
    expiresAt: timestamp('expires_at', {withTimezone: true, mode: 'date'}).notNull(),
    ...timestamps
  },
  (table) => [
    uniqueIndex('idempotency_keys_scope_key_uidx').on(table.scope, table.key),
    index('idempotency_keys_expires_at_idx').on(table.expiresAt)
  ]
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id'),
    actorType: text('actor_type').notNull(),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: uuid('resource_id'),
    before: jsonb('before').$type<Record<string, unknown>>(),
    after: jsonb('after').$type<Record<string, unknown>>(),
    reason: text('reason'),
    requestId: text('request_id'),
    ipHash: text('ip_hash'),
    userAgentHash: text('user_agent_hash'),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', {withTimezone: true, mode: 'date'}).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', {withTimezone: true, mode: 'date'}).notNull().defaultNow()
  },
  (table) => [
    index('audit_logs_resource_idx').on(table.resourceType, table.resourceId, table.createdAt),
    index('audit_logs_actor_idx').on(table.actorId, table.createdAt)
  ]
);

export const walletReconciliations = pgTable(
  'wallet_reconciliations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    walletId: uuid('wallet_id')
      .notNull()
      .references(() => wallets.id, {onDelete: 'restrict'}),
    derivedBalance: bigint('derived_balance', {mode: 'number'}).notNull(),
    cachedBalance: bigint('cached_balance', {mode: 'number'}).notNull(),
    difference: bigint('difference', {mode: 'number'}).notNull(),
    status: text('status').notNull(),
    checkedAt: timestamp('checked_at', {withTimezone: true, mode: 'date'}).notNull().defaultNow(),
    ...timestamps
  },
  (table) => [
    index('wallet_reconciliations_wallet_checked_idx').on(table.walletId, table.checkedAt),
    index('wallet_reconciliations_mismatch_idx').on(table.checkedAt),
    check(
      'wallet_reconciliations_difference_ck',
      sql`${table.difference} = ${table.cachedBalance} - ${table.derivedBalance}`
    ),
    check('wallet_reconciliations_status_ck', sql`${table.status} in ('matched', 'mismatch')`)
  ]
);

export const adminAlerts = pgTable(
  'admin_alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    severity: text('severity').notNull(),
    alertType: text('alert_type').notNull(),
    title: jsonb('title').$type<Record<string, string>>().notNull(),
    message: jsonb('message').$type<Record<string, string>>().notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: uuid('resource_id'),
    fingerprint: text('fingerprint').notNull(),
    status: text('status').notNull().default('open'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    acknowledgedAt: timestamp('acknowledged_at', {withTimezone: true, mode: 'date'}),
    acknowledgedBy: uuid('acknowledged_by').references(() => profiles.id, {
      onDelete: 'set null'
    }),
    resolvedAt: timestamp('resolved_at', {withTimezone: true, mode: 'date'}),
    resolvedBy: uuid('resolved_by').references(() => profiles.id, {onDelete: 'set null'}),
    resolutionNote: text('resolution_note'),
    ...timestamps
  },
  (table) => [
    uniqueIndex('admin_alerts_open_fingerprint_uidx')
      .on(table.fingerprint)
      .where(sql`${table.status} <> 'resolved'`),
    index('admin_alerts_status_created_idx').on(table.status, table.createdAt),
    index('admin_alerts_resource_idx').on(table.resourceType, table.resourceId, table.createdAt),
    index('admin_alerts_acknowledged_by_idx').on(table.acknowledgedBy),
    index('admin_alerts_resolved_by_idx').on(table.resolvedBy)
  ]
);

export const productTypes = pgTable(
  'product_types',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: jsonb('name').$type<Record<string, string>>().notNull(),
    description: jsonb('description').$type<Record<string, string>>().notNull().default({}),
    iconName: text('icon_name'),
    enabled: boolean('enabled').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    capabilities: jsonb('capabilities').$type<Record<string, boolean>>().notNull().default({}),
    ...timestamps
  },
  (table) => [
    uniqueIndex('product_types_code_uidx').on(table.code),
    index('product_types_enabled_sort_idx').on(table.enabled, table.sortOrder),
    check('product_types_code_ck', sql`${table.code} ~ '^[a-z][a-z0-9_]{1,47}$'`)
  ]
);

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parentId: uuid('parent_id'),
    slug: text('slug').notNull(),
    name: jsonb('name').$type<Record<string, string>>().notNull(),
    description: jsonb('description').$type<Record<string, string>>().notNull().default({}),
    iconName: text('icon_name'),
    imageUrl: text('image_url'),
    sortOrder: integer('sort_order').notNull().default(0),
    active: boolean('active').notNull().default(true),
    seo: jsonb('seo').$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid('created_by').references(() => profiles.id, {onDelete: 'set null'}),
    updatedBy: uuid('updated_by').references(() => profiles.id, {onDelete: 'set null'}),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    foreignKey({
      name: 'categories_parent_id_fkey',
      columns: [table.parentId],
      foreignColumns: [table.id]
    }).onDelete('restrict'),
    uniqueIndex('categories_slug_active_uidx')
      .on(table.slug)
      .where(sql`${table.deletedAt} is null`),
    index('categories_parent_sort_idx').on(table.parentId, table.sortOrder),
    index('categories_active_sort_idx').on(table.active, table.sortOrder),
    check(
      'categories_not_self_parent_ck',
      sql`${table.parentId} is null or ${table.parentId} <> ${table.id}`
    )
  ]
);

export const categoryClosure = pgTable(
  'category_closure',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ancestorId: uuid('ancestor_id')
      .notNull()
      .references(() => categories.id, {onDelete: 'cascade'}),
    descendantId: uuid('descendant_id')
      .notNull()
      .references(() => categories.id, {onDelete: 'cascade'}),
    depth: integer('depth').notNull(),
    ...timestamps
  },
  (table) => [
    uniqueIndex('category_closure_pair_uidx').on(table.ancestorId, table.descendantId),
    index('category_closure_descendant_depth_idx').on(table.descendantId, table.depth),
    index('category_closure_ancestor_depth_idx').on(table.ancestorId, table.depth),
    check('category_closure_depth_ck', sql`${table.depth} >= 0`)
  ]
);

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, {onDelete: 'restrict'}),
    productTypeCode: text('product_type_code')
      .notNull()
      .references(() => productTypes.code, {onUpdate: 'cascade'}),
    slug: text('slug').notNull(),
    name: jsonb('name').$type<Record<string, string>>().notNull(),
    shortDescription: jsonb('short_description')
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    description: jsonb('description').$type<Record<string, string>>().notNull().default({}),
    badges: jsonb('badges').$type<Array<Record<string, string>>>().notNull().default([]),
    status: productStatus('status').notNull().default('draft'),
    fulfillmentMode: fulfillmentMode('fulfillment_mode').notNull().default('manual'),
    warrantyText: jsonb('warranty_text').$type<Record<string, string>>().notNull().default({}),
    deliveryEstimate: jsonb('delivery_estimate')
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    inputSchema: jsonb('input_schema')
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    seo: jsonb('seo').$type<Record<string, unknown>>().notNull().default({}),
    featured: boolean('featured').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    publishedAt: timestamp('published_at', {withTimezone: true, mode: 'date'}),
    createdBy: uuid('created_by').references(() => profiles.id, {onDelete: 'set null'}),
    updatedBy: uuid('updated_by').references(() => profiles.id, {onDelete: 'set null'}),
    searchText: text('search_text').notNull().default(''),
    searchVector: tsvector('search_vector')
      .notNull()
      .default(sql`''::tsvector`),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    uniqueIndex('products_slug_active_uidx')
      .on(table.slug)
      .where(sql`${table.deletedAt} is null`),
    index('products_category_status_sort_idx').on(table.categoryId, table.status, table.sortOrder),
    index('products_type_status_idx').on(table.productTypeCode, table.status),
    index('products_published_idx').on(table.publishedAt, table.id)
  ]
);

export const productVariants = pgTable(
  'product_variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, {onDelete: 'cascade'}),
    sku: text('sku').notNull(),
    name: jsonb('name').$type<Record<string, string>>().notNull(),
    priceAmount: bigint('price_amount', {mode: 'number'}).notNull(),
    currencyCode: text('currency_code')
      .notNull()
      .references(() => currencies.code, {onUpdate: 'cascade'}),
    stockQuantity: integer('stock_quantity').notNull().default(0),
    unlimitedStock: boolean('unlimited_stock').notNull().default(false),
    regionCode: text('region_code'),
    durationDays: integer('duration_days'),
    denominationAmount: bigint('denomination_amount', {mode: 'number'}),
    denominationCurrencyCode: text('denomination_currency_code').references(() => currencies.code, {
      onUpdate: 'cascade'
    }),
    accountType: text('account_type'),
    attributes: jsonb('attributes').$type<Record<string, unknown>>().notNull().default({}),
    active: boolean('active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    uniqueIndex('product_variants_sku_active_uidx')
      .on(table.sku)
      .where(sql`${table.deletedAt} is null`),
    index('product_variants_product_active_sort_idx').on(
      table.productId,
      table.active,
      table.sortOrder
    ),
    index('product_variants_region_idx').on(table.regionCode),
    index('product_variants_price_idx').on(table.currencyCode, table.priceAmount),
    check('product_variants_price_ck', sql`${table.priceAmount} >= 0`),
    check('product_variants_stock_ck', sql`${table.stockQuantity} >= 0`)
  ]
);

export const productVariantCosts = pgTable(
  'product_variant_costs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, {onDelete: 'cascade'}),
    costAmount: bigint('cost_amount', {mode: 'number'}).notNull(),
    currencyCode: text('currency_code')
      .notNull()
      .references(() => currencies.code, {onUpdate: 'cascade'}),
    source: text('source').notNull().default('manual'),
    ...timestamps
  },
  (table) => [
    uniqueIndex('product_variant_costs_variant_uidx').on(table.variantId),
    check('product_variant_costs_amount_ck', sql`${table.costAmount} >= 0`)
  ]
);

export const productMedia = pgTable(
  'product_media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, {onDelete: 'cascade'}),
    variantId: uuid('variant_id').references(() => productVariants.id, {onDelete: 'cascade'}),
    kind: catalogMediaKind('kind').notNull().default('image'),
    url: text('url'),
    storagePath: text('storage_path'),
    altText: jsonb('alt_text').$type<Record<string, string>>().notNull().default({}),
    blurDataUrl: text('blur_data_url'),
    sortOrder: integer('sort_order').notNull().default(0),
    isPrimary: boolean('is_primary').notNull().default(false),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    index('product_media_product_sort_idx').on(table.productId, table.sortOrder),
    index('product_media_variant_idx').on(table.variantId),
    check('product_media_source_ck', sql`num_nonnulls(${table.url}, ${table.storagePath}) = 1`)
  ]
);

export const productRelations = pgTable(
  'product_relations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, {onDelete: 'cascade'}),
    relatedProductId: uuid('related_product_id')
      .notNull()
      .references(() => products.id, {onDelete: 'cascade'}),
    relationType: text('relation_type').notNull().default('related'),
    score: integer('score').notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps
  },
  (table) => [
    uniqueIndex('product_relations_pair_uidx').on(
      table.productId,
      table.relatedProductId,
      table.relationType
    ),
    index('product_relations_related_idx').on(table.relatedProductId),
    check('product_relations_not_self_ck', sql`${table.productId} <> ${table.relatedProductId}`)
  ]
);

export const smmProductConfigs = pgTable(
  'smm_product_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, {onDelete: 'cascade'}),
    minQuantity: integer('min_quantity').notNull(),
    maxQuantity: integer('max_quantity').notNull(),
    quantityStep: integer('quantity_step').notNull().default(1),
    pricePer1000Amount: bigint('price_per_1000_amount', {mode: 'number'}).notNull(),
    currencyCode: text('currency_code')
      .notNull()
      .references(() => currencies.code, {onUpdate: 'cascade'}),
    dripFeedEnabled: boolean('drip_feed_enabled').notNull().default(false),
    maxDripRuns: integer('max_drip_runs'),
    minDripIntervalMinutes: integer('min_drip_interval_minutes'),
    ...timestamps
  },
  (table) => [
    uniqueIndex('smm_product_configs_variant_uidx').on(table.variantId),
    check(
      'smm_configs_quantity_ck',
      sql`${table.minQuantity} > 0 and ${table.maxQuantity} >= ${table.minQuantity}`
    )
  ]
);

export const serviceProductConfigs = pgTable(
  'service_product_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, {onDelete: 'cascade'}),
    requirementSchema: jsonb('requirement_schema')
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    milestoneTemplates: jsonb('milestone_templates')
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    includedRevisions: integer('included_revisions').notNull().default(0),
    customQuoteRequired: boolean('custom_quote_required').notNull().default(true),
    ...timestamps
  },
  (table) => [
    uniqueIndex('service_product_configs_product_uidx').on(table.productId),
    check('service_configs_revisions_ck', sql`${table.includedRevisions} >= 0`)
  ]
);

export const serviceQuoteRequests = pgTable(
  'service_quote_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, {onDelete: 'restrict'}),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, {onDelete: 'restrict'}),
    variantId: uuid('variant_id').references(() => productVariants.id, {onDelete: 'set null'}),
    requirements: jsonb('requirements').$type<Record<string, unknown>>().notNull(),
    budgetMinAmount: bigint('budget_min_amount', {mode: 'number'}),
    budgetMaxAmount: bigint('budget_max_amount', {mode: 'number'}),
    currencyCode: text('currency_code').references(() => currencies.code, {onUpdate: 'cascade'}),
    desiredDueAt: timestamp('desired_due_at', {withTimezone: true, mode: 'date'}),
    status: quoteRequestStatus('status').notNull().default('submitted'),
    assignedTo: uuid('assigned_to').references(() => profiles.id, {onDelete: 'set null'}),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    index('service_quote_requests_profile_created_idx').on(table.profileId, table.createdAt),
    index('service_quote_requests_queue_idx').on(table.status, table.createdAt),
    index('service_quote_requests_assignee_idx').on(table.assignedTo, table.status)
  ]
);

export const recentlyViewedProducts = pgTable(
  'recently_viewed_products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, {onDelete: 'cascade'}),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, {onDelete: 'cascade'}),
    viewedAt: timestamp('viewed_at', {withTimezone: true, mode: 'date'}).notNull().defaultNow(),
    ...timestamps
  },
  (table) => [
    uniqueIndex('recently_viewed_products_profile_product_uidx').on(
      table.profileId,
      table.productId
    ),
    index('recently_viewed_products_profile_viewed_idx').on(table.profileId, table.viewedAt)
  ]
);

export const paymentFlow = pgEnum('payment_flow', ['automatic', 'proof']);
export const paymentStatus = pgEnum('payment_status', [
  'created',
  'requires_action',
  'awaiting_payment',
  'awaiting_proof',
  'under_review',
  'authorized',
  'paid',
  'failed',
  'expired',
  'cancelled',
  'partially_refunded',
  'refunded',
  'disputed',
  'chargeback'
]);
export const paymentVerificationStatus = pgEnum('payment_verification_status', [
  'pending',
  'processing',
  'needs_review',
  'approved',
  'rejected'
]);
export const paymentWebhookStatus = pgEnum('payment_webhook_status', [
  'received',
  'processed',
  'ignored',
  'failed'
]);
export const paymentRefundStatus = pgEnum('payment_refund_status', [
  'pending',
  'succeeded',
  'failed',
  'cancelled'
]);

export const paymentMethods = pgTable(
  'payment_methods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull().unique(),
    driver: text('driver').notNull(),
    flow: paymentFlow('flow').notNull(),
    name: jsonb('name').$type<Record<string, string>>().notNull().default({}),
    description: jsonb('description').$type<Record<string, string>>().notNull().default({}),
    instructions: jsonb('instructions').$type<Record<string, string[]>>().notNull().default({}),
    enabled: boolean('enabled').notNull().default(false),
    sandboxMode: boolean('sandbox_mode').notNull().default(true),
    minAmount: bigint('min_amount', {mode: 'number'}).notNull().default(100),
    maxAmount: bigint('max_amount', {mode: 'number'}).notNull().default(1000000),
    feeFixed: bigint('fee_fixed', {mode: 'number'}).notNull().default(0),
    feeBps: integer('fee_bps').notNull().default(0),
    allowedCurrencies: text('allowed_currencies')
      .array()
      .notNull()
      .default(sql`ARRAY['USD']::text[]`),
    allowedCountries: text('allowed_countries')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    allowedTiers: text('allowed_tiers')
      .array()
      .notNull()
      .default(sql`ARRAY['customer']::text[]`),
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    sortOrder: integer('sort_order').notNull().default(0),
    createdBy: uuid('created_by').references(() => profiles.id, {onDelete: 'set null'}),
    updatedBy: uuid('updated_by').references(() => profiles.id, {onDelete: 'set null'}),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [index('payment_methods_enabled_order_idx').on(table.enabled, table.sortOrder)]
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, {onDelete: 'restrict'}),
    paymentMethodId: uuid('payment_method_id')
      .notNull()
      .references(() => paymentMethods.id, {onDelete: 'restrict'}),
    providerCode: text('provider_code').notNull(),
    purpose: text('purpose').notNull().default('wallet_topup'),
    status: paymentStatus('status').notNull().default('created'),
    currencyCode: text('currency_code')
      .notNull()
      .references(() => currencies.code),
    requestedAmount: bigint('requested_amount', {mode: 'number'}).notNull(),
    feeAmount: bigint('fee_amount', {mode: 'number'}).notNull().default(0),
    payableAmount: bigint('payable_amount', {mode: 'number'}).notNull(),
    receivedAmount: bigint('received_amount', {mode: 'number'}).notNull().default(0),
    creditedAmount: bigint('credited_amount', {mode: 'number'}).notNull().default(0),
    refundedAmount: bigint('refunded_amount', {mode: 'number'}).notNull().default(0),
    paymentReference: text('payment_reference'),
    providerPaymentId: text('provider_payment_id'),
    providerCustomerId: text('provider_customer_id'),
    idempotencyKey: text('idempotency_key').notNull(),
    clientAction: jsonb('client_action').$type<Record<string, unknown>>().notNull().default({}),
    providerMetadata: jsonb('provider_metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    failureCode: text('failure_code'),
    failureMessage: text('failure_message'),
    sandboxMode: boolean('sandbox_mode').notNull().default(true),
    expiresAt: timestamp('expires_at', {withTimezone: true, mode: 'date'}),
    rateLockedAt: timestamp('rate_locked_at', {withTimezone: true, mode: 'date'}),
    rateExpiresAt: timestamp('rate_expires_at', {withTimezone: true, mode: 'date'}),
    paidAt: timestamp('paid_at', {withTimezone: true, mode: 'date'}),
    settledAt: timestamp('settled_at', {withTimezone: true, mode: 'date'}),
    walletTransactionId: uuid('wallet_transaction_id').references(() => walletTransactions.id, {
      onDelete: 'restrict'
    }),
    aiRiskScore: integer('ai_risk_score'),
    aiRiskDecision: text('ai_risk_decision'),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    uniqueIndex('payments_profile_idempotency_uidx').on(table.profileId, table.idempotencyKey),
    index('payments_status_created_idx').on(table.status, table.createdAt)
  ]
);

export const paymentProofs = pgTable(
  'payment_proofs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id, {onDelete: 'restrict'}),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, {onDelete: 'restrict'}),
    storagePath: text('storage_path').notNull().unique(),
    originalFilename: text('original_filename').notNull(),
    mimeType: text('mime_type').notNull(),
    byteSize: bigint('byte_size', {mode: 'number'}).notNull(),
    sha256: text('sha256').notNull(),
    perceptualHash: text('perceptual_hash'),
    status: paymentVerificationStatus('status').notNull().default('pending'),
    uploadedAt: timestamp('uploaded_at', {withTimezone: true, mode: 'date'}).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    index('payment_proofs_payment_idx').on(table.paymentId, table.createdAt),
    index('payment_proofs_sha_idx').on(table.sha256)
  ]
);

export const paymentProofChecks = pgTable('payment_proof_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  proofId: uuid('proof_id')
    .notNull()
    .unique()
    .references(() => paymentProofs.id, {onDelete: 'restrict'}),
  engine: text('engine').notNull(),
  extractedAmount: bigint('extracted_amount', {mode: 'number'}),
  extractedCurrency: text('extracted_currency'),
  extractedReference: text('extracted_reference'),
  extractedDate: timestamp('extracted_date', {withTimezone: true, mode: 'date'}),
  extractedSender: text('extracted_sender'),
  aiModel: text('ai_model'),
  confidenceBps: integer('confidence_bps').notNull().default(0),
  flags: text('flags')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  duplicateOfProofId: uuid('duplicate_of_proof_id').references(() => paymentProofs.id, {
    onDelete: 'set null'
  }),
  rawResult: jsonb('raw_result').$type<Record<string, unknown>>().notNull().default({}),
  ...timestamps
});

export const paymentVerificationQueue = pgTable(
  'payment_verification_queue',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    paymentId: uuid('payment_id')
      .notNull()
      .unique()
      .references(() => payments.id, {onDelete: 'restrict'}),
    proofId: uuid('proof_id')
      .notNull()
      .unique()
      .references(() => paymentProofs.id, {onDelete: 'restrict'}),
    status: paymentVerificationStatus('status').notNull().default('pending'),
    priority: integer('priority').notNull().default(100),
    claimedBy: uuid('claimed_by').references(() => profiles.id, {onDelete: 'set null'}),
    claimedAt: timestamp('claimed_at', {withTimezone: true, mode: 'date'}),
    reviewedBy: uuid('reviewed_by').references(() => profiles.id, {onDelete: 'set null'}),
    reviewedAt: timestamp('reviewed_at', {withTimezone: true, mode: 'date'}),
    reviewReason: text('review_reason'),
    ...timestamps
  },
  (table) => [index('payment_queue_work_idx').on(table.status, table.priority, table.createdAt)]
);

export const paymentWebhookEvents = pgTable(
  'payment_webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    providerCode: text('provider_code').notNull(),
    providerEventId: text('provider_event_id').notNull(),
    eventType: text('event_type').notNull(),
    signatureSha256: text('signature_sha256').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    status: paymentWebhookStatus('status').notNull().default('received'),
    attempts: integer('attempts').notNull().default(0),
    paymentId: uuid('payment_id').references(() => payments.id, {onDelete: 'set null'}),
    errorCode: text('error_code'),
    processedAt: timestamp('processed_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    uniqueIndex('payment_webhook_provider_event_uidx').on(table.providerCode, table.providerEventId)
  ]
);

export const paymentRefunds = pgTable('payment_refunds', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentId: uuid('payment_id')
    .notNull()
    .references(() => payments.id, {onDelete: 'restrict'}),
  amount: bigint('amount', {mode: 'number'}).notNull(),
  currencyCode: text('currency_code')
    .notNull()
    .references(() => currencies.code),
  providerRefundId: text('provider_refund_id'),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  status: paymentRefundStatus('status').notNull().default('pending'),
  reason: text('reason').notNull(),
  requestedBy: uuid('requested_by').references(() => profiles.id, {onDelete: 'set null'}),
  walletTransactionId: uuid('wallet_transaction_id').references(() => walletTransactions.id, {
    onDelete: 'restrict'
  }),
  failureCode: text('failure_code'),
  completedAt: timestamp('completed_at', {withTimezone: true, mode: 'date'}),
  ...timestamps
});

export const paymentDisputes = pgTable('payment_disputes', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentId: uuid('payment_id')
    .notNull()
    .references(() => payments.id, {onDelete: 'restrict'}),
  providerDisputeId: text('provider_dispute_id').notNull().unique(),
  status: text('status').notNull(),
  amount: bigint('amount', {mode: 'number'}).notNull(),
  currencyCode: text('currency_code')
    .notNull()
    .references(() => currencies.code),
  reason: text('reason'),
  evidenceDueAt: timestamp('evidence_due_at', {withTimezone: true, mode: 'date'}),
  closedAt: timestamp('closed_at', {withTimezone: true, mode: 'date'}),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  ...timestamps
});

export const savedPaymentMethods = pgTable(
  'saved_payment_methods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, {onDelete: 'cascade'}),
    providerCode: text('provider_code').notNull(),
    providerCustomerId: text('provider_customer_id').notNull(),
    providerPaymentMethodId: text('provider_payment_method_id').notNull(),
    brand: text('brand'),
    last4: text('last4'),
    expMonth: integer('exp_month'),
    expYear: integer('exp_year'),
    isDefault: boolean('is_default').notNull().default(false),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    uniqueIndex('saved_payment_provider_method_uidx').on(
      table.providerCode,
      table.providerPaymentMethodId
    ),
    index('saved_payment_profile_idx').on(table.profileId)
  ]
);

export const cryptoPaymentDetails = pgTable('crypto_payment_details', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentId: uuid('payment_id')
    .notNull()
    .unique()
    .references(() => payments.id, {onDelete: 'restrict'}),
  asset: text('asset').notNull(),
  network: text('network').notNull(),
  payAddress: text('pay_address').notNull(),
  expectedAtomic: numeric('expected_atomic', {precision: 78, scale: 0}).notNull(),
  receivedAtomic: numeric('received_atomic', {precision: 78, scale: 0}).notNull().default('0'),
  atomicScale: integer('atomic_scale').notNull(),
  requiredConfirmations: integer('required_confirmations').notNull(),
  currentConfirmations: integer('current_confirmations').notNull().default(0),
  underpaymentToleranceBps: integer('underpayment_tolerance_bps').notNull().default(100),
  overpaymentPolicy: text('overpayment_policy').notNull().default('credit_received'),
  quoteNumerator: bigint('quote_numerator', {mode: 'number'}).notNull(),
  quoteDenominator: bigint('quote_denominator', {mode: 'number'}).notNull(),
  expiresAt: timestamp('expires_at', {withTimezone: true, mode: 'date'}).notNull(),
  ...timestamps
});

export const paymentAuditLogs = pgTable(
  'payment_audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    paymentId: uuid('payment_id').references(() => payments.id, {onDelete: 'set null'}),
    actorId: uuid('actor_id').references(() => profiles.id, {onDelete: 'set null'}),
    actorType: text('actor_type').notNull(),
    action: text('action').notNull(),
    requestId: text('request_id'),
    ipHash: text('ip_hash'),
    before: jsonb('before'),
    after: jsonb('after'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps
  },
  (table) => [
    index('payment_audit_payment_idx').on(table.paymentId, table.createdAt),
    uniqueIndex('payment_audit_request_uidx').on(table.requestId)
  ]
);

export const cartStatus = pgEnum('cart_status', ['active', 'converted', 'abandoned', 'expired']);
export const couponKind = pgEnum('coupon_kind', ['percent', 'fixed', 'free_item']);
export const discountValueKind = pgEnum('discount_value_kind', ['percent', 'fixed', 'unit_price']);
export const orderStatus = pgEnum('order_status', [
  'draft',
  'awaiting_payment',
  'paid',
  'processing',
  'partially_delivered',
  'delivered',
  'completed',
  'on_hold',
  'failed',
  'cancelled',
  'refunded',
  'disputed'
]);
export const orderDeliveryKind = pgEnum('order_delivery_kind', ['code', 'text', 'file', 'link']);
export const refundRequestStatus = pgEnum('refund_request_status', [
  'pending',
  'reviewing',
  'approved',
  'rejected',
  'processed',
  'cancelled'
]);
export const recoveryJobStatus = pgEnum('recovery_job_status', [
  'pending',
  'processing',
  'sent',
  'failed',
  'cancelled'
]);

export const carts = pgTable(
  'carts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id').references(() => profiles.id, {onDelete: 'cascade'}),
    guestTokenHash: text('guest_token_hash'),
    status: cartStatus('status').notNull().default('active'),
    currencyCode: text('currency_code')
      .notNull()
      .references(() => currencies.code),
    localeCode: text('locale_code')
      .notNull()
      .references(() => locales.code),
    countryCode: text('country_code'),
    couponCodes: text('coupon_codes')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    lastActivityAt: timestamp('last_activity_at', {withTimezone: true, mode: 'date'})
      .notNull()
      .defaultNow(),
    convertedOrderId: uuid('converted_order_id'),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    uniqueIndex('carts_profile_active_uidx').on(table.profileId),
    uniqueIndex('carts_guest_active_uidx').on(table.guestTokenHash),
    index('carts_recovery_idx').on(table.status, table.lastActivityAt),
    check('carts_owner_ck', sql`num_nonnulls(${table.profileId},${table.guestTokenHash})=1`)
  ]
);

export const cartItems = pgTable(
  'cart_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cartId: uuid('cart_id')
      .notNull()
      .references(() => carts.id, {onDelete: 'cascade'}),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, {onDelete: 'restrict'}),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, {onDelete: 'restrict'}),
    quantity: integer('quantity').notNull().default(1),
    optionValues: jsonb('option_values').$type<Record<string, unknown>>().notNull().default({}),
    optionFingerprint: text('option_fingerprint').notNull(),
    validationSnapshot: jsonb('validation_snapshot').notNull().default({}),
    unitPriceSnapshot: bigint('unit_price_snapshot', {mode: 'number'}).notNull().default(0),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    uniqueIndex('cart_items_identity_uidx').on(
      table.cartId,
      table.variantId,
      table.optionFingerprint
    ),
    index('cart_items_cart_idx').on(table.cartId, table.createdAt),
    index('cart_items_product_idx').on(table.productId),
    index('cart_items_variant_idx').on(table.variantId),
    check('cart_items_quantity_ck', sql`${table.quantity} BETWEEN 1 AND 1000000`)
  ]
);

export const tierPrices = pgTable('tier_prices', {
  id: uuid('id').primaryKey().defaultRandom(),
  variantId: uuid('variant_id')
    .notNull()
    .references(() => productVariants.id, {onDelete: 'cascade'}),
  tierCode: text('tier_code').notNull(),
  priceAmount: bigint('price_amount', {mode: 'number'}).notNull(),
  currencyCode: text('currency_code')
    .notNull()
    .references(() => currencies.code),
  startsAt: timestamp('starts_at', {withTimezone: true, mode: 'date'}),
  endsAt: timestamp('ends_at', {withTimezone: true, mode: 'date'}),
  deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
  ...timestamps
});

export const countryPrices = pgTable('country_prices', {
  id: uuid('id').primaryKey().defaultRandom(),
  variantId: uuid('variant_id')
    .notNull()
    .references(() => productVariants.id, {onDelete: 'cascade'}),
  countryCode: text('country_code').notNull(),
  priceAmount: bigint('price_amount', {mode: 'number'}).notNull(),
  currencyCode: text('currency_code')
    .notNull()
    .references(() => currencies.code),
  deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
  ...timestamps
});

export const quantityDiscounts = pgTable('quantity_discounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  variantId: uuid('variant_id')
    .notNull()
    .references(() => productVariants.id, {onDelete: 'cascade'}),
  minimumQuantity: integer('minimum_quantity').notNull(),
  maximumQuantity: integer('maximum_quantity'),
  valueKind: discountValueKind('value_kind').notNull(),
  valueAmount: bigint('value_amount', {mode: 'number'}).notNull(),
  priority: integer('priority').notNull().default(0),
  deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
  ...timestamps
});

export const flashSales = pgTable('flash_sales', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: jsonb('name').$type<Record<string, string>>().notNull().default({}),
  valueKind: discountValueKind('value_kind').notNull(),
  valueAmount: bigint('value_amount', {mode: 'number'}).notNull(),
  startsAt: timestamp('starts_at', {withTimezone: true, mode: 'date'}).notNull(),
  endsAt: timestamp('ends_at', {withTimezone: true, mode: 'date'}).notNull(),
  active: boolean('active').notNull().default(true),
  priority: integer('priority').notNull().default(0),
  deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
  ...timestamps
});

export const flashSaleScopes = pgTable(
  'flash_sale_scopes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    flashSaleId: uuid('flash_sale_id')
      .notNull()
      .references(() => flashSales.id, {onDelete: 'cascade'}),
    categoryId: uuid('category_id').references(() => categories.id, {onDelete: 'cascade'}),
    productId: uuid('product_id').references(() => products.id, {onDelete: 'cascade'}),
    variantId: uuid('variant_id').references(() => productVariants.id, {onDelete: 'cascade'}),
    ...timestamps
  },
  (table) => [index('flash_sale_scopes_sale_idx').on(table.flashSaleId)]
);

export const coupons = pgTable(
  'coupons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    kind: couponKind('kind').notNull(),
    valueAmount: bigint('value_amount', {mode: 'number'}).notNull().default(0),
    currencyCode: text('currency_code').references(() => currencies.code),
    freeVariantId: uuid('free_variant_id').references(() => productVariants.id, {
      onDelete: 'restrict'
    }),
    usageLimit: integer('usage_limit'),
    perUserLimit: integer('per_user_limit'),
    minimumCartAmount: bigint('minimum_cart_amount', {mode: 'number'}).notNull().default(0),
    startsAt: timestamp('starts_at', {withTimezone: true, mode: 'date'}),
    expiresAt: timestamp('expires_at', {withTimezone: true, mode: 'date'}),
    firstOrderOnly: boolean('first_order_only').notNull().default(false),
    autoApply: boolean('auto_apply').notNull().default(false),
    stackable: boolean('stackable').notNull().default(false),
    stackGroup: text('stack_group').notNull().default('default'),
    priority: integer('priority').notNull().default(0),
    active: boolean('active').notNull().default(true),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [uniqueIndex('coupons_code_active_uidx').on(table.code)]
);

export const couponCategories = pgTable(
  'coupon_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    couponId: uuid('coupon_id')
      .notNull()
      .references(() => coupons.id, {onDelete: 'cascade'}),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, {onDelete: 'cascade'}),
    ...timestamps
  },
  (table) => [uniqueIndex('coupon_categories_identity_uidx').on(table.couponId, table.categoryId)]
);

export const couponProducts = pgTable(
  'coupon_products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    couponId: uuid('coupon_id')
      .notNull()
      .references(() => coupons.id, {onDelete: 'cascade'}),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, {onDelete: 'cascade'}),
    ...timestamps
  },
  (table) => [uniqueIndex('coupon_products_identity_uidx').on(table.couponId, table.productId)]
);

export const taxRules = pgTable('tax_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  countryCode: text('country_code').notNull(),
  name: jsonb('name').$type<Record<string, string>>().notNull().default({}),
  rateBps: integer('rate_bps').notNull(),
  inclusive: boolean('inclusive').notNull().default(false),
  digitalProducts: boolean('digital_products').notNull().default(true),
  active: boolean('active').notNull().default(true),
  startsAt: timestamp('starts_at', {withTimezone: true, mode: 'date'}),
  endsAt: timestamp('ends_at', {withTimezone: true, mode: 'date'}),
  deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
  ...timestamps
});

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderNumber: text('order_number').notNull(),
    profileId: uuid('profile_id').references(() => profiles.id, {onDelete: 'restrict'}),
    guestEmail: text('guest_email'),
    guestAccessTokenHash: text('guest_access_token_hash'),
    cartId: uuid('cart_id').references(() => carts.id, {onDelete: 'set null'}),
    checkoutIdempotencyKey: text('checkout_idempotency_key').notNull(),
    status: orderStatus('status').notNull().default('draft'),
    currencyCode: text('currency_code')
      .notNull()
      .references(() => currencies.code),
    localeCode: text('locale_code')
      .notNull()
      .references(() => locales.code),
    countryCode: text('country_code').notNull(),
    customerNotes: text('customer_notes'),
    termsAcceptedAt: timestamp('terms_accepted_at', {withTimezone: true, mode: 'date'}).notNull(),
    subtotalAmount: bigint('subtotal_amount', {mode: 'number'}).notNull(),
    discountAmount: bigint('discount_amount', {mode: 'number'}).notNull().default(0),
    feeAmount: bigint('fee_amount', {mode: 'number'}).notNull().default(0),
    taxAmount: bigint('tax_amount', {mode: 'number'}).notNull().default(0),
    totalAmount: bigint('total_amount', {mode: 'number'}).notNull(),
    paidAmount: bigint('paid_amount', {mode: 'number'}).notNull().default(0),
    refundedAmount: bigint('refunded_amount', {mode: 'number'}).notNull().default(0),
    paymentId: uuid('payment_id').references(() => payments.id, {onDelete: 'set null'}),
    walletTransactionId: uuid('wallet_transaction_id').references(() => walletTransactions.id),
    pricingSnapshot: jsonb('pricing_snapshot').notNull(),
    aiRiskScore: integer('ai_risk_score'),
    aiRiskDecision: text('ai_risk_decision'),
    paidAt: timestamp('paid_at', {withTimezone: true, mode: 'date'}),
    deliveredAt: timestamp('delivered_at', {withTimezone: true, mode: 'date'}),
    completedAt: timestamp('completed_at', {withTimezone: true, mode: 'date'}),
    cancelledAt: timestamp('cancelled_at', {withTimezone: true, mode: 'date'}),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    uniqueIndex('orders_number_uidx').on(table.orderNumber),
    uniqueIndex('orders_cart_checkout_idempotency_uidx').on(
      table.cartId,
      table.checkoutIdempotencyKey
    ),
    uniqueIndex('orders_profile_checkout_idempotency_uidx').on(
      table.profileId,
      table.checkoutIdempotencyKey
    ),
    uniqueIndex('orders_guest_checkout_idempotency_uidx').on(
      table.guestAccessTokenHash,
      table.checkoutIdempotencyKey
    ),
    index('orders_profile_created_idx').on(table.profileId, table.createdAt),
    index('orders_status_created_idx').on(table.status, table.createdAt)
  ]
);

export const orderItems = pgTable('order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, {onDelete: 'restrict'}),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, {onDelete: 'restrict'}),
  variantId: uuid('variant_id')
    .notNull()
    .references(() => productVariants.id, {onDelete: 'restrict'}),
  sku: text('sku').notNull(),
  productName: jsonb('product_name').notNull(),
  variantName: jsonb('variant_name').notNull(),
  optionValues: jsonb('option_values').notNull().default({}),
  quantity: integer('quantity').notNull(),
  baseAmount: bigint('base_amount', {mode: 'number'}).notNull(),
  tierAmount: bigint('tier_amount', {mode: 'number'}).notNull().default(0),
  countryAmount: bigint('country_amount', {mode: 'number'}).notNull().default(0),
  quantityDiscountAmount: bigint('quantity_discount_amount', {mode: 'number'}).notNull().default(0),
  flashDiscountAmount: bigint('flash_discount_amount', {mode: 'number'}).notNull().default(0),
  couponDiscountAmount: bigint('coupon_discount_amount', {mode: 'number'}).notNull().default(0),
  loyaltyDiscountAmount: bigint('loyalty_discount_amount', {mode: 'number'}).notNull().default(0),
  feeAmount: bigint('fee_amount', {mode: 'number'}).notNull().default(0),
  taxAmount: bigint('tax_amount', {mode: 'number'}).notNull().default(0),
  totalAmount: bigint('total_amount', {mode: 'number'}).notNull(),
  fulfillmentMode: fulfillmentMode('fulfillment_mode').notNull(),
  deliveredQuantity: integer('delivered_quantity').notNull().default(0),
  warrantyText: jsonb('warranty_text').notNull().default({}),
  ...timestamps
});

export const orderEvents = pgTable(
  'order_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, {onDelete: 'restrict'}),
    fromStatus: orderStatus('from_status'),
    toStatus: orderStatus('to_status').notNull(),
    actorId: uuid('actor_id').references(() => profiles.id, {onDelete: 'set null'}),
    actorType: text('actor_type').notNull().default('system'),
    source: text('source').notNull().default('system'),
    reason: text('reason'),
    publicMessage: jsonb('public_message').notNull().default({}),
    metadata: jsonb('metadata').notNull().default({}),
    ...timestamps
  },
  (table) => [index('order_events_order_created_idx').on(table.orderId, table.createdAt)]
);

export const orderDeliveries = pgTable(
  'order_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, {onDelete: 'restrict'}),
    orderItemId: uuid('order_item_id')
      .notNull()
      .references(() => orderItems.id, {onDelete: 'restrict'}),
    kind: orderDeliveryKind('kind').notNull(),
    payloadCiphertext: text('payload_ciphertext'),
    displayHint: text('display_hint'),
    storagePath: text('storage_path'),
    deliveredBy: uuid('delivered_by').references(() => profiles.id, {onDelete: 'set null'}),
    revealedAt: timestamp('revealed_at', {withTimezone: true, mode: 'date'}),
    revealCount: integer('reveal_count').notNull().default(0),
    expiresAt: timestamp('expires_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [index('order_deliveries_order_idx').on(table.orderId, table.createdAt)]
);

export const orderMessages = pgTable(
  'order_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, {onDelete: 'cascade'}),
    authorId: uuid('author_id').references(() => profiles.id, {onDelete: 'set null'}),
    authorType: text('author_type').notNull(),
    body: text('body').notNull(),
    attachmentPath: text('attachment_path'),
    internal: boolean('internal').notNull().default(false),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [index('order_messages_order_created_idx').on(table.orderId, table.createdAt)]
);

export const orderRefundRequests = pgTable(
  'order_refund_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, {onDelete: 'restrict'}),
    profileId: uuid('profile_id').references(() => profiles.id, {onDelete: 'set null'}),
    requestedAmount: bigint('requested_amount', {mode: 'number'}).notNull(),
    reason: text('reason').notNull(),
    status: refundRequestStatus('status').notNull().default('pending'),
    reviewedBy: uuid('reviewed_by').references(() => profiles.id, {onDelete: 'set null'}),
    reviewReason: text('review_reason'),
    reviewedAt: timestamp('reviewed_at', {withTimezone: true, mode: 'date'}),
    paymentRefundId: uuid('payment_refund_id').references(() => paymentRefunds.id, {
      onDelete: 'set null'
    }),
    walletTransactionId: uuid('wallet_transaction_id').references(() => walletTransactions.id, {
      onDelete: 'restrict'
    }),
    ...timestamps
  },
  (table) => [index('order_refunds_order_idx').on(table.orderId, table.createdAt)]
);

export const couponRedemptions = pgTable(
  'coupon_redemptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    couponId: uuid('coupon_id')
      .notNull()
      .references(() => coupons.id, {onDelete: 'restrict'}),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, {onDelete: 'restrict'}),
    profileId: uuid('profile_id').references(() => profiles.id, {onDelete: 'set null'}),
    discountAmount: bigint('discount_amount', {mode: 'number'}).notNull(),
    currencyCode: text('currency_code')
      .notNull()
      .references(() => currencies.code),
    ...timestamps
  },
  (table) => [uniqueIndex('coupon_redemptions_identity_uidx').on(table.couponId, table.orderId)]
);

export const cartRecoveryJobs = pgTable(
  'cart_recovery_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cartId: uuid('cart_id')
      .notNull()
      .references(() => carts.id, {onDelete: 'cascade'}),
    sequenceNumber: integer('sequence_number').notNull(),
    status: recoveryJobStatus('status').notNull().default('pending'),
    runAt: timestamp('run_at', {withTimezone: true, mode: 'date'}).notNull(),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    sentAt: timestamp('sent_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    uniqueIndex('cart_recovery_jobs_identity_uidx').on(table.cartId, table.sequenceNumber)
  ]
);

export const fulfillmentJobStatus = pgEnum('fulfillment_job_status', [
  'pending',
  'running',
  'retrying',
  'completed',
  'failed',
  'dead_letter',
  'cancelled'
]);
export const stockCodeStatus = pgEnum('stock_code_status', [
  'available',
  'assigned',
  'expired',
  'disabled'
]);
export const supplierHealthStatus = pgEnum('supplier_health_status', [
  'healthy',
  'degraded',
  'open',
  'disabled'
]);
export const supplierOrderStatus = pgEnum('supplier_order_status', [
  'queued',
  'submitted',
  'processing',
  'partial',
  'completed',
  'failed',
  'cancelled'
]);
export const fulfillmentAttemptStatus = pgEnum('fulfillment_attempt_status', [
  'queued',
  'running',
  'succeeded',
  'failed',
  'manual_fallback'
]);
export const manualFulfillmentStatus = pgEnum('manual_fulfillment_status', [
  'queued',
  'claimed',
  'in_progress',
  'waiting_customer',
  'delivered',
  'completed',
  'cancelled',
  'sla_breached'
]);
export const manualFulfillmentPriority = pgEnum('manual_fulfillment_priority', [
  'normal',
  'high',
  'vip',
  'urgent'
]);

export const fulfillmentJobs = pgTable(
  'fulfillment_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    status: fulfillmentJobStatus('status').notNull().default('pending'),
    priority: integer('priority').notNull().default(100),
    runAt: timestamp('run_at', {withTimezone: true, mode: 'date'}).notNull().defaultNow(),
    attemptCount: integer('attempt_count').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(6),
    lockedBy: text('locked_by'),
    lockedUntil: timestamp('locked_until', {withTimezone: true, mode: 'date'}),
    lastErrorCode: text('last_error_code'),
    lastErrorSafe: text('last_error_safe'),
    result: jsonb('result'),
    idempotencyKey: text('idempotency_key').notNull(),
    completedAt: timestamp('completed_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    uniqueIndex('fulfillment_jobs_idempotency_uidx').on(table.kind, table.idempotencyKey),
    index('fulfillment_jobs_due_idx').on(table.priority, table.runAt, table.createdAt),
    index('fulfillment_jobs_aggregate_idx').on(
      table.aggregateType,
      table.aggregateId,
      table.createdAt
    )
  ]
);

export const fulfillmentJobAttempts = pgTable(
  'fulfillment_job_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => fulfillmentJobs.id, {onDelete: 'restrict'}),
    attemptNumber: integer('attempt_number').notNull(),
    workerId: text('worker_id').notNull(),
    startedAt: timestamp('started_at', {withTimezone: true, mode: 'date'}).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', {withTimezone: true, mode: 'date'}),
    outcome: text('outcome'),
    errorCode: text('error_code'),
    errorSafe: text('error_safe'),
    durationMs: integer('duration_ms'),
    ...timestamps
  },
  (table) => [
    uniqueIndex('fulfillment_job_attempts_identity_uidx').on(table.jobId, table.attemptNumber)
  ]
);

export const fulfillmentDeadLetters = pgTable(
  'fulfillment_dead_letters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => fulfillmentJobs.id, {onDelete: 'restrict'}),
    reasonCode: text('reason_code').notNull(),
    reasonSafe: text('reason_safe').notNull(),
    payloadSnapshot: jsonb('payload_snapshot').notNull(),
    replayedJobId: uuid('replayed_job_id').references(() => fulfillmentJobs.id, {
      onDelete: 'set null'
    }),
    resolvedBy: uuid('resolved_by').references(() => profiles.id, {onDelete: 'set null'}),
    resolvedAt: timestamp('resolved_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [uniqueIndex('fulfillment_dead_letters_job_uidx').on(table.jobId)]
);

export const stockCodeImportBatches = pgTable('stock_code_import_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  variantId: uuid('variant_id')
    .notNull()
    .references(() => productVariants.id, {onDelete: 'restrict'}),
  filename: text('filename').notNull(),
  totalRows: integer('total_rows').notNull(),
  importedRows: integer('imported_rows').notNull().default(0),
  duplicateRows: integer('duplicate_rows').notNull().default(0),
  rejectedRows: integer('rejected_rows').notNull().default(0),
  importedBy: uuid('imported_by')
    .notNull()
    .references(() => profiles.id, {onDelete: 'restrict'}),
  errorReport: jsonb('error_report').notNull().default([]),
  ...timestamps
});

export const stockCodes = pgTable(
  'stock_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, {onDelete: 'restrict'}),
    importBatchId: uuid('import_batch_id').references(() => stockCodeImportBatches.id, {
      onDelete: 'set null'
    }),
    payloadCiphertext: text('payload_ciphertext').notNull(),
    payloadHash: text('payload_hash').notNull(),
    displayHint: text('display_hint'),
    status: stockCodeStatus('status').notNull().default('available'),
    expiresAt: timestamp('expires_at', {withTimezone: true, mode: 'date'}),
    assignedOrderItemId: uuid('assigned_order_item_id').references(() => orderItems.id, {
      onDelete: 'restrict'
    }),
    assignedAt: timestamp('assigned_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    uniqueIndex('stock_codes_variant_hash_uidx').on(table.variantId, table.payloadHash),
    index('stock_codes_available_pool_idx').on(table.variantId, table.expiresAt, table.createdAt),
    index('stock_codes_assignment_item_idx').on(table.assignedOrderItemId),
    index('stock_codes_import_batch_idx').on(table.importBatchId)
  ]
);

export const suppliers = pgTable(
  'suppliers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    driver: text('driver').notNull(),
    endpoint: text('endpoint').notNull(),
    apiKeyCiphertext: text('api_key_ciphertext'),
    currencyCode: text('currency_code')
      .notNull()
      .references(() => currencies.code),
    marginBps: integer('margin_bps').notNull().default(0),
    priority: integer('priority').notNull().default(100),
    enabled: boolean('enabled').notNull().default(true),
    sandboxMode: boolean('sandbox_mode').notNull().default(false),
    healthStatus: supplierHealthStatus('health_status').notNull().default('healthy'),
    consecutiveFailures: integer('consecutive_failures').notNull().default(0),
    successCount: bigint('success_count', {mode: 'number'}).notNull().default(0),
    failureCount: bigint('failure_count', {mode: 'number'}).notNull().default(0),
    partialCount: bigint('partial_count', {mode: 'number'}).notNull().default(0),
    averageLatencyMs: integer('average_latency_ms'),
    lastHealthCheckAt: timestamp('last_health_check_at', {withTimezone: true, mode: 'date'}),
    settings: jsonb('settings').notNull().default({}),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    uniqueIndex('suppliers_code_active_uidx').on(table.code),
    index('suppliers_routing_idx').on(table.enabled, table.healthStatus, table.priority)
  ]
);

export const supplierProducts = pgTable(
  'supplier_products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, {onDelete: 'restrict'}),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, {onDelete: 'restrict'}),
    externalServiceId: text('external_service_id').notNull(),
    costAmount: bigint('cost_amount', {mode: 'number'}).notNull(),
    costCurrencyCode: text('cost_currency_code')
      .notNull()
      .references(() => currencies.code),
    minimumQuantity: integer('minimum_quantity').notNull().default(1),
    maximumQuantity: integer('maximum_quantity'),
    quantityStep: integer('quantity_step').notNull().default(1),
    priority: integer('priority').notNull().default(100),
    active: boolean('active').notNull().default(true),
    mapping: jsonb('mapping').notNull().default({}),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    uniqueIndex('supplier_products_identity_uidx').on(table.supplierId, table.variantId),
    index('supplier_products_routing_idx').on(table.variantId, table.active, table.priority)
  ]
);

export const supplierCircuits = pgTable(
  'supplier_circuits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, {onDelete: 'cascade'}),
    operation: text('operation').notNull().default('place_order'),
    state: text('state').notNull().default('closed'),
    failureCount: integer('failure_count').notNull().default(0),
    successCount: integer('success_count').notNull().default(0),
    openedAt: timestamp('opened_at', {withTimezone: true, mode: 'date'}),
    probeAfter: timestamp('probe_after', {withTimezone: true, mode: 'date'}),
    lastErrorSafe: text('last_error_safe'),
    version: integer('version').notNull().default(1),
    ...timestamps
  },
  (table) => [uniqueIndex('supplier_circuits_identity_uidx').on(table.supplierId, table.operation)]
);

export const supplierOrders = pgTable(
  'supplier_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, {onDelete: 'restrict'}),
    supplierProductId: uuid('supplier_product_id')
      .notNull()
      .references(() => supplierProducts.id, {onDelete: 'restrict'}),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, {onDelete: 'restrict'}),
    orderItemId: uuid('order_item_id')
      .notNull()
      .references(() => orderItems.id, {onDelete: 'restrict'}),
    externalOrderId: text('external_order_id'),
    idempotencyKey: text('idempotency_key').notNull(),
    status: supplierOrderStatus('status').notNull().default('queued'),
    requestedQuantity: integer('requested_quantity').notNull(),
    deliveredQuantity: integer('delivered_quantity').notNull().default(0),
    targetCiphertext: text('target_ciphertext'),
    requestSafe: jsonb('request_safe').notNull().default({}),
    responseSafe: jsonb('response_safe').notNull().default({}),
    costAmount: bigint('cost_amount', {mode: 'number'}).notNull().default(0),
    costCurrencyCode: text('cost_currency_code')
      .notNull()
      .references(() => currencies.code),
    placedAt: timestamp('placed_at', {withTimezone: true, mode: 'date'}),
    completedAt: timestamp('completed_at', {withTimezone: true, mode: 'date'}),
    lastCheckedAt: timestamp('last_checked_at', {withTimezone: true, mode: 'date'}),
    nextPollAt: timestamp('next_poll_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    uniqueIndex('supplier_orders_idempotency_uidx').on(table.idempotencyKey),
    index('supplier_orders_poll_idx').on(table.nextPollAt),
    index('supplier_orders_item_idx').on(table.orderItemId, table.createdAt)
  ]
);

export const supplierOrderEvents = pgTable('supplier_order_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  supplierOrderId: uuid('supplier_order_id')
    .notNull()
    .references(() => supplierOrders.id, {onDelete: 'restrict'}),
  fromStatus: supplierOrderStatus('from_status'),
  toStatus: supplierOrderStatus('to_status').notNull(),
  deliveredQuantity: integer('delivered_quantity').notNull().default(0),
  responseSafe: jsonb('response_safe').notNull().default({}),
  ...timestamps
});

export const fulfillmentAttempts = pgTable(
  'fulfillment_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, {onDelete: 'restrict'}),
    orderItemId: uuid('order_item_id')
      .notNull()
      .references(() => orderItems.id, {onDelete: 'restrict'}),
    jobId: uuid('job_id').references(() => fulfillmentJobs.id, {onDelete: 'set null'}),
    supplierOrderId: uuid('supplier_order_id').references(() => supplierOrders.id, {
      onDelete: 'set null'
    }),
    stockCodeId: uuid('stock_code_id').references(() => stockCodes.id, {onDelete: 'set null'}),
    attemptNumber: integer('attempt_number').notNull(),
    status: fulfillmentAttemptStatus('status').notNull().default('queued'),
    startedAt: timestamp('started_at', {withTimezone: true, mode: 'date'}).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', {withTimezone: true, mode: 'date'}),
    nextRetryAt: timestamp('next_retry_at', {withTimezone: true, mode: 'date'}),
    errorCode: text('error_code'),
    errorSafe: text('error_safe'),
    correlationId: uuid('correlation_id').notNull().defaultRandom(),
    ...timestamps
  },
  (table) => [
    uniqueIndex('fulfillment_attempts_identity_uidx').on(table.orderItemId, table.attemptNumber)
  ]
);

export const manualFulfillmentTasks = pgTable(
  'manual_fulfillment_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, {onDelete: 'restrict'}),
    orderItemId: uuid('order_item_id')
      .notNull()
      .references(() => orderItems.id, {onDelete: 'restrict'}),
    fallbackAttemptId: uuid('fallback_attempt_id').references(() => fulfillmentAttempts.id, {
      onDelete: 'set null'
    }),
    status: manualFulfillmentStatus('status').notNull().default('queued'),
    priority: manualFulfillmentPriority('priority').notNull().default('normal'),
    slaDueAt: timestamp('sla_due_at', {withTimezone: true, mode: 'date'}).notNull(),
    claimedBy: uuid('claimed_by').references(() => profiles.id, {onDelete: 'set null'}),
    assignedTo: uuid('assigned_to').references(() => profiles.id, {onDelete: 'set null'}),
    claimedAt: timestamp('claimed_at', {withTimezone: true, mode: 'date'}),
    startedAt: timestamp('started_at', {withTimezone: true, mode: 'date'}),
    waitingSince: timestamp('waiting_since', {withTimezone: true, mode: 'date'}),
    completedAt: timestamp('completed_at', {withTimezone: true, mode: 'date'}),
    failureContext: jsonb('failure_context').notNull().default({}),
    version: integer('version').notNull().default(1),
    ...timestamps
  },
  (table) => [index('manual_tasks_order_idx').on(table.orderId, table.createdAt)]
);

export const manualFulfillmentNotes = pgTable('manual_fulfillment_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id')
    .notNull()
    .references(() => manualFulfillmentTasks.id, {onDelete: 'restrict'}),
  authorId: uuid('author_id')
    .notNull()
    .references(() => profiles.id, {onDelete: 'restrict'}),
  bodyCiphertext: text('body_ciphertext').notNull(),
  visibility: text('visibility').notNull().default('internal'),
  attachmentPath: text('attachment_path'),
  ...timestamps
});

export const fulfillmentNotifications = pgTable('fulfillment_notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  profileId: uuid('profile_id').references(() => profiles.id, {onDelete: 'cascade'}),
  orderId: uuid('order_id').references(() => orders.id, {onDelete: 'cascade'}),
  audience: text('audience').notNull(),
  kind: text('kind').notNull(),
  payload: jsonb('payload').notNull().default({}),
  readAt: timestamp('read_at', {withTimezone: true, mode: 'date'}),
  ...timestamps
});

export const customerTiers = pgTable(
  'customer_tiers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: jsonb('name').$type<Record<string, string>>().notNull().default({}),
    description: jsonb('description').$type<Record<string, string>>().notNull().default({}),
    minimumLifetimeSpend: bigint('minimum_lifetime_spend', {mode: 'number'}).notNull().default(0),
    discountBps: integer('discount_bps').notNull().default(0),
    pointsMultiplierBps: integer('points_multiplier_bps').notNull().default(10000),
    priorityQueue: boolean('priority_queue').notNull().default(false),
    benefits: jsonb('benefits').notNull().default([]),
    walletLimitAmount: bigint('wallet_limit_amount', {mode: 'number'}),
    orderLimitAmount: bigint('order_limit_amount', {mode: 'number'}),
    limitCurrencyCode: text('limit_currency_code').references(() => currencies.code),
    exclusiveProducts: boolean('exclusive_products').notNull().default(false),
    dedicatedSupport: boolean('dedicated_support').notNull().default(false),
    freeExtras: jsonb('free_extras').notNull().default([]),
    sortOrder: integer('sort_order').notNull().default(0),
    active: boolean('active').notNull().default(true),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [uniqueIndex('customer_tiers_code_uidx').on(table.code)]
);

export const loyaltyRules = pgTable(
  'loyalty_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: jsonb('name').$type<Record<string, string>>().notNull().default({}),
    ruleKind: text('rule_kind').notNull(),
    pointsValue: bigint('points_value', {mode: 'number'}).notNull().default(0),
    amountMinor: bigint('amount_minor', {mode: 'number'}).notNull().default(0),
    multiplierBps: integer('multiplier_bps').notNull().default(10000),
    startsAt: timestamp('starts_at', {withTimezone: true, mode: 'date'}),
    endsAt: timestamp('ends_at', {withTimezone: true, mode: 'date'}),
    configuration: jsonb('configuration').notNull().default({}),
    active: boolean('active').notNull().default(true),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [uniqueIndex('loyalty_rules_code_uidx').on(table.code)]
);

export const affiliateAccounts = pgTable(
  'affiliate_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, {onDelete: 'restrict'}),
    referralCode: text('referral_code').notNull(),
    status: affiliateAccountStatus('status').notNull().default('pending'),
    commissionBps: integer('commission_bps').notNull().default(0),
    fixedCommissionAmount: bigint('fixed_commission_amount', {mode: 'number'}).notNull().default(0),
    payoutCurrencyCode: text('payout_currency_code')
      .notNull()
      .references(() => currencies.code),
    fraudScore: integer('fraud_score').notNull().default(0),
    settings: jsonb('settings').notNull().default({}),
    parentAffiliateId: uuid('parent_affiliate_id'),
    applicationMessage: text('application_message'),
    appliedAt: timestamp('applied_at', {withTimezone: true, mode: 'date'}).notNull().defaultNow(),
    rejectionReason: text('rejection_reason'),
    approvedBy: uuid('approved_by').references(() => profiles.id, {onDelete: 'set null'}),
    approvedAt: timestamp('approved_at', {withTimezone: true, mode: 'date'}),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    uniqueIndex('affiliate_accounts_profile_uidx').on(table.profileId),
    uniqueIndex('affiliate_accounts_referral_uidx').on(table.referralCode),
    foreignKey({columns: [table.parentAffiliateId], foreignColumns: [table.id]})
  ]
);

export const supportTickets = pgTable(
  'support_tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketNumber: text('ticket_number').notNull(),
    profileId: uuid('profile_id').references(() => profiles.id, {onDelete: 'set null'}),
    orderId: uuid('order_id').references(() => orders.id, {onDelete: 'set null'}),
    category: text('category').notNull(),
    subject: text('subject').notNull(),
    description: text('description').notNull(),
    status: supportTicketStatus('status').notNull().default('open'),
    priority: supportTicketPriority('priority').notNull().default('normal'),
    assignedTo: uuid('assigned_to').references(() => profiles.id, {onDelete: 'set null'}),
    slaDueAt: timestamp('sla_due_at', {withTimezone: true, mode: 'date'}),
    resolvedAt: timestamp('resolved_at', {withTimezone: true, mode: 'date'}),
    metadata: jsonb('metadata').notNull().default({}),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [uniqueIndex('support_tickets_number_uidx').on(table.ticketNumber)]
);

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, {onDelete: 'restrict'}),
  orderItemId: uuid('order_item_id')
    .notNull()
    .references(() => orderItems.id, {onDelete: 'restrict'}),
  profileId: uuid('profile_id')
    .notNull()
    .references(() => profiles.id, {onDelete: 'restrict'}),
  rating: integer('rating').notNull(),
  title: text('title'),
  body: text('body'),
  imagePaths: jsonb('image_paths').notNull().default([]),
  status: reviewStatus('status').notNull().default('pending'),
  sellerReply: text('seller_reply'),
  sellerRepliedAt: timestamp('seller_replied_at', {withTimezone: true, mode: 'date'}),
  moderatedBy: uuid('moderated_by').references(() => profiles.id, {onDelete: 'set null'}),
  moderatedAt: timestamp('moderated_at', {withTimezone: true, mode: 'date'}),
  moderationReason: text('moderation_reason'),
  deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
  ...timestamps
});

export const blogPosts = pgTable(
  'blog_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    title: jsonb('title').$type<Record<string, string>>().notNull().default({}),
    excerpt: jsonb('excerpt').$type<Record<string, string>>().notNull().default({}),
    bodyMdx: jsonb('body_mdx').$type<Record<string, string>>().notNull().default({}),
    seo: jsonb('seo').notNull().default({}),
    coverImagePath: text('cover_image_path'),
    status: adminContentStatus('status').notNull().default('draft'),
    authorId: uuid('author_id').references(() => profiles.id, {onDelete: 'set null'}),
    publishAt: timestamp('publish_at', {withTimezone: true, mode: 'date'}),
    publishedAt: timestamp('published_at', {withTimezone: true, mode: 'date'}),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [uniqueIndex('blog_posts_slug_uidx').on(table.slug)]
);

export const contentPages = pgTable(
  'content_pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    pageKind: text('page_kind').notNull().default('standard'),
    title: jsonb('title').$type<Record<string, string>>().notNull().default({}),
    bodyMdx: jsonb('body_mdx').$type<Record<string, string>>().notNull().default({}),
    seo: jsonb('seo').notNull().default({}),
    status: adminContentStatus('status').notNull().default('draft'),
    publishAt: timestamp('publish_at', {withTimezone: true, mode: 'date'}),
    publishedAt: timestamp('published_at', {withTimezone: true, mode: 'date'}),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [uniqueIndex('content_pages_slug_uidx').on(table.slug)]
);

export const homepageBanners = pgTable('homepage_banners', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  content: jsonb('content').notNull().default({}),
  imagePath: text('image_path'),
  mobileImagePath: text('mobile_image_path'),
  linkUrl: text('link_url'),
  startsAt: timestamp('starts_at', {withTimezone: true, mode: 'date'}),
  endsAt: timestamp('ends_at', {withTimezone: true, mode: 'date'}),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
  ...timestamps
});

export const homepageSections = pgTable('homepage_sections', {
  id: uuid('id').primaryKey().defaultRandom(),
  sectionType: homepageSectionType('section_type').notNull(),
  internalName: text('internal_name').notNull(),
  content: jsonb('content').notNull().default({}),
  configuration: jsonb('configuration').notNull().default({}),
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  startsAt: timestamp('starts_at', {withTimezone: true, mode: 'date'}),
  endsAt: timestamp('ends_at', {withTimezone: true, mode: 'date'}),
  deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
  ...timestamps
});

export const notificationTemplates = pgTable(
  'notification_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    templateKey: text('template_key').notNull(),
    channel: text('channel').notNull(),
    localeCode: text('locale_code')
      .notNull()
      .references(() => locales.code),
    subject: text('subject'),
    body: text('body').notNull(),
    variables: jsonb('variables').notNull().default([]),
    active: boolean('active').notNull().default(true),
    version: integer('version').notNull().default(1),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    uniqueIndex('notification_templates_identity_uidx').on(
      table.templateKey,
      table.channel,
      table.localeCode
    )
  ]
);

export const featureFlags = pgTable(
  'feature_flags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    name: jsonb('name').$type<Record<string, string>>().notNull().default({}),
    description: jsonb('description').$type<Record<string, string>>().notNull().default({}),
    enabled: boolean('enabled').notNull().default(false),
    rolloutPercentage: integer('rollout_percentage').notNull().default(0),
    rules: jsonb('rules').notNull().default({}),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [uniqueIndex('feature_flags_key_uidx').on(table.key)]
);

export const platformSettings = pgTable(
  'platform_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    value: jsonb('value').notNull().default({}),
    category: text('category').notNull(),
    isSecret: boolean('is_secret').notNull().default(false),
    description: jsonb('description').$type<Record<string, string>>().notNull().default({}),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [uniqueIndex('platform_settings_key_uidx').on(table.key)]
);

export const exchangeRateHistory = pgTable('exchange_rate_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  currencyCode: text('currency_code')
    .notNull()
    .references(() => currencies.code),
  rateMinor: bigint('rate_minor', {mode: 'number'}).notNull(),
  rateScale: integer('rate_scale').notNull(),
  source: text('source').notNull(),
  manualOverride: boolean('manual_override').notNull().default(false),
  effectiveAt: timestamp('effective_at', {withTimezone: true, mode: 'date'}).notNull().defaultNow(),
  createdBy: uuid('created_by').references(() => profiles.id, {onDelete: 'set null'}),
  ...timestamps
});

export const adminSavedFilters = pgTable(
  'admin_saved_filters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.id, {onDelete: 'cascade'}),
    resource: text('resource').notNull(),
    name: text('name').notNull(),
    filters: jsonb('filters').notNull().default({}),
    sort: jsonb('sort').notNull().default({}),
    isDefault: boolean('is_default').notNull().default(false),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    uniqueIndex('admin_saved_filters_identity_uidx').on(table.ownerId, table.resource, table.name)
  ]
);

export const resellerTiers = pgTable(
  'reseller_tiers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: jsonb('name').$type<Record<string, string>>().notNull(),
    description: jsonb('description').$type<Record<string, string>>().notNull().default({}),
    minimum30dVolume: bigint('minimum_30d_volume', {mode: 'number'}).notNull().default(0),
    thresholdCurrencyCode: text('threshold_currency_code').notNull().default('USD'),
    defaultCreditLimit: bigint('default_credit_limit', {mode: 'number'}).notNull().default(0),
    creditCurrencyCode: text('credit_currency_code').notNull().default('USD'),
    apiRateLimitPerMinute: integer('api_rate_limit_per_minute').notNull().default(60),
    sortOrder: integer('sort_order').notNull().default(0),
    active: boolean('active').notNull().default(true),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    uniqueIndex('reseller_tiers_code_uidx').on(table.code),
    index('reseller_tiers_threshold_currency_idx').on(table.thresholdCurrencyCode),
    index('reseller_tiers_credit_currency_idx').on(table.creditCurrencyCode)
  ]
);

export const resellerAccounts = pgTable(
  'reseller_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id),
    status: resellerAccountStatus('status').notNull().default('pending'),
    currentTierId: uuid('current_tier_id')
      .notNull()
      .references(() => resellerTiers.id),
    manualTierId: uuid('manual_tier_id').references(() => resellerTiers.id),
    manualOverrideReason: text('manual_override_reason'),
    manualOverrideBy: uuid('manual_override_by').references(() => profiles.id),
    manualOverrideAt: timestamp('manual_override_at', {withTimezone: true, mode: 'date'}),
    volume30dAmount: bigint('volume_30d_amount', {mode: 'number'}).notNull().default(0),
    volumeCurrencyCode: text('volume_currency_code').notNull().default('USD'),
    creditLimitOverride: bigint('credit_limit_override', {mode: 'number'}),
    creditCurrencyCode: text('credit_currency_code').notNull().default('USD'),
    lowBalanceThreshold: bigint('low_balance_threshold', {mode: 'number'}).notNull().default(0),
    lastLowBalanceAlertAt: timestamp('last_low_balance_alert_at', {
      withTimezone: true,
      mode: 'date'
    }),
    autoUpgradeEnabled: boolean('auto_upgrade_enabled').notNull().default(true),
    lastEvaluatedAt: timestamp('last_evaluated_at', {withTimezone: true, mode: 'date'}),
    approvedBy: uuid('approved_by').references(() => profiles.id),
    approvedAt: timestamp('approved_at', {withTimezone: true, mode: 'date'}),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    uniqueIndex('reseller_accounts_profile_uidx').on(table.profileId),
    index('reseller_accounts_current_tier_idx').on(table.currentTierId),
    index('reseller_accounts_volume_currency_idx').on(table.volumeCurrencyCode),
    index('reseller_accounts_credit_currency_idx').on(table.creditCurrencyCode)
  ]
);

export const resellerTierEvents = pgTable(
  'reseller_tier_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    resellerAccountId: uuid('reseller_account_id')
      .notNull()
      .references(() => resellerAccounts.id),
    fromTierId: uuid('from_tier_id').references(() => resellerTiers.id),
    toTierId: uuid('to_tier_id')
      .notNull()
      .references(() => resellerTiers.id),
    eventType: text('event_type').notNull(),
    volume30dAmount: bigint('volume_30d_amount', {mode: 'number'}).notNull().default(0),
    currencyCode: text('currency_code').notNull(),
    reason: text('reason'),
    actorId: uuid('actor_id').references(() => profiles.id),
    ...timestamps
  },
  (table) => [
    index('reseller_tier_events_from_tier_idx').on(table.fromTierId),
    index('reseller_tier_events_to_tier_idx').on(table.toTierId),
    index('reseller_tier_events_currency_idx').on(table.currencyCode)
  ]
);

export const resellerApiKeys = pgTable(
  'reseller_api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    resellerAccountId: uuid('reseller_account_id')
      .notNull()
      .references(() => resellerAccounts.id),
    name: text('name').notNull(),
    environment: resellerApiEnvironment('environment').notNull().default('sandbox'),
    keyPrefix: text('key_prefix').notNull(),
    keyHash: text('key_hash').notNull(),
    signingSecretCiphertext: text('signing_secret_ciphertext').notNull(),
    scopes: text('scopes').array().notNull().default([]),
    rateLimitPerMinute: integer('rate_limit_per_minute').notNull().default(60),
    ipAllowlist: inet('ip_allowlist').array().notNull().default([]),
    lastUsedAt: timestamp('last_used_at', {withTimezone: true, mode: 'date'}),
    expiresAt: timestamp('expires_at', {withTimezone: true, mode: 'date'}),
    revokedAt: timestamp('revoked_at', {withTimezone: true, mode: 'date'}),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [uniqueIndex('reseller_api_keys_prefix_uidx').on(table.keyPrefix)]
);

export const resellerApiNonces = pgTable(
  'reseller_api_nonces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    apiKeyId: uuid('api_key_id')
      .notNull()
      .references(() => resellerApiKeys.id),
    nonce: text('nonce').notNull(),
    requestTimestamp: timestamp('request_timestamp', {withTimezone: true, mode: 'date'}).notNull(),
    expiresAt: timestamp('expires_at', {withTimezone: true, mode: 'date'}).notNull(),
    ...timestamps
  },
  (table) => [uniqueIndex('reseller_api_nonces_identity_uidx').on(table.apiKeyId, table.nonce)]
);

export const resellerApiRateWindows = pgTable(
  'reseller_api_rate_windows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    apiKeyId: uuid('api_key_id')
      .notNull()
      .references(() => resellerApiKeys.id),
    windowStartedAt: timestamp('window_started_at', {withTimezone: true, mode: 'date'}).notNull(),
    requestCount: integer('request_count').notNull().default(0),
    ...timestamps
  },
  (table) => [
    uniqueIndex('reseller_api_rate_windows_identity_uidx').on(table.apiKeyId, table.windowStartedAt)
  ]
);

export const resellerApiIdempotency = pgTable(
  'reseller_api_idempotency',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    resellerAccountId: uuid('reseller_account_id')
      .notNull()
      .references(() => resellerAccounts.id),
    scope: text('scope').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestHash: text('request_hash').notNull(),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body'),
    resourceType: text('resource_type'),
    resourceId: uuid('resource_id'),
    expiresAt: timestamp('expires_at', {withTimezone: true, mode: 'date'}).notNull(),
    ...timestamps
  },
  (table) => [
    uniqueIndex('reseller_api_idempotency_identity_uidx').on(
      table.resellerAccountId,
      table.scope,
      table.idempotencyKey
    )
  ]
);

export const resellerSandboxOrders = pgTable(
  'reseller_sandbox_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    resellerAccountId: uuid('reseller_account_id')
      .notNull()
      .references(() => resellerAccounts.id),
    sandboxOrderNumber: text('sandbox_order_number').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    currencyCode: text('currency_code').notNull(),
    totalAmount: bigint('total_amount', {mode: 'number'}).notNull(),
    status: text('status').notNull().default('completed'),
    request: jsonb('request').notNull(),
    response: jsonb('response').notNull().default({}),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [index('reseller_sandbox_orders_currency_idx').on(table.currencyCode)]
);

export const resellerWebhookEndpoints = pgTable('reseller_webhook_endpoints', {
  id: uuid('id').primaryKey().defaultRandom(),
  resellerAccountId: uuid('reseller_account_id')
    .notNull()
    .references(() => resellerAccounts.id),
  url: text('url').notNull(),
  secretCiphertext: text('secret_ciphertext').notNull(),
  events: text('events').array().notNull(),
  active: boolean('active').notNull().default(true),
  description: text('description'),
  failureCount: integer('failure_count').notNull().default(0),
  lastDeliveryAt: timestamp('last_delivery_at', {withTimezone: true, mode: 'date'}),
  disabledAt: timestamp('disabled_at', {withTimezone: true, mode: 'date'}),
  deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
  ...timestamps
});

export const resellerWebhookDeliveries = pgTable(
  'reseller_webhook_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    endpointId: uuid('endpoint_id')
      .notNull()
      .references(() => resellerWebhookEndpoints.id),
    eventId: uuid('event_id').notNull(),
    eventType: text('event_type').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: uuid('aggregate_id'),
    payload: jsonb('payload').notNull(),
    status: resellerWebhookDeliveryStatus('status').notNull().default('pending'),
    signature: text('signature'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(8),
    nextAttemptAt: timestamp('next_attempt_at', {withTimezone: true, mode: 'date'})
      .notNull()
      .defaultNow(),
    lockedAt: timestamp('locked_at', {withTimezone: true, mode: 'date'}),
    lockedBy: text('locked_by'),
    responseStatus: integer('response_status'),
    responseBodySafe: text('response_body_safe'),
    lastErrorCode: text('last_error_code'),
    deliveredAt: timestamp('delivered_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    uniqueIndex('reseller_webhook_deliveries_event_endpoint_uidx').on(
      table.endpointId,
      table.eventId
    )
  ]
);

export const resellerApiRequestLogs = pgTable(
  'reseller_api_request_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    apiKeyId: uuid('api_key_id').references(() => resellerApiKeys.id),
    resellerAccountId: uuid('reseller_account_id').references(() => resellerAccounts.id),
    requestId: text('request_id').notNull(),
    method: text('method').notNull(),
    path: text('path').notNull(),
    scope: text('scope'),
    statusCode: integer('status_code').notNull(),
    durationMs: integer('duration_ms').notNull(),
    ipHash: text('ip_hash'),
    errorCode: text('error_code'),
    ...timestamps
  },
  (table) => [index('reseller_api_request_logs_api_key_idx').on(table.apiKeyId)]
);

export const referralAttributionModel = pgEnum('referral_attribution_model', [
  'first_touch',
  'last_touch'
]);
export const referralFraudStatus = pgEnum('referral_fraud_status', ['clear', 'review', 'blocked']);
export const affiliateCommissionKind = pgEnum('affiliate_commission_kind', ['percent', 'fixed']);
export const affiliateCommissionStatus = pgEnum('affiliate_commission_status', [
  'pending',
  'available',
  'held_review',
  'paid',
  'reversed'
]);
export const affiliatePayoutStatus = pgEnum('affiliate_payout_status', [
  'requested',
  'reviewing',
  'approved',
  'processing',
  'paid',
  'rejected',
  'cancelled'
]);
export const loyaltyEntryKind = pgEnum('loyalty_entry_kind', [
  'purchase',
  'referral_bonus',
  'review_bonus',
  'streak_bonus',
  'badge_bonus',
  'seasonal_bonus',
  'wallet_redemption',
  'discount_redemption',
  'expiry',
  'refund_reversal',
  'admin_adjustment'
]);
export const loyaltyRedemptionKind = pgEnum('loyalty_redemption_kind', [
  'wallet_credit',
  'discount'
]);

export const growthSettings = pgTable(
  'growth_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
    description: jsonb('description').$type<Record<string, string>>().notNull().default({}),
    updatedBy: uuid('updated_by').references(() => profiles.id, {onDelete: 'set null'}),
    ...timestamps
  },
  (table) => [uniqueIndex('growth_settings_key_uidx').on(table.key)]
);

export const affiliateLinks = pgTable(
  'affiliate_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    affiliateAccountId: uuid('affiliate_account_id')
      .notNull()
      .references(() => affiliateAccounts.id, {onDelete: 'cascade'}),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    destinationPath: text('destination_path').notNull().default('/'),
    campaign: text('campaign'),
    active: boolean('active').notNull().default(true),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    uniqueIndex('affiliate_links_slug_uidx').on(table.slug),
    index('affiliate_links_account_idx').on(table.affiliateAccountId)
  ]
);

export const referralClicks = pgTable(
  'referral_clicks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    affiliateAccountId: uuid('affiliate_account_id')
      .notNull()
      .references(() => affiliateAccounts.id, {onDelete: 'restrict'}),
    affiliateLinkId: uuid('affiliate_link_id').references(() => affiliateLinks.id, {
      onDelete: 'set null'
    }),
    visitorTokenHash: text('visitor_token_hash').notNull(),
    deviceHash: text('device_hash'),
    ipHash: text('ip_hash'),
    userAgentHash: text('user_agent_hash'),
    landingPath: text('landing_path').notNull().default('/'),
    utm: jsonb('utm').notNull().default({}),
    occurredAt: timestamp('occurred_at', {withTimezone: true, mode: 'date'}).notNull().defaultNow(),
    ...timestamps
  },
  (table) => [
    index('referral_clicks_affiliate_time_idx').on(table.affiliateAccountId, table.occurredAt),
    index('referral_clicks_device_time_idx').on(table.deviceHash, table.occurredAt)
  ]
);

export const referralAttributions = pgTable(
  'referral_attributions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    referredProfileId: uuid('referred_profile_id')
      .notNull()
      .references(() => profiles.id, {onDelete: 'restrict'}),
    affiliateAccountId: uuid('affiliate_account_id')
      .notNull()
      .references(() => affiliateAccounts.id, {onDelete: 'restrict'}),
    affiliateLinkId: uuid('affiliate_link_id').references(() => affiliateLinks.id, {
      onDelete: 'set null'
    }),
    parentAffiliateAccountId: uuid('parent_affiliate_account_id').references(
      () => affiliateAccounts.id,
      {onDelete: 'set null'}
    ),
    clickId: uuid('click_id')
      .notNull()
      .references(() => referralClicks.id, {onDelete: 'restrict'}),
    attributionModel: referralAttributionModel('attribution_model').notNull(),
    fraudStatus: referralFraudStatus('fraud_status').notNull().default('clear'),
    fraudScore: integer('fraud_score').notNull().default(0),
    attributedAt: timestamp('attributed_at', {withTimezone: true, mode: 'date'})
      .notNull()
      .defaultNow(),
    ...timestamps
  },
  (table) => [
    uniqueIndex('referral_attributions_profile_uidx').on(table.referredProfileId),
    index('referral_attributions_affiliate_idx').on(table.affiliateAccountId, table.attributedAt)
  ]
);

export const affiliateCommissionRules = pgTable(
  'affiliate_commission_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: jsonb('name').$type<Record<string, string>>().notNull().default({}),
    categoryId: uuid('category_id').references(() => categories.id, {onDelete: 'cascade'}),
    productId: uuid('product_id').references(() => products.id, {onDelete: 'cascade'}),
    level: smallint('level').notNull().default(1),
    commissionKind: affiliateCommissionKind('commission_kind').notNull(),
    valueAmount: bigint('value_amount', {mode: 'number'}).notNull(),
    currencyCode: text('currency_code').references(() => currencies.code),
    holdingDays: integer('holding_days'),
    priority: integer('priority').notNull().default(0),
    startsAt: timestamp('starts_at', {withTimezone: true, mode: 'date'}),
    endsAt: timestamp('ends_at', {withTimezone: true, mode: 'date'}),
    active: boolean('active').notNull().default(true),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    index('affiliate_rules_lookup_idx').on(
      table.level,
      table.productId,
      table.categoryId,
      table.priority
    )
  ]
);

export const affiliateCommissions = pgTable(
  'affiliate_commissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    affiliateAccountId: uuid('affiliate_account_id')
      .notNull()
      .references(() => affiliateAccounts.id, {onDelete: 'restrict'}),
    referredProfileId: uuid('referred_profile_id')
      .notNull()
      .references(() => profiles.id, {onDelete: 'restrict'}),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, {onDelete: 'restrict'}),
    orderItemId: uuid('order_item_id')
      .notNull()
      .references(() => orderItems.id, {onDelete: 'restrict'}),
    ruleId: uuid('rule_id').references(() => affiliateCommissionRules.id, {onDelete: 'set null'}),
    level: smallint('level').notNull(),
    basisAmount: bigint('basis_amount', {mode: 'number'}).notNull(),
    amount: bigint('amount', {mode: 'number'}).notNull(),
    currencyCode: text('currency_code')
      .notNull()
      .references(() => currencies.code),
    status: affiliateCommissionStatus('status').notNull().default('pending'),
    availableAt: timestamp('available_at', {withTimezone: true, mode: 'date'}).notNull(),
    paidAt: timestamp('paid_at', {withTimezone: true, mode: 'date'}),
    reversedAt: timestamp('reversed_at', {withTimezone: true, mode: 'date'}),
    payoutRequestId: uuid('payout_request_id'),
    fraudSnapshot: jsonb('fraud_snapshot').notNull().default({}),
    ...timestamps
  },
  (table) => [
    uniqueIndex('affiliate_commissions_item_account_level_uidx').on(
      table.orderItemId,
      table.affiliateAccountId,
      table.level
    ),
    index('affiliate_commissions_account_status_idx').on(
      table.affiliateAccountId,
      table.status,
      table.availableAt
    )
  ]
);

export const affiliateCommissionEvents = pgTable(
  'affiliate_commission_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    commissionId: uuid('commission_id')
      .notNull()
      .references(() => affiliateCommissions.id, {onDelete: 'restrict'}),
    fromStatus: affiliateCommissionStatus('from_status'),
    toStatus: affiliateCommissionStatus('to_status').notNull(),
    amount: bigint('amount', {mode: 'number'}).notNull(),
    currencyCode: text('currency_code')
      .notNull()
      .references(() => currencies.code),
    reason: text('reason'),
    actorId: uuid('actor_id').references(() => profiles.id, {onDelete: 'set null'}),
    metadata: jsonb('metadata').notNull().default({}),
    ...timestamps
  },
  (table) => [
    index('affiliate_commission_events_commission_idx').on(table.commissionId, table.createdAt)
  ]
);

export const affiliatePayoutRequests = pgTable(
  'affiliate_payout_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    affiliateAccountId: uuid('affiliate_account_id')
      .notNull()
      .references(() => affiliateAccounts.id, {onDelete: 'restrict'}),
    destinationKind: text('destination_kind').notNull(),
    amount: bigint('amount', {mode: 'number'}).notNull(),
    currencyCode: text('currency_code')
      .notNull()
      .references(() => currencies.code),
    status: affiliatePayoutStatus('status').notNull().default('requested'),
    destination: jsonb('destination').notNull().default({}),
    reviewReason: text('review_reason'),
    reviewedBy: uuid('reviewed_by').references(() => profiles.id, {onDelete: 'set null'}),
    reviewedAt: timestamp('reviewed_at', {withTimezone: true, mode: 'date'}),
    walletTransactionId: uuid('wallet_transaction_id').references(() => walletTransactions.id, {
      onDelete: 'restrict'
    }),
    paidAt: timestamp('paid_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    index('affiliate_payouts_account_idx').on(
      table.affiliateAccountId,
      table.status,
      table.createdAt
    )
  ]
);

export const affiliatePayoutAllocations = pgTable(
  'affiliate_payout_allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    payoutRequestId: uuid('payout_request_id')
      .notNull()
      .references(() => affiliatePayoutRequests.id, {onDelete: 'restrict'}),
    commissionId: uuid('commission_id')
      .notNull()
      .references(() => affiliateCommissions.id, {onDelete: 'restrict'}),
    amount: bigint('amount', {mode: 'number'}).notNull(),
    ...timestamps
  },
  (table) => [
    uniqueIndex('affiliate_payout_allocations_pair_uidx').on(
      table.payoutRequestId,
      table.commissionId
    )
  ]
);

export const affiliateMarketingAssets = pgTable('affiliate_marketing_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: jsonb('name').$type<Record<string, string>>().notNull().default({}),
  description: jsonb('description').$type<Record<string, string>>().notNull().default({}),
  assetKind: text('asset_kind').notNull(),
  localeCode: text('locale_code').references(() => locales.code),
  storagePath: text('storage_path'),
  externalUrl: text('external_url'),
  copyText: jsonb('copy_text').$type<Record<string, string>>().notNull().default({}),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
  ...timestamps
});

export const referralFraudSignals = pgTable(
  'referral_fraud_signals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    attributionId: uuid('attribution_id').references(() => referralAttributions.id, {
      onDelete: 'cascade'
    }),
    affiliateAccountId: uuid('affiliate_account_id')
      .notNull()
      .references(() => affiliateAccounts.id, {onDelete: 'restrict'}),
    signalKind: text('signal_kind').notNull(),
    severity: text('severity').notNull(),
    score: integer('score').notNull(),
    evidence: jsonb('evidence').notNull().default({}),
    status: text('status').notNull().default('open'),
    reviewedBy: uuid('reviewed_by').references(() => profiles.id, {onDelete: 'set null'}),
    reviewedAt: timestamp('reviewed_at', {withTimezone: true, mode: 'date'}),
    reviewReason: text('review_reason'),
    ...timestamps
  },
  (table) => [index('referral_fraud_queue_idx').on(table.status, table.severity, table.createdAt)]
);

export const loyaltyAccounts = pgTable(
  'loyalty_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, {onDelete: 'cascade'}),
    cachedPoints: bigint('cached_points', {mode: 'number'}).notNull().default(0),
    lifetimeEarned: bigint('lifetime_earned', {mode: 'number'}).notNull().default(0),
    currentTierId: uuid('current_tier_id').references(() => customerTiers.id, {
      onDelete: 'set null'
    }),
    streakDays: integer('streak_days').notNull().default(0),
    lastActivityDate: date('last_activity_date'),
    nextExpiryAt: timestamp('next_expiry_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [uniqueIndex('loyalty_accounts_profile_uidx').on(table.profileId)]
);

export const loyaltyPointEntries = pgTable(
  'loyalty_point_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    loyaltyAccountId: uuid('loyalty_account_id')
      .notNull()
      .references(() => loyaltyAccounts.id, {onDelete: 'restrict'}),
    entryKind: loyaltyEntryKind('entry_kind').notNull(),
    points: bigint('points', {mode: 'number'}).notNull(),
    sourceType: text('source_type').notNull(),
    sourceId: uuid('source_id'),
    idempotencyKey: text('idempotency_key').notNull(),
    availableAt: timestamp('available_at', {withTimezone: true, mode: 'date'})
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', {withTimezone: true, mode: 'date'}),
    metadata: jsonb('metadata').notNull().default({}),
    ...timestamps
  },
  (table) => [
    uniqueIndex('loyalty_entries_idempotency_uidx').on(table.idempotencyKey),
    index('loyalty_entries_account_time_idx').on(table.loyaltyAccountId, table.createdAt)
  ]
);

export const loyaltyRedemptions = pgTable(
  'loyalty_redemptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, {onDelete: 'restrict'}),
    kind: loyaltyRedemptionKind('kind').notNull(),
    pointsSpent: bigint('points_spent', {mode: 'number'}).notNull(),
    amountMinor: bigint('amount_minor', {mode: 'number'}),
    currencyCode: text('currency_code').references(() => currencies.code),
    discountBps: integer('discount_bps'),
    discountExpiresAt: timestamp('discount_expires_at', {withTimezone: true, mode: 'date'}),
    usedOrderId: uuid('used_order_id').references(() => orders.id, {onDelete: 'set null'}),
    walletTransactionId: uuid('wallet_transaction_id').references(() => walletTransactions.id, {
      onDelete: 'restrict'
    }),
    idempotencyKey: text('idempotency_key').notNull(),
    status: text('status').notNull().default('active'),
    ...timestamps
  },
  (table) => [
    uniqueIndex('loyalty_redemptions_idempotency_uidx').on(table.idempotencyKey),
    index('loyalty_redemptions_profile_idx').on(table.profileId, table.status, table.createdAt)
  ]
);

export const loyaltyBadges = pgTable(
  'loyalty_badges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: jsonb('name').$type<Record<string, string>>().notNull().default({}),
    description: jsonb('description').$type<Record<string, string>>().notNull().default({}),
    iconName: text('icon_name').notNull(),
    criteria: jsonb('criteria').notNull().default({}),
    rewardPoints: bigint('reward_points', {mode: 'number'}).notNull().default(0),
    active: boolean('active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [uniqueIndex('loyalty_badges_code_uidx').on(table.code)]
);

export const loyaltyBadgeAwards = pgTable(
  'loyalty_badge_awards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, {onDelete: 'cascade'}),
    badgeId: uuid('badge_id')
      .notNull()
      .references(() => loyaltyBadges.id, {onDelete: 'restrict'}),
    pointsEntryId: uuid('points_entry_id').references(() => loyaltyPointEntries.id, {
      onDelete: 'restrict'
    }),
    awardedAt: timestamp('awarded_at', {withTimezone: true, mode: 'date'}).notNull().defaultNow(),
    ...timestamps
  },
  (table) => [
    uniqueIndex('loyalty_badge_awards_profile_badge_uidx').on(table.profileId, table.badgeId)
  ]
);

export const loyaltyStreakEvents = pgTable(
  'loyalty_streak_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, {onDelete: 'cascade'}),
    activityDate: date('activity_date').notNull(),
    streakDays: integer('streak_days').notNull(),
    orderId: uuid('order_id').references(() => orders.id, {onDelete: 'set null'}),
    ...timestamps
  },
  (table) => [
    uniqueIndex('loyalty_streak_profile_date_uidx').on(table.profileId, table.activityDate)
  ]
);

export const vipTierEvents = pgTable(
  'vip_tier_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, {onDelete: 'cascade'}),
    fromTierId: uuid('from_tier_id').references(() => customerTiers.id, {onDelete: 'set null'}),
    toTierId: uuid('to_tier_id').references(() => customerTiers.id, {onDelete: 'set null'}),
    lifetimeSpend: bigint('lifetime_spend', {mode: 'number'}).notNull().default(0),
    currencyCode: text('currency_code')
      .notNull()
      .default('USD')
      .references(() => currencies.code),
    reason: text('reason').notNull(),
    ...timestamps
  },
  (table) => [index('vip_tier_events_profile_idx').on(table.profileId, table.createdAt)]
);

export const notificationSettings = pgTable(
  'notification_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, {onDelete: 'cascade'}),
    timezone: text('timezone').notNull().default('UTC'),
    quietHoursEnabled: boolean('quiet_hours_enabled').notNull().default(false),
    quietStart: time('quiet_start'),
    quietEnd: time('quiet_end'),
    quietDays: smallint('quiet_days').array().notNull().default([]),
    whatsappOptedInAt: timestamp('whatsapp_opted_in_at', {withTimezone: true, mode: 'date'}),
    whatsappVerifiedAt: timestamp('whatsapp_verified_at', {withTimezone: true, mode: 'date'}),
    globalUnsubscribedAt: timestamp('global_unsubscribed_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [uniqueIndex('notification_settings_profile_uidx').on(table.profileId)]
);
export const notificationEventPreferences = pgTable(
  'notification_event_preferences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, {onDelete: 'cascade'}),
    eventKey: text('event_key').notNull(),
    channel: text('channel').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    ...timestamps
  },
  (table) => [
    uniqueIndex('notification_event_preferences_identity_uidx').on(
      table.profileId,
      table.eventKey,
      table.channel
    ),
    index('notification_event_preferences_profile_idx').on(table.profileId, table.eventKey)
  ]
);
export const notificationChannelConnections = pgTable(
  'notification_channel_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, {onDelete: 'cascade'}),
    channel: text('channel').notNull(),
    status: notificationConnectionStatus('status').notNull().default('pending'),
    externalIdCiphertext: text('external_id_ciphertext'),
    externalIdHash: text('external_id_hash'),
    displayHint: text('display_hint'),
    verifiedAt: timestamp('verified_at', {withTimezone: true, mode: 'date'}),
    revokedAt: timestamp('revoked_at', {withTimezone: true, mode: 'date'}),
    metadata: jsonb('metadata').notNull().default({}),
    ...timestamps
  },
  (table) => [
    uniqueIndex('notification_connections_profile_channel_uidx').on(table.profileId, table.channel),
    index('notification_connections_status_idx').on(table.channel, table.status)
  ]
);
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, {onDelete: 'cascade'}),
    endpoint: text('endpoint').notNull(),
    endpointHash: text('endpoint_hash').notNull(),
    p256dh: text('p256dh').notNull(),
    authSecret: text('auth_secret').notNull(),
    userAgent: text('user_agent'),
    lastUsedAt: timestamp('last_used_at', {withTimezone: true, mode: 'date'}),
    revokedAt: timestamp('revoked_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    uniqueIndex('push_subscriptions_endpoint_uidx').on(table.endpointHash),
    index('push_subscriptions_profile_active_idx').on(table.profileId, table.revokedAt)
  ]
);
export const notificationEventsTable = pgTable(
  'notification_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, {onDelete: 'cascade'}),
    eventKey: text('event_key').notNull(),
    localeCode: text('locale_code')
      .notNull()
      .references(() => locales.code),
    data: jsonb('data').notNull().default({}),
    idempotencyKey: text('idempotency_key').notNull(),
    sourceType: text('source_type'),
    sourceId: uuid('source_id'),
    availableAt: timestamp('available_at', {withTimezone: true, mode: 'date'})
      .notNull()
      .defaultNow(),
    processedAt: timestamp('processed_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    uniqueIndex('notification_events_profile_idempotency_uidx').on(
      table.profileId,
      table.idempotencyKey
    ),
    index('notification_events_profile_idx').on(table.profileId, table.createdAt)
  ]
);
export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => notificationEventsTable.id, {onDelete: 'cascade'}),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, {onDelete: 'cascade'}),
    channel: text('channel').notNull(),
    status: notificationDeliveryStatus('status').notNull().default('queued'),
    providerMessageId: text('provider_message_id'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    nextAttemptAt: timestamp('next_attempt_at', {withTimezone: true, mode: 'date'})
      .notNull()
      .defaultNow(),
    sentAt: timestamp('sent_at', {withTimezone: true, mode: 'date'}),
    deliveredAt: timestamp('delivered_at', {withTimezone: true, mode: 'date'}),
    failedAt: timestamp('failed_at', {withTimezone: true, mode: 'date'}),
    lastError: text('last_error'),
    metadata: jsonb('metadata').notNull().default({}),
    ...timestamps
  },
  (table) => [
    uniqueIndex('notification_deliveries_event_channel_uidx').on(table.eventId, table.channel),
    index('notification_deliveries_profile_idx').on(table.profileId, table.createdAt)
  ]
);
export const inAppNotifications = pgTable(
  'in_app_notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deliveryId: uuid('delivery_id')
      .notNull()
      .references(() => notificationDeliveries.id, {onDelete: 'cascade'}),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, {onDelete: 'cascade'}),
    eventKey: text('event_key').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    actionUrl: text('action_url'),
    data: jsonb('data').notNull().default({}),
    readAt: timestamp('read_at', {withTimezone: true, mode: 'date'}),
    archivedAt: timestamp('archived_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    uniqueIndex('in_app_notifications_delivery_uidx').on(table.deliveryId),
    index('in_app_notifications_profile_idx').on(table.profileId, table.createdAt)
  ]
);
export const supportTicketCategories = pgTable(
  'support_ticket_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: jsonb('name').$type<Record<string, string>>().notNull().default({}),
    description: jsonb('description').$type<Record<string, string>>().notNull().default({}),
    defaultPriority: supportTicketPriority('default_priority').notNull().default('normal'),
    firstResponseMinutes: integer('first_response_minutes').notNull().default(240),
    resolutionMinutes: integer('resolution_minutes').notNull().default(1440),
    active: boolean('active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [uniqueIndex('support_ticket_categories_code_uidx').on(table.code)]
);
export const supportTicketMessages = pgTable(
  'support_ticket_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => supportTickets.id, {onDelete: 'cascade'}),
    authorId: uuid('author_id').references(() => profiles.id, {onDelete: 'set null'}),
    authorType: text('author_type').notNull(),
    kind: supportMessageKind('kind').notNull().default('message'),
    body: text('body').notNull(),
    metadata: jsonb('metadata').notNull().default({}),
    editedAt: timestamp('edited_at', {withTimezone: true, mode: 'date'}),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [index('support_ticket_messages_ticket_idx').on(table.ticketId, table.createdAt)]
);
export const knowledgeCategories = pgTable(
  'knowledge_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parentId: uuid('parent_id'),
    slug: text('slug').notNull(),
    name: jsonb('name').$type<Record<string, string>>().notNull().default({}),
    description: jsonb('description').$type<Record<string, string>>().notNull().default({}),
    sortOrder: integer('sort_order').notNull().default(0),
    active: boolean('active').notNull().default(true),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    uniqueIndex('knowledge_categories_slug_uidx').on(table.slug),
    foreignKey({columns: [table.parentId], foreignColumns: [table.id]})
  ]
);
export const knowledgeArticles = pgTable(
  'knowledge_articles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    categoryId: uuid('category_id').references(() => knowledgeCategories.id, {
      onDelete: 'set null'
    }),
    slug: text('slug').notNull(),
    title: jsonb('title').$type<Record<string, string>>().notNull().default({}),
    excerpt: jsonb('excerpt').$type<Record<string, string>>().notNull().default({}),
    body: jsonb('body').$type<Record<string, string>>().notNull().default({}),
    seo: jsonb('seo').notNull().default({}),
    status: knowledgeStatus('status').notNull().default('draft'),
    authorId: uuid('author_id').references(() => profiles.id, {onDelete: 'set null'}),
    publishedAt: timestamp('published_at', {withTimezone: true, mode: 'date'}),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    uniqueIndex('knowledge_articles_slug_uidx').on(table.slug),
    index('knowledge_articles_category_idx').on(table.categoryId)
  ]
);
export const reviewReplies = pgTable(
  'review_replies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, {onDelete: 'cascade'}),
    authorId: uuid('author_id').references(() => profiles.id, {onDelete: 'set null'}),
    body: text('body').notNull(),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [index('review_replies_review_idx').on(table.reviewId, table.createdAt)]
);
export const productReviewAggregates = pgTable(
  'product_review_aggregates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, {onDelete: 'cascade'}),
    reviewCount: bigint('review_count', {mode: 'number'}).notNull().default(0),
    ratingSum: bigint('rating_sum', {mode: 'number'}).notNull().default(0),
    averageRating: numeric('average_rating', {precision: 3, scale: 2}).notNull().default('0'),
    ratingDistribution: jsonb('rating_distribution').notNull().default({}),
    ...timestamps
  },
  (table) => [uniqueIndex('product_review_aggregates_product_uidx').on(table.productId)]
);

export const aiDocuments = pgTable(
  'ai_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceType: text('source_type').notNull(),
    sourceId: uuid('source_id').notNull(),
    localeCode: text('locale_code')
      .notNull()
      .references(() => locales.code),
    title: text('title').notNull(),
    content: text('content').notNull(),
    sourceUrl: text('source_url').notNull(),
    contentHash: text('content_hash').notNull(),
    embedding: vector1536('embedding'),
    metadata: jsonb('metadata').notNull().default({}),
    embeddedAt: timestamp('embedded_at', {withTimezone: true, mode: 'date'}),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    index('ai_documents_source_idx').on(table.sourceType, table.sourceId),
    index('ai_documents_locale_idx').on(table.localeCode, table.updatedAt)
  ]
);

export const aiJobs = pgTable(
  'ai_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: uuid('aggregate_id'),
    payload: jsonb('payload').notNull().default({}),
    status: text('status').notNull().default('pending'),
    priority: integer('priority').notNull().default(100),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    runAt: timestamp('run_at', {withTimezone: true, mode: 'date'}).notNull().defaultNow(),
    lockedBy: text('locked_by'),
    lockedUntil: timestamp('locked_until', {withTimezone: true, mode: 'date'}),
    idempotencyKey: text('idempotency_key').notNull(),
    result: jsonb('result').notNull().default({}),
    lastError: text('last_error'),
    completedAt: timestamp('completed_at', {withTimezone: true, mode: 'date'}),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    uniqueIndex('ai_jobs_idempotency_uidx').on(table.kind, table.idempotencyKey),
    index('ai_jobs_due_idx').on(table.priority, table.runAt, table.createdAt)
  ]
);

export const aiConversations = pgTable(
  'ai_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, {onDelete: 'cascade'}),
    localeCode: text('locale_code')
      .notNull()
      .references(() => locales.code),
    title: text('title'),
    status: text('status').notNull().default('open'),
    escalatedTicketId: uuid('escalated_ticket_id').references(() => supportTickets.id, {
      onDelete: 'set null'
    }),
    lastMessageAt: timestamp('last_message_at', {withTimezone: true, mode: 'date'})
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [index('ai_conversations_profile_idx').on(table.profileId, table.lastMessageAt)]
);

export const aiMessages = pgTable(
  'ai_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => aiConversations.id, {onDelete: 'cascade'}),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, {onDelete: 'cascade'}),
    role: text('role').notNull(),
    content: text('content').notNull(),
    citations: jsonb('citations').notNull().default([]),
    safetyFlags: text('safety_flags').array().notNull().default([]),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costMinor: integer('cost_minor').notNull().default(0),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    index('ai_messages_conversation_idx').on(table.conversationId, table.createdAt),
    index('ai_messages_profile_idx').on(table.profileId, table.createdAt)
  ]
);

export const aiUsageLogs = pgTable(
  'ai_usage_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id').references(() => profiles.id, {onDelete: 'set null'}),
    feature: text('feature').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    requestHash: text('request_hash').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costMinor: integer('cost_minor').notNull().default(0),
    latencyMs: integer('latency_ms').notNull().default(0),
    cacheHit: boolean('cache_hit').notNull().default(false),
    status: text('status').notNull(),
    errorCode: text('error_code'),
    metadata: jsonb('metadata').notNull().default({}),
    ...timestamps
  },
  (table) => [
    index('ai_usage_profile_window_idx').on(table.profileId, table.feature, table.createdAt),
    index('ai_usage_cost_idx').on(table.createdAt, table.costMinor)
  ]
);

export const aiCache = pgTable(
  'ai_cache',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cacheKey: text('cache_key').notNull().unique(),
    feature: text('feature').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    response: jsonb('response').notNull(),
    expiresAt: timestamp('expires_at', {withTimezone: true, mode: 'date'}).notNull(),
    ...timestamps
  },
  (table) => [index('ai_cache_expiry_idx').on(table.expiresAt)]
);

export const productRecommendationEdges = pgTable(
  'product_recommendation_edges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceProductId: uuid('source_product_id')
      .notNull()
      .references(() => products.id, {onDelete: 'cascade'}),
    recommendedProductId: uuid('recommended_product_id')
      .notNull()
      .references(() => products.id, {onDelete: 'cascade'}),
    scoreBps: integer('score_bps').notNull(),
    collaborativeScoreBps: integer('collaborative_score_bps').notNull().default(0),
    contentScoreBps: integer('content_score_bps').notNull().default(0),
    reasonCode: text('reason_code').notNull(),
    generatedAt: timestamp('generated_at', {withTimezone: true, mode: 'date'})
      .notNull()
      .defaultNow(),
    ...timestamps
  },
  (table) => [
    uniqueIndex('product_recommendation_edges_uidx').on(
      table.sourceProductId,
      table.recommendedProductId
    ),
    index('product_recommendation_edges_rank_idx').on(table.sourceProductId, table.scoreBps)
  ]
);

export const profileRecommendations = pgTable(
  'profile_recommendations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, {onDelete: 'cascade'}),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, {onDelete: 'cascade'}),
    scoreBps: integer('score_bps').notNull(),
    reasonCode: text('reason_code').notNull(),
    generatedAt: timestamp('generated_at', {withTimezone: true, mode: 'date'})
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', {withTimezone: true, mode: 'date'}).notNull(),
    ...timestamps
  },
  (table) => [
    uniqueIndex('profile_recommendations_uidx').on(table.profileId, table.productId),
    index('profile_recommendations_rank_idx').on(table.profileId, table.scoreBps, table.expiresAt)
  ]
);

export const aiRiskAssessments = pgTable(
  'ai_risk_assessments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectType: text('subject_type').notNull(),
    subjectId: uuid('subject_id').notNull(),
    profileId: uuid('profile_id').references(() => profiles.id, {onDelete: 'set null'}),
    score: integer('score').notNull(),
    decision: text('decision').notNull(),
    status: text('status').notNull().default('pending'),
    rulesVersion: text('rules_version').notNull(),
    features: jsonb('features').notNull().default({}),
    explanations: jsonb('explanations').notNull().default([]),
    reviewedBy: uuid('reviewed_by').references(() => profiles.id, {onDelete: 'set null'}),
    reviewReason: text('review_reason'),
    reviewedAt: timestamp('reviewed_at', {withTimezone: true, mode: 'date'}),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    index('ai_risk_review_idx').on(table.decision, table.status, table.score, table.createdAt),
    index('ai_risk_subject_idx').on(table.subjectType, table.subjectId, table.createdAt)
  ]
);

export const aiGlossaryTerms = pgTable(
  'ai_glossary_terms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceLocaleCode: text('source_locale_code')
      .notNull()
      .references(() => locales.code),
    sourceTerm: text('source_term').notNull(),
    translations: jsonb('translations').notNull().default({}),
    doNotTranslate: boolean('do_not_translate').notNull().default(false),
    caseSensitive: boolean('case_sensitive').notNull().default(false),
    active: boolean('active').notNull().default(true),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [uniqueIndex('ai_glossary_term_uidx').on(table.sourceLocaleCode, table.sourceTerm)]
);

export const aiTranslationJobs = pgTable(
  'ai_translation_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    sourceLocaleCode: text('source_locale_code')
      .notNull()
      .references(() => locales.code),
    targetLocaleCode: text('target_locale_code')
      .notNull()
      .references(() => locales.code),
    sourceContent: jsonb('source_content').notNull(),
    proposedContent: jsonb('proposed_content').notNull().default({}),
    glossarySnapshot: jsonb('glossary_snapshot').notNull().default([]),
    status: text('status').notNull().default('pending'),
    requestedBy: uuid('requested_by').references(() => profiles.id, {onDelete: 'set null'}),
    reviewedBy: uuid('reviewed_by').references(() => profiles.id, {onDelete: 'set null'}),
    reviewReason: text('review_reason'),
    reviewedAt: timestamp('reviewed_at', {withTimezone: true, mode: 'date'}),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [
    index('ai_translation_review_idx').on(table.status, table.targetLocaleCode, table.createdAt)
  ]
);

export const aiInsights = pgTable(
  'ai_insights',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    severity: text('severity').notNull().default('info'),
    metricKey: text('metric_key'),
    title: jsonb('title').notNull().default({}),
    body: jsonb('body').notNull().default({}),
    evidence: jsonb('evidence').notNull().default({}),
    status: text('status').notNull().default('active'),
    generatedAt: timestamp('generated_at', {withTimezone: true, mode: 'date'})
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', {withTimezone: true, mode: 'date'}),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [index('ai_insights_active_idx').on(table.status, table.severity, table.generatedAt)]
);

export const privacyConsents = pgTable(
  'privacy_consents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id').references(() => profiles.id, {onDelete: 'cascade'}),
    anonymousIdHash: text('anonymous_id_hash'),
    policyVersion: text('policy_version').notNull(),
    necessary: boolean('necessary').notNull().default(true),
    analytics: boolean('analytics').notNull().default(false),
    marketing: boolean('marketing').notNull().default(false),
    source: text('source').notNull().default('web'),
    ipHash: text('ip_hash'),
    userAgentHash: text('user_agent_hash'),
    withdrawnAt: timestamp('withdrawn_at', {withTimezone: true, mode: 'date'}),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [index('privacy_consents_profile_created_idx').on(table.profileId, table.createdAt)]
);

export const dataExportRequests = pgTable(
  'data_export_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, {onDelete: 'cascade'}),
    status: text('status').notNull().default('pending'),
    storagePath: text('storage_path'),
    requestedAt: timestamp('requested_at', {withTimezone: true, mode: 'date'})
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', {withTimezone: true, mode: 'date'}),
    expiresAt: timestamp('expires_at', {withTimezone: true, mode: 'date'}),
    failureCode: text('failure_code'),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [index('data_export_requests_profile_status_idx').on(table.profileId, table.status)]
);

export const accountDeletionRequests = pgTable(
  'account_deletion_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, {onDelete: 'cascade'}),
    status: text('status').notNull().default('pending'),
    reason: text('reason'),
    scheduledFor: timestamp('scheduled_for', {withTimezone: true, mode: 'date'}).notNull(),
    processedAt: timestamp('processed_at', {withTimezone: true, mode: 'date'}),
    blockedReason: text('blocked_reason'),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [index('account_deletion_requests_schedule_idx').on(table.status, table.scheduledFor)]
);

export const retentionRuns = pgTable(
  'retention_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    status: text('status').notNull(),
    startedAt: timestamp('started_at', {withTimezone: true, mode: 'date'}).notNull().defaultNow(),
    completedAt: timestamp('completed_at', {withTimezone: true, mode: 'date'}),
    deletedCounts: jsonb('deleted_counts').notNull().default({}),
    errorCode: text('error_code'),
    deletedAt: timestamp('deleted_at', {withTimezone: true, mode: 'date'}),
    ...timestamps
  },
  (table) => [index('retention_runs_started_idx').on(table.startedAt)]
);
