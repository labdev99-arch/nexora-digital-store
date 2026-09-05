import 'server-only';

import {createHash} from 'node:crypto';

import {createAdminClient} from '@/lib/supabase/admin';
import type {Json} from '@/lib/supabase/database.types';
import {notify} from '@/features/notifications/server/service';
import {getPaymentProvider} from './providers/registry';

export async function processPaymentWebhook(
  providerCode: string,
  rawBody: string,
  headers: Headers
) {
  const admin = createAdminClient();
  const {data: method} = await admin
    .from('payment_methods')
    .select('*')
    .or(`code.eq.${providerCode},driver.eq.${providerCode}`)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();
  if (!method) throw new Error('payment_provider_unknown');
  const provider = getPaymentProvider(method.driver);
  const event = await provider.handleWebhook(rawBody, headers);
  const signature =
    headers.get('stripe-signature') ??
    headers.get('x-nowpayments-sig') ??
    headers.get('x-payment-signature') ??
    '';
  const signatureHash = createHash('sha256').update(signature).digest('hex');
  const {data: existing} = await admin
    .from('payment_webhook_events')
    .select('*')
    .eq('provider_code', providerCode)
    .eq('provider_event_id', event.eventId)
    .maybeSingle();
  if (existing) return {replayed: true, status: existing.status};
  const {data: payment} = event.paymentId
    ? await admin.from('payments').select('*').eq('id', event.paymentId).maybeSingle()
    : event.providerPaymentId
      ? await admin
          .from('payments')
          .select('*')
          .eq('provider_payment_id', event.providerPaymentId)
          .maybeSingle()
      : {data: null};
  const {data: record, error: insertError} = await admin
    .from('payment_webhook_events')
    .insert({
      provider_code: providerCode,
      provider_event_id: event.eventId,
      event_type: event.eventType,
      signature_sha256: signatureHash,
      payload: event.raw,
      payment_id: payment?.id ?? null,
      status: 'received',
      attempts: 1
    })
    .select('*')
    .single();
  if (insertError) {
    const {data: raced} = await admin
      .from('payment_webhook_events')
      .select('*')
      .eq('provider_code', providerCode)
      .eq('provider_event_id', event.eventId)
      .maybeSingle();
    if (raced) return {replayed: true, status: raced.status};
    throw new Error('payment_webhook_store_failed');
  }
  try {
    if (!payment) {
      await admin
        .from('payment_webhook_events')
        .update({status: 'ignored', processed_at: new Date().toISOString()})
        .eq('id', record.id);
      return {replayed: false, status: 'ignored'};
    }
    if (event.refund) {
      const {data: refund} = await admin
        .from('payment_refunds')
        .select('*')
        .eq('provider_refund_id', event.refund.providerRefundId)
        .maybeSingle();
      if (refund && event.refund.status === 'succeeded') {
        const {error} = await admin.rpc('finalize_payment_refund', {
          p_refund_id: refund.id,
          p_provider_refund_id: event.refund.providerRefundId
        });
        if (error) throw error;
      } else if (refund && event.refund.status === 'failed') {
        if (!payment.profile_id) throw new Error('payment_refund_owner_missing');
        await admin.rpc('wallet_release', {
          p_owner_id: payment.profile_id,
          p_currency_code: payment.currency_code,
          p_amount: refund.amount,
          p_idempotency_key: `payment-refund-release:${refund.id}`,
          p_reference_type: 'payment_refund',
          p_reference_id: refund.id,
          p_metadata: {payment_id: payment.id}
        });
        await admin
          .from('payment_refunds')
          .update({status: 'failed', failure_code: 'provider_refund_failed'})
          .eq('id', refund.id);
      }
    } else if (event.dispute) {
      await admin.from('payment_disputes').upsert(
        {
          payment_id: payment.id,
          provider_dispute_id: event.dispute.id,
          status: event.dispute.status,
          amount: event.dispute.amount,
          currency_code: event.dispute.currencyCode,
          reason: event.dispute.reason,
          metadata: event.raw
        },
        {onConflict: 'provider_dispute_id'}
      );
      await admin.from('payments').update({status: event.status}).eq('id', payment.id);
    } else if (event.status === 'paid') {
      const settlement =
        payment.purpose === 'order'
          ? await admin.rpc('settle_order_payment', {
              p_payment_id: payment.id,
              p_received_amount: event.receivedAmount ?? payment.payable_amount,
              p_provider_event_id: event.eventId
            })
          : await admin.rpc('settle_wallet_topup', {
              p_payment_id: payment.id,
              p_received_amount: event.receivedAmount ?? payment.payable_amount,
              p_provider_event_id: event.eventId
            });
      const {error} = settlement;
      if (error) throw error;
      if (payment.purpose === 'wallet_topup' && payment.profile_id) {
        try {
          await notify(
            payment.profile_id,
            'wallet.topup_confirmed',
            {
              amount_minor: payment.requested_amount,
              currency: payment.currency_code,
              wallet_url: '/account/wallet'
            },
            {
              idempotencyKey: `topup-settled:${payment.id}`,
              sourceType: 'payment',
              sourceId: payment.id
            }
          );
        } catch {
          /* Do not roll back a verified provider event for a notification failure. */
        }
      }
      if (event.savedMethod && payment.profile_id) {
        await admin.from('saved_payment_methods').upsert(
          {
            profile_id: payment.profile_id,
            provider_code: payment.provider_code,
            provider_customer_id: event.savedMethod.providerCustomerId,
            provider_payment_method_id: event.savedMethod.providerPaymentMethodId
          },
          {onConflict: 'provider_code,provider_payment_method_id'}
        );
      }
    } else {
      await admin.from('payments').update({status: event.status}).eq('id', payment.id);
    }
    await admin
      .from('payment_webhook_events')
      .update({status: 'processed', processed_at: new Date().toISOString()})
      .eq('id', record.id);
    return {replayed: false, status: 'processed'};
  } catch (cause) {
    await admin
      .from('payment_webhook_events')
      .update({
        status: 'failed',
        error_code: cause instanceof Error ? cause.message.slice(0, 120) : 'unknown'
      })
      .eq('id', record.id);
    throw cause;
  }
}

export function webhookPayloadForLog(payload: Json): Json {
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') return {};
  const copy = {...payload};
  for (const key of ['email', 'phone', 'address', 'billing_details', 'customer']) delete copy[key];
  return copy;
}
