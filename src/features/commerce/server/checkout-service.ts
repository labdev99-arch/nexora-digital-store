import 'server-only';

import {createHash, randomUUID} from 'node:crypto';

import type {AuthContext} from '@/features/auth/server/authorization';
import {getPaymentProvider} from '@/features/payments/server/providers/registry';
import {trustedRest} from '@/features/reseller/server/trusted-rest';
import {createAdminClient} from '@/lib/supabase/admin';
import type {Json} from '@/lib/supabase/database.types';
import {checkoutSchema} from '../schemas/commerce';
import {readCart} from './cart-service';
import {priceCartAuthoritatively} from './pricing-service';

type CheckoutIdentity = AuthContext | null;

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function paymentFee(amount: number, fixed: number, rate: number) {
  return fixed + Math.ceil((amount * rate) / 10_000);
}

export async function checkout(
  identity: CheckoutIdentity,
  guestToken: string | null,
  raw: unknown,
  locale: string
) {
  const input = checkoutSchema.parse(raw);
  const profileId = identity?.user.id ?? null;
  const admin = createAdminClient();
  let replayQuery = admin
    .from('orders')
    .select('*')
    .eq('checkout_idempotency_key', input.idempotencyKey);
  replayQuery = profileId
    ? replayQuery.eq('profile_id', profileId)
    : replayQuery.eq('guest_access_token_hash', digest(guestToken ?? ''));
  const {data: replay} = await replayQuery.maybeSingle();
  if (replay) {
    const {data: payment} = replay.payment_id
      ? await admin.from('payments').select('*').eq('id', replay.payment_id).maybeSingle()
      : {data: null};
    return {order: replay, guestAccessToken: profileId ? null : guestToken, payment};
  }
  const cart = await readCart({profileId, guestToken});
  if (!cart || !cart.items.length) throw new Error('checkout_cart_empty');
  if (cart.items.some((item) => item.currencyCode !== cart.currencyCode))
    throw new Error('checkout_currency_mismatch');
  for (const item of cart.items) {
    if (!item.unlimitedStock && item.stockQuantity < item.quantity)
      throw new Error('checkout_stock_changed');
  }
  const {data: profile} = profileId
    ? await admin.from('profiles').select('country_code').eq('id', profileId).single()
    : {data: null};
  const countryCode = input.countryCode || profile?.country_code || cart.countryCode || 'LB';
  const priced = await priceCartAuthoritatively(cart, {
    profileId,
    roles: identity?.roles ?? ['customer'],
    countryCode
  });
  const orderId = randomUUID();
  const guestAccessToken = profileId ? null : guestToken;
  const email = profileId ? identity?.user.email : input.email;
  if (!profileId && (!email || !guestAccessToken)) throw new Error('checkout_guest_email_required');
  const {data: order, error: orderError} = await admin
    .from('orders')
    .insert({
      id: orderId,
      profile_id: profileId,
      guest_email: profileId ? null : email,
      guest_access_token_hash: guestAccessToken ? digest(guestAccessToken) : null,
      cart_id: cart.id,
      checkout_idempotency_key: input.idempotencyKey,
      currency_code: cart.currencyCode,
      locale_code: locale,
      country_code: countryCode,
      customer_notes: input.notes ?? null,
      terms_accepted_at: new Date().toISOString(),
      subtotal_amount: priced.result.subtotalAmount,
      discount_amount: priced.result.discountAmount,
      fee_amount: priced.result.feeAmount,
      tax_amount: priced.result.taxAmount,
      total_amount: priced.result.totalAmount,
      pricing_snapshot: priced.result as unknown as Json
    })
    .select('*')
    .single();
  if (orderError) throw new Error('checkout_order_create_failed');
  const itemRows = priced.result.lines.map((line) => {
    const cartLine = cart.items.find((item) => item.id === line.id);
    if (!cartLine) throw new Error('checkout_line_missing');
    return {
      order_id: order.id,
      product_id: cartLine.productId,
      variant_id: cartLine.variantId,
      sku: cartLine.sku,
      product_name: cartLine.productName as unknown as Json,
      variant_name: cartLine.variantName as unknown as Json,
      option_values: cartLine.optionValues as unknown as Json,
      quantity: cartLine.quantity,
      base_amount: line.baseAmount,
      tier_amount: line.tierAmount,
      country_amount: line.countryAmount,
      quantity_discount_amount: line.quantityDiscountAmount,
      flash_discount_amount: line.flashDiscountAmount,
      coupon_discount_amount: line.couponDiscountAmount,
      loyalty_discount_amount: line.loyaltyDiscountAmount,
      fee_amount: line.feeAmount,
      tax_amount: line.taxAmount,
      total_amount: line.totalAmount,
      fulfillment_mode: cartLine.fulfillmentMode,
      warranty_text: cartLine.warrantyText as unknown as Json
    };
  });
  const {error: itemsError} = await admin.from('order_items').insert(itemRows);
  if (itemsError) throw new Error('checkout_items_create_failed');
  if (profileId && priced.loyaltyRedemptionId) {
    await trustedRest('rpc/claim_loyalty_discount', {
      method: 'POST',
      body: JSON.stringify({
        p_redemption_id: priced.loyaltyRedemptionId,
        p_profile_id: profileId,
        p_order_id: order.id
      })
    });
  }
  for (const coupon of priced.coupons) {
    const discount = priced.result.lines.reduce(
      (sum, line) =>
        sum + (line.appliedCoupons.includes(coupon.code) ? line.couponDiscountAmount : 0),
      0
    );
    const {error} = await admin.rpc('claim_order_coupon', {
      p_coupon_id: coupon.id,
      p_order_id: order.id,
      p_profile_id: profileId,
      p_discount_amount: discount,
      p_currency_code: order.currency_code
    });
    if (error) throw new Error(`checkout_coupon_rejected:${coupon.code}`);
  }

  if (input.paymentMethod === 'wallet') {
    if (!profileId) throw new Error('checkout_wallet_requires_account');
    const {data: paidOrder, error} = await admin.rpc('pay_order_with_wallet', {
      p_order_id: order.id,
      p_profile_id: profileId,
      p_idempotency_key: `order:${order.id}:${input.idempotencyKey}`
    });
    if (error) throw new Error(error.message);
    await admin
      .from('carts')
      .update({status: 'converted', converted_order_id: order.id})
      .eq('id', cart.id);
    return {order: paidOrder, guestAccessToken, payment: null};
  }

  const {data: method} = await admin
    .from('payment_methods')
    .select('*')
    .eq('code', input.paymentMethod)
    .eq('enabled', true)
    .is('deleted_at', null)
    .single();
  if (!method || !method.allowed_currencies.includes(order.currency_code))
    throw new Error('checkout_payment_unavailable');
  if (!profileId && method.flow === 'proof')
    throw new Error('checkout_guest_proof_requires_account');
  if (method.allowed_countries.length && !method.allowed_countries.includes(countryCode))
    throw new Error('checkout_payment_country_unavailable');
  const providerFee = paymentFee(order.total_amount, method.fee_fixed, method.fee_bps);
  const payableAmount = order.total_amount + providerFee;
  const paymentId = randomUUID();
  const {error: paymentCreateError} = await admin.from('payments').insert({
    id: paymentId,
    profile_id: profileId,
    order_id: order.id,
    payment_method_id: method.id,
    provider_code: method.code,
    purpose: 'order',
    currency_code: order.currency_code,
    requested_amount: order.total_amount,
    fee_amount: providerFee,
    payable_amount: payableAmount,
    idempotency_key: input.idempotencyKey,
    sandbox_mode: method.sandbox_mode,
    status: 'created'
  });
  if (paymentCreateError) throw new Error('checkout_payment_create_failed');
  const provider = getPaymentProvider(method.driver);
  const initiation = await provider.initiate({
    paymentId,
    profileId: profileId ?? order.id,
    email: email ?? null,
    amount: order.total_amount,
    feeAmount: providerFee,
    payableAmount,
    currencyCode: order.currency_code,
    returnUrl: input.returnUrl,
    idempotencyKey: input.idempotencyKey,
    sandbox: method.sandbox_mode,
    locale,
    config: method.config,
    crypto: input.crypto
  });
  const {data: payment, error: paymentUpdateError} = await admin
    .from('payments')
    .update({
      provider_payment_id: initiation.providerPaymentId,
      payment_reference: initiation.reference,
      status: initiation.status,
      client_action: initiation.clientAction,
      provider_metadata: initiation.metadata ?? {},
      expires_at: initiation.expiresAt,
      rate_expires_at: initiation.rateExpiresAt
    })
    .eq('id', paymentId)
    .select('*')
    .single();
  if (paymentUpdateError) throw new Error('checkout_payment_update_failed');
  const {data: awaiting, error: transitionError} = await admin.rpc('transition_order_status', {
    p_order_id: order.id,
    p_to: 'awaiting_payment',
    p_actor_id: profileId,
    p_actor_type: profileId ? 'customer' : 'guest',
    p_source: 'direct_checkout',
    p_metadata: {payment_id: payment.id}
  });
  if (transitionError) throw new Error('checkout_transition_failed');
  await admin
    .from('orders')
    .update({
      payment_id: payment.id,
      fee_amount: order.fee_amount + providerFee,
      total_amount: payableAmount
    })
    .eq('id', order.id);
  const providerMetadata = initiation.metadata;
  const simulatedSandbox =
    method.flow === 'automatic' &&
    method.sandbox_mode &&
    providerMetadata !== null &&
    typeof providerMetadata === 'object' &&
    !Array.isArray(providerMetadata) &&
    providerMetadata.sandbox === true;
  if (simulatedSandbox && payment.provider_payment_id) {
    const verification = await provider.verify(payment.provider_payment_id, {
      paymentId,
      profileId: profileId ?? order.id,
      email: email ?? null,
      amount: order.total_amount,
      feeAmount: providerFee,
      payableAmount,
      currencyCode: order.currency_code,
      returnUrl: input.returnUrl,
      idempotencyKey: input.idempotencyKey,
      sandbox: true,
      locale,
      config: method.config,
      crypto: input.crypto
    });
    if (verification.verified && verification.status === 'paid') {
      const {data: settled, error: settlementError} = await admin.rpc('settle_order_payment', {
        p_payment_id: payment.id,
        p_received_amount: verification.receivedAmount ?? payableAmount,
        p_provider_event_id: verification.providerEventId ?? `sandbox:${payment.id}`
      });
      if (settlementError) throw new Error('checkout_sandbox_settlement_failed');
      const {data: settledPayment} = await admin
        .from('payments')
        .select('*')
        .eq('id', payment.id)
        .single();
      await admin
        .from('carts')
        .update({status: 'converted', converted_order_id: order.id})
        .eq('id', cart.id);
      return {order: settled ?? awaiting, guestAccessToken, payment: settledPayment ?? payment};
    }
  }
  await admin
    .from('carts')
    .update({status: 'converted', converted_order_id: order.id})
    .eq('id', cart.id);
  return {
    order: {
      ...awaiting,
      payment_id: payment.id,
      fee_amount: order.fee_amount + providerFee,
      total_amount: payableAmount
    },
    guestAccessToken,
    payment
  };
}
