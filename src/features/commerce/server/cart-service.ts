import 'server-only';

import {createHash, randomUUID} from 'node:crypto';

import {buildProductInputSchema} from '@/features/catalog/schemas/product-input';
import {asLocalizedText, type CatalogInputField} from '@/features/catalog/types';
import {createAdminClient} from '@/lib/supabase/admin';
import type {Json} from '@/lib/supabase/database.types';
import {cartItemSchema, cartItemUpdateSchema, couponCodeSchema} from '../schemas/commerce';
import type {CartLine, CartView} from '../types';

export const guestCartCookie = 'nexora_guest_cart';

type CartIdentity = {profileId: string | null; guestToken: string | null};

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function hashGuestCartToken(value: string) {
  return hash(value);
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function object(value: Json): Record<string, unknown> {
  return value && !Array.isArray(value) && typeof value === 'object' ? value : {};
}

function fields(value: Json): CatalogInputField[] {
  return Array.isArray(value) ? (value as unknown as CatalogInputField[]) : [];
}

export function newGuestCartToken() {
  return randomUUID();
}

export async function resolveCart(
  identity: CartIdentity,
  defaults: {currencyCode: string; localeCode: string; countryCode?: string | null},
  create = false
) {
  const admin = createAdminClient();
  let query = admin.from('carts').select('*').eq('status', 'active').is('deleted_at', null);
  query = identity.profileId
    ? query.eq('profile_id', identity.profileId)
    : query.eq('guest_token_hash', hashGuestCartToken(identity.guestToken ?? ''));
  const {data: found, error} = await query.maybeSingle();
  if (error) throw new Error('cart_read_failed');
  if (found || !create) return found;
  const {data, error: insertError} = await admin
    .from('carts')
    .insert({
      profile_id: identity.profileId,
      guest_token_hash: identity.profileId ? null : hashGuestCartToken(identity.guestToken ?? ''),
      currency_code: defaults.currencyCode,
      locale_code: defaults.localeCode,
      country_code: defaults.countryCode ?? null
    })
    .select('*')
    .single();
  if (insertError) throw new Error('cart_create_failed');
  return data;
}

export async function addCartItem(
  identity: CartIdentity,
  defaults: {currencyCode: string; localeCode: string; countryCode?: string | null},
  raw: unknown
) {
  const input = cartItemSchema.parse(raw);
  const admin = createAdminClient();
  const cart = await resolveCart(identity, defaults, true);
  if (!cart) throw new Error('cart_create_failed');
  const {data: variant, error} = await admin
    .from('product_variants')
    .select('*')
    .eq('id', input.variantId)
    .eq('active', true)
    .is('deleted_at', null)
    .single();
  if (error || !variant) throw new Error('cart_variant_unavailable');
  const {data: product} = await admin
    .from('products')
    .select('*')
    .eq('id', variant.product_id)
    .eq('status', 'active')
    .is('deleted_at', null)
    .single();
  if (!product) throw new Error('cart_product_unavailable');
  if (!variant.unlimited_stock && variant.stock_quantity < input.quantity)
    throw new Error('cart_insufficient_stock');
  const result = buildProductInputSchema(fields(product.input_schema)).safeParse(
    input.optionValues
  );
  if (!result.success)
    throw new Error(`cart_options_invalid:${result.error.issues[0]?.message ?? 'invalid'}`);
  const optionFingerprint = hash(stable(result.data));
  const {data: existing} = await admin
    .from('cart_items')
    .select('*')
    .eq('cart_id', cart.id)
    .eq('variant_id', variant.id)
    .eq('option_fingerprint', optionFingerprint)
    .is('deleted_at', null)
    .maybeSingle();
  const nextQuantity = (existing?.quantity ?? 0) + input.quantity;
  if (!variant.unlimited_stock && variant.stock_quantity < nextQuantity)
    throw new Error('cart_insufficient_stock');
  if (existing) {
    const {data, error: updateError} = await admin
      .from('cart_items')
      .update({quantity: nextQuantity, validation_snapshot: {valid: true}})
      .eq('id', existing.id)
      .select('*')
      .single();
    if (updateError) throw new Error('cart_update_failed');
    await admin
      .from('carts')
      .update({last_activity_at: new Date().toISOString()})
      .eq('id', cart.id);
    return data;
  }
  const {data, error: insertError} = await admin
    .from('cart_items')
    .insert({
      cart_id: cart.id,
      product_id: product.id,
      variant_id: variant.id,
      quantity: input.quantity,
      option_values: result.data as unknown as Json,
      option_fingerprint: optionFingerprint,
      validation_snapshot: {valid: true},
      unit_price_snapshot: variant.price_amount
    })
    .select('*')
    .single();
  if (insertError) throw new Error('cart_add_failed');
  await admin.from('carts').update({last_activity_at: new Date().toISOString()}).eq('id', cart.id);
  return data;
}

export async function updateCartItem(identity: CartIdentity, itemId: string, raw: unknown) {
  const input = cartItemUpdateSchema.parse(raw);
  const admin = createAdminClient();
  const cart = await resolveCart(identity, {currencyCode: 'USD', localeCode: 'en'});
  if (!cart) throw new Error('cart_not_found');
  const {data: item} = await admin
    .from('cart_items')
    .select('*')
    .eq('id', itemId)
    .eq('cart_id', cart.id)
    .is('deleted_at', null)
    .single();
  if (!item) throw new Error('cart_item_not_found');
  const {data: variant} = await admin
    .from('product_variants')
    .select('*')
    .eq('id', item.variant_id)
    .single();
  if (!variant || (!variant.unlimited_stock && variant.stock_quantity < input.quantity))
    throw new Error('cart_insufficient_stock');
  const updates: {quantity: number; option_values?: Json; option_fingerprint?: string} = {
    quantity: input.quantity
  };
  if (input.optionValues) {
    const {data: product} = await admin
      .from('products')
      .select('input_schema')
      .eq('id', item.product_id)
      .single();
    const parsed = buildProductInputSchema(fields(product?.input_schema ?? [])).parse(
      input.optionValues
    );
    updates.option_values = parsed as unknown as Json;
    updates.option_fingerprint = hash(stable(parsed));
  }
  const {data, error} = await admin
    .from('cart_items')
    .update(updates)
    .eq('id', item.id)
    .select('*')
    .single();
  if (error) throw new Error('cart_update_failed');
  await admin.from('carts').update({last_activity_at: new Date().toISOString()}).eq('id', cart.id);
  return data;
}

export async function removeCartItem(identity: CartIdentity, itemId: string) {
  const admin = createAdminClient();
  const cart = await resolveCart(identity, {currencyCode: 'USD', localeCode: 'en'});
  if (!cart) return;
  await admin
    .from('cart_items')
    .update({deleted_at: new Date().toISOString()})
    .eq('id', itemId)
    .eq('cart_id', cart.id);
  await admin.from('carts').update({last_activity_at: new Date().toISOString()}).eq('id', cart.id);
}

export async function setCartCoupon(identity: CartIdentity, code: string | null) {
  const admin = createAdminClient();
  const cart = await resolveCart(identity, {currencyCode: 'USD', localeCode: 'en'});
  if (!cart) throw new Error('cart_not_found');
  const couponCodes = code ? [couponCodeSchema.parse(code)] : [];
  const {error} = await admin.from('carts').update({coupon_codes: couponCodes}).eq('id', cart.id);
  if (error) throw new Error('coupon_update_failed');
}

export async function readCart(identity: CartIdentity): Promise<CartView | null> {
  const admin = createAdminClient();
  const cart = await resolveCart(identity, {currencyCode: 'USD', localeCode: 'en'});
  if (!cart) return null;
  const {data: rows, error} = await admin
    .from('cart_items')
    .select('*')
    .eq('cart_id', cart.id)
    .is('deleted_at', null)
    .order('created_at');
  if (error) throw new Error('cart_items_failed');
  const lines: CartLine[] = [];
  for (const row of rows ?? []) {
    const [{data: product}, {data: variant}, {data: media}] = await Promise.all([
      admin.from('products').select('*').eq('id', row.product_id).single(),
      admin.from('product_variants').select('*').eq('id', row.variant_id).single(),
      admin
        .from('product_media')
        .select('url')
        .eq('product_id', row.product_id)
        .eq('is_primary', true)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle()
    ]);
    if (!product || !variant) continue;
    lines.push({
      id: row.id,
      productId: product.id,
      variantId: variant.id,
      quantity: row.quantity,
      optionValues: object(row.option_values),
      productName: asLocalizedText(product.name),
      variantName: asLocalizedText(variant.name),
      sku: variant.sku,
      priceAmount: variant.price_amount,
      currencyCode: variant.currency_code,
      stockQuantity: variant.stock_quantity,
      unlimitedStock: variant.unlimited_stock,
      fulfillmentMode: product.fulfillment_mode,
      warrantyText: asLocalizedText(product.warranty_text),
      imageUrl: media?.url ?? null
    });
  }
  const productIds = lines.map((line) => line.productId);
  const {data: relations} = productIds.length
    ? await admin
        .from('product_relations')
        .select('related_product_id')
        .in('product_id', productIds)
        .eq('relation_type', 'upsell')
        .order('score', {ascending: false})
        .limit(6)
    : {data: []};
  const upsells: CartView['upsells'] = [];
  for (const relation of relations ?? []) {
    const {data: product} = await admin
      .from('products')
      .select('id,slug,name')
      .eq('id', relation.related_product_id)
      .eq('status', 'active')
      .maybeSingle();
    if (!product) continue;
    const {data: variant} = await admin
      .from('product_variants')
      .select('price_amount,currency_code')
      .eq('product_id', product.id)
      .eq('active', true)
      .order('price_amount')
      .limit(1)
      .maybeSingle();
    if (variant)
      upsells.push({
        id: product.id,
        slug: product.slug,
        name: product.name,
        priceAmount: variant.price_amount,
        currencyCode: variant.currency_code
      });
  }
  return {
    id: cart.id,
    currencyCode: cart.currency_code,
    localeCode: cart.locale_code,
    countryCode: cart.country_code,
    couponCodes: cart.coupon_codes,
    items: lines,
    upsells
  };
}

export async function mergeGuestCart(profileId: string, guestToken: string | null) {
  if (!profileId || !guestToken) return;
  const admin = createAdminClient();
  const guest = await resolveCart(
    {profileId: null, guestToken},
    {currencyCode: 'USD', localeCode: 'en'}
  );
  if (!guest) return;
  const profile = await resolveCart(
    {profileId, guestToken: null},
    {
      currencyCode: guest.currency_code,
      localeCode: guest.locale_code,
      countryCode: guest.country_code
    },
    true
  );
  if (!profile || profile.id === guest.id) return;
  const {data: guestItems} = await admin
    .from('cart_items')
    .select('*')
    .eq('cart_id', guest.id)
    .is('deleted_at', null);
  for (const item of guestItems ?? []) {
    const {data: existing} = await admin
      .from('cart_items')
      .select('*')
      .eq('cart_id', profile.id)
      .eq('variant_id', item.variant_id)
      .eq('option_fingerprint', item.option_fingerprint)
      .is('deleted_at', null)
      .maybeSingle();
    if (existing)
      await admin
        .from('cart_items')
        .update({quantity: existing.quantity + item.quantity})
        .eq('id', existing.id);
    else await admin.from('cart_items').update({cart_id: profile.id}).eq('id', item.id);
  }
  await admin
    .from('carts')
    .update({status: 'converted', converted_order_id: null})
    .eq('id', guest.id);
}
