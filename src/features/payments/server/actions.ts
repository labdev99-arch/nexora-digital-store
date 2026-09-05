'use server';

import {revalidatePath} from 'next/cache';

import {requirePermission} from '@/features/auth/server/authorization';
import {createClient} from '@/lib/supabase/server';
import {
  paymentMethodConfigSchema,
  refundPaymentSchema,
  reviewProofSchema
} from '../schemas/payment';
import {refundWalletTopup} from './payment-service';

export type PaymentActionResult = {ok: true} | {ok: false; error: string};

export async function reviewPaymentProofAction(
  locale: string,
  input: unknown
): Promise<PaymentActionResult> {
  await requirePermission(locale, 'finance.manage');
  const parsed = reviewProofSchema.safeParse(input);
  if (!parsed.success) return {ok: false, error: 'invalid_review'};
  const supabase = await createClient();
  const {error} = await supabase.rpc('review_payment_proof', {
    p_queue_id: parsed.data.queueId,
    p_approve: parsed.data.approve,
    p_reason: parsed.data.reason
  });
  if (error)
    return {ok: false, error: error.message.includes('payment_') ? error.message : 'review_failed'};
  revalidatePath(`/${locale}/admin/payments`);
  revalidatePath(`/${locale}/account/wallet`);
  return {ok: true};
}

export async function updatePaymentMethodAction(
  locale: string,
  input: unknown
): Promise<PaymentActionResult> {
  const context = await requirePermission(locale, 'finance.manage');
  const parsed = paymentMethodConfigSchema.safeParse(input);
  if (!parsed.success || parsed.data.maxAmount < parsed.data.minAmount)
    return {ok: false, error: 'invalid_config'};
  const supabase = await createClient();
  const {error} = await supabase
    .from('payment_methods')
    .update({
      enabled: parsed.data.enabled,
      sandbox_mode: parsed.data.sandboxMode,
      min_amount: parsed.data.minAmount,
      max_amount: parsed.data.maxAmount,
      fee_fixed: parsed.data.feeFixed,
      fee_bps: parsed.data.feeBps,
      allowed_currencies: parsed.data.allowedCurrencies,
      allowed_countries: parsed.data.allowedCountries,
      allowed_tiers: parsed.data.allowedTiers,
      instructions: parsed.data.instructions,
      updated_by: context.user.id
    })
    .eq('id', parsed.data.id);
  if (error) return {ok: false, error: 'config_failed'};
  revalidatePath(`/${locale}/admin/payments/methods`);
  return {ok: true};
}

export async function refundPaymentAction(
  locale: string,
  input: unknown
): Promise<PaymentActionResult> {
  const context = await requirePermission(locale, 'finance.manage');
  const parsed = refundPaymentSchema.safeParse(input);
  if (!parsed.success) return {ok: false, error: 'invalid_refund'};
  try {
    await refundWalletTopup(context.user.id, parsed.data);
    revalidatePath(`/${locale}/admin/payments`);
    revalidatePath(`/${locale}/account/wallet`);
    return {ok: true};
  } catch (cause) {
    return {ok: false, error: cause instanceof Error ? cause.message : 'refund_failed'};
  }
}
