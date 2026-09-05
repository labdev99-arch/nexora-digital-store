import 'server-only';

import type {AuthContext} from '@/features/auth/server/authorization';
import {
  buildProductInputSchema,
  catalogInputSchemaDefinition
} from '@/features/catalog/schemas/product-input';
import {resellerOrderSchema, type ResellerOrderInput} from '../schemas/reseller';
import {ResellerApiError} from './api-response';
import {idempotencyDecision, sha256} from './signing';
import {queryValue, trustedRest} from './trusted-rest';

type Account = {
  id: string;
  profile_id: string;
  status: string;
  current_tier_id: string;
  manual_tier_id: string | null;
  volume_30d_amount: number;
  credit_limit_override: number | null;
  credit_currency_code: string;
};
type Tier = {
  id: string;
  code: string;
  name: Record<string, string>;
  minimum_30d_volume: number;
  default_credit_limit: number;
  credit_currency_code: string;
  api_rate_limit_per_minute: number;
};
type Variant = {
  id: string;
  product_id: string;
  sku: string;
  name: Record<string, string>;
  price_amount: number;
  currency_code: string;
  stock_quantity: number;
  unlimited_stock: boolean;
  attributes: Record<string, unknown>;
  products: {
    name: Record<string, string>;
    slug: string;
    input_schema: unknown;
    product_type_code: string;
  };
};
type TierPrice = {variant_id: string; price_amount: number; currency_code: string};

async function getAccount(profileId: string) {
  const rows = await trustedRest<Account[]>(
    `reseller_accounts?select=*&profile_id=eq.${profileId}&deleted_at=is.null&limit=1`
  );
  if (!rows[0] || rows[0].status !== 'active')
    throw new ResellerApiError('reseller_account_inactive', 403);
  return rows[0];
}

async function getTier(account: Account) {
  const id = account.manual_tier_id ?? account.current_tier_id;
  const rows = await trustedRest<Tier[]>(
    `reseller_tiers?select=*&id=eq.${id}&deleted_at=is.null&limit=1`
  );
  if (!rows[0]) throw new ResellerApiError('reseller_tier_missing', 500);
  return rows[0];
}

export async function wholesaleCatalog(profileId: string, currencyCode?: string) {
  const account = await getAccount(profileId);
  const tier = await getTier(account);
  const currencyFilter = currencyCode ? `&currency_code=eq.${queryValue(currencyCode)}` : '';
  const [variants, tierPrices] = await Promise.all([
    trustedRest<Variant[]>(
      `product_variants?select=id,product_id,sku,name,price_amount,currency_code,stock_quantity,unlimited_stock,attributes,products!inner(name,slug,input_schema,product_type_code,status)&active=eq.true&deleted_at=is.null&products.status=eq.active${currencyFilter}&order=sku.asc`
    ),
    trustedRest<TierPrice[]>(
      `tier_prices?select=variant_id,price_amount,currency_code&tier_code=eq.${tier.code}&deleted_at=is.null`
    )
  ]);
  const prices = new Map(
    tierPrices.map((price) => [`${price.variant_id}:${price.currency_code}`, price.price_amount])
  );
  return {
    account,
    tier,
    products: variants.map((variant) => ({
      ...variant,
      wholesale_price_amount:
        prices.get(`${variant.id}:${variant.currency_code}`) ?? variant.price_amount,
      available: variant.unlimited_stock || variant.stock_quantity > 0
    }))
  };
}

export async function resellerDashboard(identity: AuthContext) {
  const catalog = await wholesaleCatalog(identity.user.id);
  const [tiers, wallets, orders, sandboxOrders, apiKeys, webhooks] = await Promise.all([
    trustedRest<Tier[]>(
      'reseller_tiers?select=*&active=eq.true&deleted_at=is.null&order=sort_order.asc'
    ),
    trustedRest<unknown[]>(
      `wallets?select=id,currency_code,cached_balance,locked,frozen_at&owner_id=eq.${identity.user.id}&account_type=eq.customer&order=currency_code.asc`
    ),
    trustedRest<unknown[]>(
      `orders?select=id,order_number,status,currency_code,total_amount,created_at&profile_id=eq.${identity.user.id}&deleted_at=is.null&order=created_at.desc&limit=50`
    ),
    trustedRest<unknown[]>(
      `reseller_sandbox_orders?select=id,sandbox_order_number,status,currency_code,total_amount,created_at&reseller_account_id=eq.${catalog.account.id}&deleted_at=is.null&order=created_at.desc&limit=50`
    ),
    trustedRest<unknown[]>(
      `reseller_api_keys?select=id,name,key_prefix,environment,scopes,last_used_at,revoked_at,created_at&reseller_account_id=eq.${catalog.account.id}&deleted_at=is.null&order=created_at.desc`
    ),
    trustedRest<unknown[]>(
      `reseller_webhook_endpoints?select=id,url,events,active,failure_count,last_delivery_at&reseller_account_id=eq.${catalog.account.id}&deleted_at=is.null&order=created_at.desc`
    )
  ]);
  return {...catalog, tiers, wallets, orders, sandboxOrders, apiKeys, webhooks};
}

