import 'server-only';

import {createHash, randomUUID} from 'node:crypto';
import sharp from 'sharp';

import {createAdminClient} from '@/lib/supabase/admin';
import type {Json, UserRole} from '@/lib/supabase/database.types';
import {notify} from '@/features/notifications/server/service';
import {getAiProvider} from '@/features/ai/server/provider';
import {runProofVision} from '@/features/ai/server/runtime';
import {idempotencyKeySchema, initiateTopupSchema} from '../schemas/payment';
import type {PaymentMethodRow, PaymentRow} from '../types';
import {getPaymentProvider} from './providers/registry';

type UserIdentity = {
  id: string;
  email: string | null;
  roles: UserRole[];
  countryCode: string | null;
};

function feeFor(amount: number, method: PaymentMethodRow): number {
  return method.fee_fixed + Math.ceil((amount * method.fee_bps) / 10_000);
}

function localized(value: Json, locale: string): string[] {
  if (!value || Array.isArray(value) || typeof value !== 'object') return [];
  const candidate = value[locale] ?? value.en ?? value.ar;
  return Array.isArray(candidate)
    ? candidate.filter((item): item is string => typeof item === 'string')
    : [];
}

export async function listAvailablePaymentMethods(identity: UserIdentity, currencyCode?: string) {
  const admin = createAdminClient();
  const {data, error} = await admin
    .from('payment_methods')
    .select('*')
    .eq('enabled', true)
    .is('deleted_at', null)
    .order('sort_order');
  if (error) throw new Error('payment_methods_failed');
  return (data as PaymentMethodRow[]).filter((method) => {
    if (currencyCode && !method.allowed_currencies.includes(currencyCode)) return false;
    if (
      method.allowed_countries.length &&
      (!identity.countryCode || !method.allowed_countries.includes(identity.countryCode))
    )
      return false;
    return identity.roles.some((role) => method.allowed_tiers.includes(role));
  });
}

