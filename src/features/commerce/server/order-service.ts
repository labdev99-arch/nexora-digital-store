import 'server-only';

import {createHash} from 'node:crypto';

import {createAdminClient} from '@/lib/supabase/admin';
import type {OrderStatus} from '@/lib/supabase/database.types';
import {orderMessageSchema, refundRequestSchema} from '../schemas/commerce';
import {decryptOrderPayload} from './payload-crypto';
import {resolveCart} from './cart-service';

type Access = {profileId: string | null; guestToken: string | null};
function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

async function authorize(orderId: string, access: Access) {
  const admin = createAdminClient();
  const {data: order} = await admin
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!order) throw new Error('order_not_found');
  const allowed = access.profileId
    ? order.profile_id === access.profileId
    : Boolean(access.guestToken && order.guest_access_token_hash === digest(access.guestToken));
  if (!allowed) throw new Error('order_not_found');
  return order;
}

export async function listOrders(profileId: string, status?: OrderStatus) {
  const admin = createAdminClient();
  let query = admin
    .from('orders')
    .select('*')
    .eq('profile_id', profileId)
    .is('deleted_at', null)
    .order('created_at', {ascending: false})
    .limit(100);
  if (status) query = query.eq('status', status);
  const {data, error} = await query;
  if (error) throw new Error('orders_read_failed');
  return data ?? [];
}

export async function getOrderDetail(orderId: string, access: Access) {
  const admin = createAdminClient();
  const order = await authorize(orderId, access);
  const [
    {data: items},
    {data: events},
    {data: deliveries},
    {data: messages},
    {data: refunds},
    {data: payment}
  ] = await Promise.all([
    admin.from('order_items').select('*').eq('order_id', order.id).order('created_at'),
    admin.from('order_events').select('*').eq('order_id', order.id).order('created_at'),
    admin.from('order_deliveries').select('*').eq('order_id', order.id).order('created_at'),
    admin
      .from('order_messages')
      .select('*')
      .eq('order_id', order.id)
      .eq('internal', false)
      .is('deleted_at', null)
      .order('created_at'),
    admin
      .from('order_refund_requests')
      .select('*')
      .eq('order_id', order.id)
      .order('created_at', {ascending: false}),
    order.payment_id
      ? admin.from('payments').select('*').eq('id', order.payment_id).maybeSingle()
      : Promise.resolve({data: null, error: null})
  ]);
  const {data: paymentMethod} = payment
    ? await admin
        .from('payment_methods')
        .select('code,flow,instructions')
        .eq('id', payment.payment_method_id)
        .maybeSingle()
    : {data: null};
  return {
    order,
    items: items ?? [],
    events: events ?? [],
    deliveries: (deliveries ?? []).map((delivery) => ({...delivery, payload_ciphertext: null})),
    messages: messages ?? [],
    refunds: refunds ?? [],
    payment: payment
      ? {
          id: payment.id,
          status: payment.status,
          payment_reference: payment.payment_reference,
          payable_amount: payment.payable_amount,
          client_action: payment.client_action,
          method: paymentMethod
        }
      : null
  };
}

export async function cancelOrder(orderId: string, profileId: string) {
  const admin = createAdminClient();
  const order = await authorize(orderId, {profileId, guestToken: null});
  if (!['draft', 'awaiting_payment'].includes(order.status)) throw new Error('order_cannot_cancel');
  const {data, error} = await admin.rpc('transition_order_status', {
    p_order_id: order.id,
    p_to: 'cancelled',
    p_actor_id: profileId,
    p_actor_type: 'customer',
    p_source: 'customer_action',
    p_reason: 'customer_cancelled'
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function requestOrderRefund(orderId: string, profileId: string, raw: unknown) {
  const input = refundRequestSchema.parse(raw);
  const admin = createAdminClient();
  const order = await authorize(orderId, {profileId, guestToken: null});
  if (
    !['paid', 'processing', 'partially_delivered', 'delivered', 'completed'].includes(order.status)
  )
    throw new Error('order_refund_not_allowed');
  const {data, error} = await admin
    .from('order_refund_requests')
    .insert({
      order_id: order.id,
      profile_id: profileId,
      requested_amount: order.paid_amount - order.refunded_amount,
      reason: input.reason
    })
    .select('*')
    .single();
  if (error) throw new Error('order_refund_request_failed');
  return data;
}

export async function postOrderMessage(orderId: string, profileId: string, raw: unknown) {
  const input = orderMessageSchema.parse(raw);
  const admin = createAdminClient();
  await authorize(orderId, {profileId, guestToken: null});
  const {data, error} = await admin
    .from('order_messages')
    .insert({
      order_id: orderId,
      author_id: profileId,
      author_type: 'customer',
      body: input.body,
      internal: false
    })
    .select('*')
    .single();
  if (error) throw new Error('order_message_failed');
  return data;
}

export async function revealDelivery(deliveryId: string, access: Access) {
  const admin = createAdminClient();
  const {data: delivery} = await admin
    .from('order_deliveries')
    .select('*')
    .eq('id', deliveryId)
    .single();
  if (!delivery) throw new Error('delivery_not_found');
  await authorize(delivery.order_id, access);
  await admin
    .from('order_deliveries')
    .update({revealed_at: new Date().toISOString(), reveal_count: delivery.reveal_count + 1})
    .eq('id', delivery.id);
  if (delivery.kind === 'file' && delivery.storage_path) {
    const {data} = await admin.storage
      .from('order-deliveries')
      .createSignedUrl(delivery.storage_path, 60);
    return {kind: delivery.kind, value: data?.signedUrl ?? null};
  }
  return {
    kind: delivery.kind,
    value: delivery.payload_ciphertext ? decryptOrderPayload(delivery.payload_ciphertext) : null
  };
}

export async function reorder(orderId: string, profileId: string) {
  const admin = createAdminClient();
  const order = await authorize(orderId, {profileId, guestToken: null});
  const cart = await resolveCart(
    {profileId, guestToken: null},
    {
      currencyCode: order.currency_code,
      localeCode: order.locale_code,
      countryCode: order.country_code
    },
    true
  );
  if (!cart) throw new Error('cart_create_failed');
  const {data: items} = await admin.from('order_items').select('*').eq('order_id', order.id);
  for (const item of items ?? []) {
    const {data: variant} = await admin
      .from('product_variants')
      .select('*')
      .eq('id', item.variant_id)
      .eq('active', true)
      .is('deleted_at', null)
      .maybeSingle();
    if (!variant || (!variant.unlimited_stock && variant.stock_quantity < item.quantity)) continue;
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(item.option_values))
      .digest('hex');
    const {data: existing} = await admin
      .from('cart_items')
      .select('*')
      .eq('cart_id', cart.id)
      .eq('variant_id', item.variant_id)
      .eq('option_fingerprint', fingerprint)
      .is('deleted_at', null)
      .maybeSingle();
    if (existing)
      await admin
        .from('cart_items')
        .update({quantity: existing.quantity + item.quantity})
        .eq('id', existing.id);
    else
      await admin.from('cart_items').insert({
        cart_id: cart.id,
        product_id: item.product_id,
        variant_id: item.variant_id,
        quantity: item.quantity,
        option_values: item.option_values,
        option_fingerprint: fingerprint,
        validation_snapshot: {valid: true, source: 'reorder'},
        unit_price_snapshot: variant.price_amount
      });
  }
  return cart;
}