async function validateOptions(input: ResellerOrderInput) {
  const ids = [...new Set(input.items.map((item) => item.variantId))];
  const variants = await trustedRest<Variant[]>(
    `product_variants?select=id,product_id,sku,name,price_amount,currency_code,stock_quantity,unlimited_stock,attributes,products!inner(name,slug,input_schema,product_type_code,status)&id=in.(${ids.join(',')})`
  );
  const byId = new Map(variants.map((variant) => [variant.id, variant]));
  for (const item of input.items) {
    const variant = byId.get(item.variantId);
    if (!variant) throw new ResellerApiError('variant_not_found', 404);
    const fields = catalogInputSchemaDefinition.parse(variant.products.input_schema);
    const parsed = buildProductInputSchema(fields).safeParse(item.optionValues);
    if (!parsed.success)
      throw new ResellerApiError(
        'option_values_invalid',
        422,
        'Dynamic product options are invalid.',
        parsed.error.flatten()
      );
  }
}

export async function placeApiOrder(
  context: {
    account: Pick<Account, 'id' | 'profile_id'>;
    apiKey: {id: string; environment: 'sandbox' | 'live'};
  },
  rawInput: unknown,
  idempotencyKey: string
) {
  if (idempotencyKey.length < 8 || idempotencyKey.length > 160) {
    throw new ResellerApiError('idempotency_key_invalid', 400);
  }
  const input = resellerOrderSchema.parse(rawInput);
  await validateOptions(input);
  const requestHash = sha256(JSON.stringify(input));
  const scope = 'orders.create';
  const existing = await trustedRest<
    {request_hash: string; response_body: unknown; response_status: number | null}[]
  >(
    `reseller_api_idempotency?select=request_hash,response_body,response_status&reseller_account_id=eq.${context.account.id}&scope=eq.${scope}&idempotency_key=eq.${queryValue(idempotencyKey)}&limit=1`
  );
  const decision = idempotencyDecision(
    existing[0]
      ? {requestHash: existing[0].request_hash, responseBody: existing[0].response_body}
      : null,
    requestHash
  );
  if (decision === 'conflict') throw new ResellerApiError('idempotency_key_reused', 409);
  if (decision === 'processing') throw new ResellerApiError('idempotency_request_in_progress', 409);
  if (decision === 'replay') return {body: existing[0]?.response_body, replayed: true};
  await trustedRest('reseller_api_idempotency', {
    method: 'POST',
    headers: {Prefer: 'return=minimal'},
    body: JSON.stringify({
      reseller_account_id: context.account.id,
      scope,
      idempotency_key: idempotencyKey,
      request_hash: requestHash
    })
  });
  let body: unknown;
  if (context.apiKey.environment === 'sandbox') {
    const catalog = await wholesaleCatalog(context.account.profile_id, input.currencyCode);
    const priceByVariant = new Map(
      catalog.products.map((item) => [item.id, item.wholesale_price_amount])
    );
    const total = input.items.reduce(
      (sum, item) => sum + (priceByVariant.get(item.variantId) ?? 0) * item.quantity,
      0
    );
    const rows = await trustedRest<
      {id: string; sandbox_order_number: string; status: string; total_amount: number}[]
    >('reseller_sandbox_orders', {
      method: 'POST',
      headers: {Prefer: 'return=representation'},
      body: JSON.stringify({
        reseller_account_id: context.account.id,
        idempotency_key: idempotencyKey,
        currency_code: input.currencyCode,
        total_amount: total,
        request: input,
        status: 'completed',
        response: {simulated: true}
      })
    });
    body = {...rows[0], environment: 'sandbox'};
  } else {
    body = await trustedRest('rpc/place_reseller_order', {
      method: 'POST',
      body: JSON.stringify({
        p_profile_id: context.account.profile_id,
        p_currency_code: input.currencyCode,
        p_locale_code: input.localeCode,
        p_country_code: input.countryCode,
        p_items: input.items.map((item) => ({
          variant_id: item.variantId,
          quantity: item.quantity,
          option_values: item.optionValues
        })),
        p_idempotency_key: idempotencyKey,
        p_request_hash: requestHash
      })
    });
  }
  const resource = body as {id?: string};
  await trustedRest(
    `reseller_api_idempotency?reseller_account_id=eq.${context.account.id}&scope=eq.${scope}&idempotency_key=eq.${queryValue(idempotencyKey)}`,
    {
      method: 'PATCH',
      headers: {Prefer: 'return=minimal'},
      body: JSON.stringify({
        response_status: 201,
        response_body: body,
        resource_type: 'order',
        resource_id: resource.id ?? null
      })
    }
  );
  return {body, replayed: false};
}

export async function apiOrder(accountId: string, environment: 'sandbox' | 'live', id: string) {
  const accountRows = await trustedRest<Account[]>(
    `reseller_accounts?select=*&id=eq.${accountId}&limit=1`
  );
  const account = accountRows[0];
  if (!account) throw new ResellerApiError('reseller_account_inactive', 403);
  const table = environment === 'sandbox' ? 'reseller_sandbox_orders' : 'orders';
  const ownerColumn = environment === 'sandbox' ? 'reseller_account_id' : 'profile_id';
  const owner = environment === 'sandbox' ? account.id : account.profile_id;
  const rows = await trustedRest<unknown[]>(
    `${table}?select=*&id=eq.${queryValue(id)}&${ownerColumn}=eq.${owner}&limit=1`
  );
  if (!rows[0]) throw new ResellerApiError('order_not_found', 404);
  return rows[0];
}