export async function initiateWalletTopup(
  identity: UserIdentity,
  raw: unknown,
  idempotencyKey: string,
  locale: string
): Promise<PaymentRow> {
  const key = idempotencyKeySchema.parse(idempotencyKey);
  const input = initiateTopupSchema.parse(raw);
  const admin = createAdminClient();

  const {data: replay} = await admin
    .from('payments')
    .select('*')
    .eq('profile_id', identity.id)
    .eq('idempotency_key', key)
    .maybeSingle();
  if (replay) return replay as PaymentRow;

  const methods = await listAvailablePaymentMethods(identity, input.currencyCode);
  const method = methods.find((item) => item.code === input.methodCode);
  if (!method) throw new Error('payment_method_unavailable');
  if (input.amount < method.min_amount || input.amount > method.max_amount)
    throw new Error('payment_amount_out_of_range');
  const feeAmount = feeFor(input.amount, method);
  let providerCustomerId: string | undefined;
  let savedPaymentMethodId: string | undefined;
  if (method.driver === 'stripe') {
    const {data: previous} = await admin
      .from('payments')
      .select('provider_customer_id')
      .eq('profile_id', identity.id)
      .eq('provider_code', method.code)
      .not('provider_customer_id', 'is', null)
      .order('created_at', {ascending: false})
      .limit(1)
      .maybeSingle();
    providerCustomerId = previous?.provider_customer_id ?? undefined;
    if (input.savedPaymentMethodId) {
      const {data: saved} = await admin
        .from('saved_payment_methods')
        .select('provider_payment_method_id,provider_customer_id')
        .eq('id', input.savedPaymentMethodId)
        .eq('profile_id', identity.id)
        .is('deleted_at', null)
        .maybeSingle();
      if (!saved) throw new Error('saved_payment_method_invalid');
      savedPaymentMethodId = saved.provider_payment_method_id;
      providerCustomerId = saved.provider_customer_id;
    }
  }
  const paymentId = randomUUID();
  const insert = {
    id: paymentId,
    profile_id: identity.id,
    payment_method_id: method.id,
    provider_code: method.code,
    currency_code: input.currencyCode,
    requested_amount: input.amount,
    fee_amount: feeAmount,
    payable_amount: input.amount + feeAmount,
    idempotency_key: key,
    sandbox_mode: method.sandbox_mode,
    status: 'created' as const
  };
  const {error: createError} = await admin.from('payments').insert(insert);
  if (createError) {
    const {data: raced} = await admin
      .from('payments')
      .select('*')
      .eq('profile_id', identity.id)
      .eq('idempotency_key', key)
      .maybeSingle();
    if (raced) return raced as PaymentRow;
    throw new Error('payment_create_failed');
  }

  try {
    const provider = getPaymentProvider(method.driver);
    const initiation = await provider.initiate({
      paymentId,
      profileId: identity.id,
      email: identity.email,
      amount: input.amount,
      feeAmount,
      payableAmount: input.amount + feeAmount,
      currencyCode: input.currencyCode,
      returnUrl: input.returnUrl,
      idempotencyKey: key,
      sandbox: method.sandbox_mode,
      locale,
      config: method.config,
      savedPaymentMethodId,
      providerCustomerId,
      crypto: input.crypto
    });
    const metadata = initiation.metadata ?? {};
    const {data: payment, error} = await admin
      .from('payments')
      .update({
        provider_payment_id: initiation.providerPaymentId,
        payment_reference: initiation.reference,
        status: initiation.status,
        client_action: initiation.clientAction,
        provider_metadata: metadata,
        provider_customer_id:
          metadata && typeof metadata === 'object' && !Array.isArray(metadata)
            ? String(metadata.providerCustomerId ?? providerCustomerId ?? '') || undefined
            : providerCustomerId,
        expires_at: initiation.expiresAt,
        rate_locked_at: initiation.rateExpiresAt ? new Date().toISOString() : undefined,
        rate_expires_at: initiation.rateExpiresAt
      })
      .eq('id', paymentId)
      .select('*')
      .single();
    if (error) throw error;

    if (
      method.driver === 'nowpayments' &&
      input.crypto &&
      metadata &&
      typeof metadata === 'object' &&
      !Array.isArray(metadata)
    ) {
      const clientAction = initiation.clientAction as Record<string, Json>;
      await admin.from('crypto_payment_details').insert({
        payment_id: paymentId,
        asset: input.crypto.asset,
        network: input.crypto.network,
        pay_address: String(clientAction.address ?? ''),
        expected_atomic: String(metadata.expectedAtomic ?? '1'),
        atomic_scale: Number(metadata.atomicScale ?? 6),
        required_confirmations: Number(metadata.requiredConfirmations ?? 12),
        quote_numerator: Number(metadata.quoteNumerator ?? input.amount),
        quote_denominator: Number(metadata.quoteDenominator ?? 1),
        expires_at: initiation.expiresAt ?? new Date(Date.now() + 30 * 60 * 1000).toISOString()
      });
    }
    await admin.from('payment_audit_logs').insert({
      payment_id: paymentId,
      actor_id: identity.id,
      actor_type: 'customer',
      action: 'payment.initiated',
      request_id: `initiate:${paymentId}`,
      after: {
        provider: method.code,
        amount: input.amount,
        fee: feeAmount,
        currency: input.currencyCode
      }
    });
    return payment as PaymentRow;
  } catch (cause) {
    await admin
      .from('payments')
      .update({
        status: 'failed',
        failure_code: 'provider_initiation_failed',
        failure_message: cause instanceof Error ? cause.message.slice(0, 250) : 'unknown'
      })
      .eq('id', paymentId);
    throw new Error('payment_provider_failed');
  }
}

