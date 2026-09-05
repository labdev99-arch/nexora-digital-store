'use server';

import {randomUUID} from 'node:crypto';

import {revalidatePath} from 'next/cache';

import {requireUser} from '@/features/auth/server/authorization';
import {createClient} from '@/lib/supabase/server';
import {
  affiliateApplicationSchema,
  affiliateLinkSchema,
  affiliatePayoutSchema,
  loyaltyRedemptionSchema
} from '../schemas';

export async function applyForAffiliateAction(locale: string, formData: FormData) {
  await requireUser(locale);
  const parsed = affiliateApplicationSchema.safeParse({
    message: formData.get('message') || undefined
  });
  if (!parsed.success) return;
  const supabase = await createClient();
  await supabase.rpc('apply_for_affiliate', {p_message: parsed.data.message ?? null});
  revalidatePath(`/${locale}/account/affiliate`);
}

export async function createAffiliateLinkAction(locale: string, formData: FormData) {
  await requireUser(locale);
  const parsed = affiliateLinkSchema.safeParse({
    name: formData.get('name'),
    destinationPath: formData.get('destinationPath'),
    campaign: formData.get('campaign') || undefined
  });
  if (!parsed.success) return;
  const supabase = await createClient();
  await supabase.rpc('create_affiliate_link', {
    p_name: parsed.data.name,
    p_destination_path: parsed.data.destinationPath,
    p_campaign: parsed.data.campaign ?? null
  });
  revalidatePath(`/${locale}/account/affiliate`);
}

export async function requestAffiliatePayoutAction(locale: string, formData: FormData) {
  await requireUser(locale);
  const parsed = affiliatePayoutSchema.safeParse({
    amount: formData.get('amount'),
    currency: formData.get('currency'),
    destinationKind: formData.get('destinationKind'),
    destinationDetails: formData.get('destinationDetails') || undefined
  });
  if (!parsed.success) return;
  const supabase = await createClient();
  await supabase.rpc('request_affiliate_payout', {
    p_amount: parsed.data.amount,
    p_currency_code: parsed.data.currency,
    p_destination_kind: parsed.data.destinationKind,
    p_destination: parsed.data.destinationDetails ? {details: parsed.data.destinationDetails} : {}
  });
  revalidatePath(`/${locale}/account/affiliate`);
}

export async function redeemLoyaltyAction(locale: string, formData: FormData) {
  await requireUser(locale);
  const parsed = loyaltyRedemptionSchema.safeParse({
    kind: formData.get('kind'),
    idempotencyKey: formData.get('idempotencyKey') || randomUUID()
  });
  if (!parsed.success) return;
  const supabase = await createClient();
  await supabase.rpc('redeem_loyalty_points', {
    p_kind: parsed.data.kind,
    p_idempotency_key: parsed.data.idempotencyKey
  });
  revalidatePath(`/${locale}/account/loyalty`);
}
