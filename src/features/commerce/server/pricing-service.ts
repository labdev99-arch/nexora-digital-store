import 'server-only';

import type {UserRole} from '@/lib/supabase/database.types';
import {createAdminClient} from '@/lib/supabase/admin';
import {queryValue, trustedRest} from '@/features/reseller/server/trusted-rest';
import {priceCart, type CouponAdjustment, type PriceLineInput} from '../pricing-engine';
import type {CartView} from '../types';

type PricingIdentity = {profileId: string | null; roles: UserRole[]; countryCode: string};

export async function priceCartAuthoritatively(cart: CartView, identity: PricingIdentity) {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const requestedCodes = cart.couponCodes.map((code) => code.toUpperCase());
  const loyaltyDiscounts = identity.profileId
    ? await trustedRest<Array<{id: string; discount_bps: number}>>(
        `loyalty_redemptions?select=id,discount_bps&profile_id=eq.${queryValue(identity.profileId)}&kind=eq.discount&status=eq.active&discount_expires_at=gt.${queryValue(now)}&order=discount_bps.desc,created_at.asc&limit=1`
      ).catch(() => [])
    : [];
  const loyaltyDiscount = loyaltyDiscounts[0] ?? null;
  const {data: autoCoupons} = await admin
    .from('coupons')
    .select('*')
    .eq('active', true)
    .eq('auto_apply', true)
    .is('deleted_at', null)
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('priority', {ascending: false});
  const {data: enteredCoupons} = requestedCodes.length
    ? await admin
        .from('coupons')
        .select('*')
        .in('code', requestedCodes)
        .eq('active', true)
        .is('deleted_at', null)
    : {data: []};
  const couponMap = new Map(
    [...(autoCoupons ?? []), ...(enteredCoupons ?? [])].map((coupon) => [coupon.id, coupon])
  );
  const coupons = [...couponMap.values()]
    .filter(
      (coupon) =>
        (!coupon.starts_at || coupon.starts_at <= now) &&
        (!coupon.expires_at || coupon.expires_at > now) &&
        (coupon.kind !== 'fixed' || coupon.currency_code === cart.currencyCode)
    )
    .sort((a, b) => b.priority - a.priority);
  const selected = coupons.filter((coupon, index) => {
    if (index === 0) return true;
    const previous = coupons
      .slice(0, index)
      .filter((item) => item.stack_group === coupon.stack_group);
    return coupon.stackable && previous.every((item) => item.stackable);
  });

  const firstOrder = identity.profileId
    ? !(
        await admin
          .from('orders')
          .select('id', {count: 'exact', head: true})
          .eq('profile_id', identity.profileId)
          .in('status', ['paid', 'processing', 'partially_delivered', 'delivered', 'completed'])
      ).count
    : true;

  const lines: PriceLineInput[] = [];
  const appliedCouponIds = new Set<string>();
  for (const item of cart.items) {
    const tier = identity.roles.find((role) => role !== 'customer') ?? 'customer';
    const [{data: tierPrice}, {data: countryPrice}, {data: quantityRule}, {data: taxRule}] =
      await Promise.all([
        admin
          .from('tier_prices')
          .select('*')
          .eq('variant_id', item.variantId)
          .eq('tier_code', tier)
          .eq('currency_code', cart.currencyCode)
          .is('deleted_at', null)
          .maybeSingle(),
        admin
          .from('country_prices')
          .select('*')
          .eq('variant_id', item.variantId)
          .eq('country_code', identity.countryCode)
          .eq('currency_code', cart.currencyCode)
          .is('deleted_at', null)
          .maybeSingle(),
        admin
          .from('quantity_discounts')
          .select('*')
          .eq('variant_id', item.variantId)
          .lte('minimum_quantity', item.quantity)
          .or(`maximum_quantity.is.null,maximum_quantity.gte.${item.quantity}`)
          .is('deleted_at', null)
          .order('minimum_quantity', {ascending: false})
          .order('priority', {ascending: false})
          .limit(1)
          .maybeSingle(),
        admin
          .from('tax_rules')
          .select('*')
          .eq('country_code', identity.countryCode)
          .eq('active', true)
          .is('deleted_at', null)
          .or(`starts_at.is.null,starts_at.lte.${now}`)
          .or(`ends_at.is.null,ends_at.gt.${now}`)
          .order('rate_bps', {ascending: false})
          .limit(1)
          .maybeSingle()
      ]);
    const {data: flashScopes} = await admin
      .from('flash_sale_scopes')
      .select('*')
      .or(`product_id.eq.${item.productId},variant_id.eq.${item.variantId}`);
    const flashIds = (flashScopes ?? []).map((scope) => String(scope.flash_sale_id));
    const {data: flash} = flashIds.length
      ? await admin
          .from('flash_sales')
          .select('*')
          .in('id', flashIds)
          .eq('active', true)
          .lte('starts_at', now)
          .gt('ends_at', now)
          .is('deleted_at', null)
          .order('priority', {ascending: false})
          .limit(1)
          .maybeSingle()
      : {data: null};

    const couponAdjustments: CouponAdjustment[] = [];
    for (const coupon of selected) {
      if (coupon.first_order_only && !firstOrder) continue;
      const [{count: productScopeCount}, {count: categoryScopeCount}] = await Promise.all([
        admin
          .from('coupon_products')
          .select('id', {count: 'exact', head: true})
          .eq('coupon_id', coupon.id),
        admin
          .from('coupon_categories')
          .select('id', {count: 'exact', head: true})
          .eq('coupon_id', coupon.id)
      ]);
      let applies = !productScopeCount && !categoryScopeCount;
      if (productScopeCount) {
        applies = Boolean(
          (
            await admin
              .from('coupon_products')
              .select('id')
              .eq('coupon_id', coupon.id)
              .eq('product_id', item.productId)
              .maybeSingle()
          ).data
        );
      }
      if (!applies && categoryScopeCount) {
        const {data: product} = await admin
          .from('products')
          .select('category_id')
          .eq('id', item.productId)
          .single();
        applies = Boolean(
          product &&
          (
            await admin
              .from('coupon_categories')
              .select('id')
              .eq('coupon_id', coupon.id)
              .eq('category_id', product.category_id)
              .maybeSingle()
          ).data
        );
      }
      if (coupon.kind === 'free_item')
        applies = applies && coupon.free_variant_id === item.variantId;
      if (applies) appliedCouponIds.add(coupon.id);
      couponAdjustments.push({
        code: coupon.code,
        kind: coupon.kind,
        value: coupon.value_amount,
        applies
      });
    }
    const quantityKind = String(quantityRule?.value_kind ?? '');
    lines.push({
      id: item.id,
      quantity: item.quantity,
      baseUnitAmount: item.priceAmount,
      tierUnitAmount:
        typeof tierPrice?.price_amount === 'number' ? tierPrice.price_amount : undefined,
      countryUnitAmount:
        typeof countryPrice?.price_amount === 'number' ? countryPrice.price_amount : undefined,
      quantityUnitAmount:
        quantityKind === 'unit_price' ? Number(quantityRule?.value_amount) : undefined,
      quantityDiscountBps:
        quantityKind === 'percent' ? Number(quantityRule?.value_amount) : undefined,
      flashDiscountBps: flash?.value_kind === 'percent' ? flash.value_amount : undefined,
      flashDiscountFixed: flash?.value_kind === 'fixed' ? flash.value_amount : undefined,
      coupons: couponAdjustments,
      loyaltyDiscountBps: loyaltyDiscount?.discount_bps ?? 0,
      taxBps: Number(taxRule?.rate_bps ?? 0),
      taxInclusive: Boolean(taxRule?.inclusive)
    });
  }
  const result = priceCart(lines);
  const subtotalBeforeCoupons =
    result.subtotalAmount -
    result.lines.reduce(
      (sum, line) =>
        sum +
        line.tierAmount +
        line.countryAmount +
        line.quantityDiscountAmount +
        line.flashDiscountAmount,
      0
    );
  const validCouponIds = [...appliedCouponIds].filter((id) => {
    const coupon = couponMap.get(id);
    return coupon && subtotalBeforeCoupons >= coupon.minimum_cart_amount;
  });
  const finalResult =
    validCouponIds.length === appliedCouponIds.size
      ? result
      : priceCart(
          lines.map((line) => ({
            ...line,
            coupons: line.coupons?.map((coupon) => ({
              ...coupon,
              applies:
                coupon.applies &&
                selected.some(
                  (candidate) =>
                    candidate.code === coupon.code && validCouponIds.includes(candidate.id)
                )
            }))
          }))
        );
  return {
    result: finalResult,
    coupons: selected.filter((coupon) => validCouponIds.includes(coupon.id)),
    loyaltyRedemptionId: loyaltyDiscount?.id ?? null,
    firstOrder
  };
}