export async function verifyAndSettlePayment(
  identity: UserIdentity,
  paymentId: string
): Promise<PaymentRow> {
  const admin = createAdminClient();
  const {data: payment, error} = await admin
    .from('payments')
    .select('*')
    .eq('id', paymentId)
    .eq('profile_id', identity.id)
    .single();
  if (error || !payment) throw new Error('payment_not_found');
  if (payment.wallet_transaction_id) return payment as PaymentRow;
  const {data: method} = await admin
    .from('payment_methods')
    .select('*')
    .eq('id', payment.payment_method_id)
    .single();
  if (!method || !payment.provider_payment_id) throw new Error('payment_provider_missing');
  const provider = getPaymentProvider(method.driver);
  const verification = await provider.verify(payment.provider_payment_id, {
    paymentId: payment.id,
    profileId: identity.id,
    email: identity.email,
    amount: payment.requested_amount,
    feeAmount: payment.fee_amount,
    payableAmount: payment.payable_amount,
    currencyCode: payment.currency_code,
    returnUrl: '',
    idempotencyKey: payment.idempotency_key,
    sandbox: payment.sandbox_mode,
    locale: 'en',
    config: method.config
  });
  if (!verification.verified || verification.status !== 'paid') {
    await admin.from('payments').update({status: verification.status}).eq('id', payment.id);
    throw new Error('payment_not_paid');
  }
  const eventId = verification.providerEventId ?? `verify:${payment.id}`;
  const settlement =
    payment.purpose === 'order'
      ? await admin.rpc('settle_order_payment', {
          p_payment_id: payment.id,
          p_received_amount: verification.receivedAmount ?? payment.payable_amount,
          p_provider_event_id: eventId
        })
      : await admin.rpc('settle_wallet_topup', {
          p_payment_id: payment.id,
          p_received_amount: verification.receivedAmount ?? payment.payable_amount,
          p_provider_event_id: eventId
        });
  const settlementError = settlement.error;
  if (settlementError) throw new Error('payment_settlement_failed');
  if (payment.purpose === 'wallet_topup') {
    try {
      await notify(
        identity.id,
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
      /* Payment settlement is authoritative; notification retries are best effort. */
    }
  }
  const {data: settled} = await admin.from('payments').select('*').eq('id', payment.id).single();
  return settled as PaymentRow;
}

async function perceptualHash(buffer: Buffer): Promise<string | null> {
  try {
    const {data} = await sharp(buffer)
      .resize(8, 8, {fit: 'fill'})
      .greyscale()
      .raw()
      .toBuffer({resolveWithObject: true});
    const average = data.reduce((sum, value) => sum + value, 0) / data.length;
    const bits = [...data].map((value) => (value >= average ? '1' : '0')).join('');
    return BigInt(`0b${bits}`).toString(16).padStart(16, '0');
  } catch {
    return null;
  }
}

type OcrResult = {
  amount: number | null;
  currency: string | null;
  reference: string | null;
  date: string | null;
  sender: string | null;
  confidenceBps: number;
  raw: Json;
};
async function ocrProof(
  buffer: Buffer,
  mimeType: string,
  expected: {amount: number; currency: string; reference: string | null},
  filename: string,
  profileId: string
): Promise<OcrResult> {
  const vision = await runProofVision({
    profileId,
    imageBase64: buffer.toString('base64'),
    mimeType,
    expected
  });
  if (vision) return {...vision, raw: {engine: getAiProvider().name}};
  const reference = filename.toUpperCase().match(/(?:WHS|OMT|BNK|CSH)-[A-F0-9]{6,}/)?.[0] ?? null;
  const amount = filename.match(/(?:^|[_-])(\d{2,10})(?:[_-]|\.)/)?.[1];
  return {
    amount: amount ? Number(amount) : null,
    currency: expected.currency,
    reference,
    date: null,
    sender: null,
    confidenceBps: reference ? 5000 : 1000,
    raw: {engine: 'sandbox_filename_heuristic'}
  };
}

export async function uploadPaymentProof(identity: UserIdentity, paymentId: string, file: File) {
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
  if (!allowed.has(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024)
    throw new Error('payment_proof_invalid');
  const admin = createAdminClient();
  const {data: payment, error} = await admin
    .from('payments')
    .select('*')
    .eq('id', paymentId)
    .eq('profile_id', identity.id)
    .single();
  if (error || !payment || !['awaiting_proof', 'under_review'].includes(payment.status))
    throw new Error('payment_proof_not_allowed');
  const buffer = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const phash = file.type === 'application/pdf' ? null : await perceptualHash(buffer);
  const extension =
    file.type === 'application/pdf'
      ? 'pdf'
      : (file.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'bin');
  const path = `${identity.id}/${payment.id}/${randomUUID()}.${extension}`;
  const {error: uploadError} = await admin.storage
    .from('payment-proofs')
    .upload(path, buffer, {contentType: file.type, upsert: false});
  if (uploadError) throw new Error('payment_proof_upload_failed');
  try {
    const {data: duplicates} = await admin
      .from('payment_proofs')
      .select('id,sha256,perceptual_hash')
      .or(`sha256.eq.${sha256}${phash ? `,perceptual_hash.eq.${phash}` : ''}`)
      .is('deleted_at', null)
      .limit(1);
    const duplicate = duplicates?.[0] ?? null;
    const {data: proof, error: proofError} = await admin
      .from('payment_proofs')
      .insert({
        payment_id: payment.id,
        profile_id: identity.id,
        storage_path: path,
        original_filename: file.name.slice(0, 255),
        mime_type: file.type,
        byte_size: file.size,
        sha256,
        perceptual_hash: phash,
        status: 'needs_review'
      })
      .select('*')
      .single();
    if (proofError) throw proofError;
    const ocr = await ocrProof(
      buffer,
      file.type,
      {
        amount: payment.payable_amount,
        currency: payment.currency_code,
        reference: payment.payment_reference
      },
      file.name,
      identity.id
    );
    const flags: string[] = [];
    if (duplicate) flags.push('possible_duplicate');
    if (ocr.amount !== null && ocr.amount !== payment.payable_amount) flags.push('amount_mismatch');
    if (payment.payment_reference && ocr.reference && ocr.reference !== payment.payment_reference)
      flags.push('reference_mismatch');
    if (!ocr.amount) flags.push('amount_not_detected');
    if (!ocr.reference) flags.push('reference_not_detected');
    await admin.from('payment_proof_checks').insert({
      proof_id: proof.id,
      engine: getAiProvider().enabled ? 'ai_provider' : 'sandbox_heuristic',
      extracted_amount: ocr.amount,
      extracted_currency: ocr.currency,
      extracted_reference: ocr.reference,
      extracted_date: ocr.date,
      extracted_sender: ocr.sender,
      ai_model: getAiProvider().enabled ? getAiProvider().name : null,
      confidence_bps: ocr.confidenceBps,
      flags,
      duplicate_of_proof_id: duplicate?.id,
      raw_result: ocr.raw
    });
    await admin.from('payment_verification_queue').insert({
      payment_id: payment.id,
      proof_id: proof.id,
      status: 'needs_review',
      priority: flags.includes('possible_duplicate') ? 200 : 100
    });
    await admin.from('payments').update({status: 'under_review'}).eq('id', payment.id);
    await admin.from('payment_audit_logs').insert({
      payment_id: payment.id,
      actor_id: identity.id,
      actor_type: 'customer',
      action: 'proof.uploaded',
      request_id: `proof:${proof.id}`,
      after: {proof_id: proof.id, flags}
    });
    return {proofId: proof.id, flags};
  } catch (cause) {
    await admin.storage.from('payment-proofs').remove([path]);
    throw cause;
  }
}

export function paymentInstructions(method: PaymentMethodRow, locale: string) {
  return localized(method.instructions, locale);
}

export async function refundWalletTopup(
  actorId: string,
  input: {paymentId: string; amount: number; reason: string; idempotencyKey: string}
) {
  const admin = createAdminClient();
  const {data: existing} = await admin
    .from('payment_refunds')
    .select('*')
    .eq('idempotency_key', input.idempotencyKey)
    .maybeSingle();
  if (existing) return existing;
  const {data: payment, error} = await admin
    .from('payments')
    .select('*')
    .eq('id', input.paymentId)
    .single();
  if (
    error ||
    !payment ||
    !payment.profile_id ||
    payment.purpose !== 'wallet_topup' ||
    !payment.provider_payment_id ||
    !['paid', 'partially_refunded'].includes(payment.status) ||
    input.amount > payment.credited_amount - payment.refunded_amount
  )
    throw new Error('payment_refund_amount_invalid');
  const {data: method} = await admin
    .from('payment_methods')
    .select('*')
    .eq('id', payment.payment_method_id)
    .single();
  if (!method) throw new Error('payment_provider_missing');
  const provider = getPaymentProvider(method.driver);
  if (!provider.capabilities.has('refunds')) throw new Error('payment_refund_manual_required');
  const {data: refund, error: createError} = await admin
    .from('payment_refunds')
    .insert({
      payment_id: payment.id,
      amount: input.amount,
      currency_code: payment.currency_code,
      idempotency_key: input.idempotencyKey,
      reason: input.reason,
      requested_by: actorId
    })
    .select('*')
    .single();
  if (createError || !refund) throw new Error('payment_refund_create_failed');
  const {error: reserveError} = await admin.rpc('reserve_payment_refund', {
    p_refund_id: refund.id
  });
  if (reserveError) throw new Error(reserveError.message);
  try {
    const providerRefund = await provider.refund(
      payment.provider_payment_id,
      input.amount,
      payment.currency_code,
      input.idempotencyKey
    );
    if (providerRefund.status === 'failed') throw new Error('provider_refund_failed');
    if (providerRefund.status === 'pending') {
      const {data: pending} = await admin
        .from('payment_refunds')
        .update({provider_refund_id: providerRefund.providerRefundId})
        .eq('id', refund.id)
        .select('*')
        .single();
      return pending ?? refund;
    }
    const {data: finalized, error: finalizeError} = await admin.rpc('finalize_payment_refund', {
      p_refund_id: refund.id,
      p_provider_refund_id: providerRefund.providerRefundId
    });
    if (finalizeError) throw finalizeError;
    return finalized;
  } catch (cause) {
    await admin.rpc('wallet_release', {
      p_owner_id: payment.profile_id,
      p_currency_code: payment.currency_code,
      p_amount: input.amount,
      p_idempotency_key: `payment-refund-release:${refund.id}`,
      p_reference_type: 'payment_refund',
      p_reference_id: refund.id,
      p_metadata: {payment_id: payment.id}
    });
    await admin
      .from('payment_refunds')
      .update({
        status: 'failed',
        failure_code: cause instanceof Error ? cause.message.slice(0, 120) : 'unknown'
      })
      .eq('id', refund.id);
    throw cause;
  }
}
