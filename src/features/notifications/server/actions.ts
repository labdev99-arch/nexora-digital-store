'use server';

import {createHash, randomBytes, randomInt} from 'node:crypto';
import {revalidatePath} from 'next/cache';

import {requirePermission} from '@/features/auth/server/authorization';
import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {sendWhatsAppText} from './adapters';
import {encryptExternalId, hashExternalId} from './connection-crypto';
import {
  matrixSchema,
  pushSubscriptionSchema,
  quietHoursSchema,
  whatsappStartSchema,
  whatsappVerifySchema
} from '../schemas';

type Result<T = undefined> = {ok: true; data?: T} | {ok: false; error: string};
const codeHash = (value: string) =>
  createHash('sha256')
    .update(`${process.env.NOTIFICATION_HASH_SALT ?? ''}:${value}`)
    .digest('hex');
export async function updateEventPreferenceAction(raw: unknown): Promise<Result> {
  const parsed = matrixSchema.safeParse(raw);
  if (!parsed.success) return {ok: false, error: 'invalid_preference'};
  const context = await requirePermission(parsed.data.locale, 'account.update');
  const supabase = await createClient();
  const {error} = await supabase.from('notification_event_preferences').upsert(
    {
      profile_id: context.user.id,
      event_key: parsed.data.eventKey,
      channel: parsed.data.channel,
      enabled: parsed.data.enabled
    },
    {onConflict: 'profile_id,event_key,channel'}
  );
  return error ? {ok: false, error: 'save_failed'} : {ok: true};
}
export async function updateQuietHoursAction(raw: unknown): Promise<Result> {
  const parsed = quietHoursSchema.safeParse(raw);
  if (!parsed.success) return {ok: false, error: 'invalid_quiet_hours'};
  const context = await requirePermission(parsed.data.locale, 'account.update');
  const supabase = await createClient();
  const {error} = await supabase.from('notification_settings').upsert(
    {
      profile_id: context.user.id,
      timezone: parsed.data.timezone,
      quiet_hours_enabled: parsed.data.enabled,
      quiet_start: parsed.data.start,
      quiet_end: parsed.data.end
    },
    {onConflict: 'profile_id'}
  );
  return error ? {ok: false, error: 'save_failed'} : {ok: true};
}
export async function startWhatsAppVerificationAction(raw: unknown): Promise<Result> {
  const parsed = whatsappStartSchema.safeParse(raw);
  if (!parsed.success) return {ok: false, error: 'invalid_phone'};
  const context = await requirePermission(parsed.data.locale, 'account.update');
  const admin = createAdminClient();
  const code = String(randomInt(100000, 1000000));
  await admin.from('notification_verifications').insert({
    profile_id: context.user.id,
    channel: 'whatsapp',
    destination_hash: hashExternalId(parsed.data.phone),
    code_hash: codeHash(code),
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString()
  });
  try {
    await sendWhatsAppText(
      parsed.data.phone,
      parsed.data.locale === 'ar'
        ? `رمز تحقق نكسورا: ${code}`
        : `Your Nexora verification code: ${code}`
    );
  } catch {
    return {ok: false, error: 'verification_send_failed'};
  }
  return {ok: true};
}
export async function confirmWhatsAppVerificationAction(raw: unknown): Promise<Result> {
  const parsed = whatsappVerifySchema.safeParse(raw);
  if (!parsed.success) return {ok: false, error: 'invalid_code'};
  const context = await requirePermission(parsed.data.locale, 'account.update');
  const admin = createAdminClient();
  const {data: verification} = await admin
    .from('notification_verifications')
    .select('*')
    .eq('profile_id', context.user.id)
    .eq('channel', 'whatsapp')
    .eq('destination_hash', hashExternalId(parsed.data.phone))
    .is('verified_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', {ascending: false})
    .limit(1)
    .maybeSingle();
  if (!verification || verification.code_hash !== codeHash(parsed.data.code))
    return {ok: false, error: 'invalid_code'};
  await admin
    .from('notification_verifications')
    .update({verified_at: new Date().toISOString()})
    .eq('id', verification.id);
  await admin.from('notification_channel_connections').upsert(
    {
      profile_id: context.user.id,
      channel: 'whatsapp',
      status: 'verified',
      external_id_ciphertext: encryptExternalId(parsed.data.phone),
      external_id_hash: hashExternalId(parsed.data.phone),
      display_hint: `••••${parsed.data.phone.slice(-4)}`,
      verified_at: new Date().toISOString(),
      revoked_at: null
    },
    {onConflict: 'profile_id,channel'}
  );
  await admin.from('notification_settings').upsert(
    {
      profile_id: context.user.id,
      timezone: 'UTC',
      whatsapp_opted_in_at: new Date().toISOString(),
      whatsapp_verified_at: new Date().toISOString()
    },
    {onConflict: 'profile_id'}
  );
  revalidatePath(`/${parsed.data.locale}/account/notifications`);
  return {ok: true};
}
export async function createTelegramLinkAction(
  locale: 'en' | 'ar'
): Promise<Result<{url: string}>> {
  const context = await requirePermission(locale, 'account.update');
  const token = randomBytes(24).toString('base64url');
  const admin = createAdminClient();
  await admin.from('notification_verifications').insert({
    profile_id: context.user.id,
    channel: 'telegram',
    destination_hash: codeHash(token),
    code_hash: codeHash(token),
    expires_at: new Date(Date.now() + 30 * 60_000).toISOString()
  });
  const bot = process.env.TELEGRAM_BOT_USERNAME;
  if (!bot) return {ok: false, error: 'telegram_not_configured'};
  return {ok: true, data: {url: `https://t.me/${bot}?start=${token}`}};
}
export async function savePushSubscriptionAction(raw: unknown): Promise<Result> {
  const parsed = pushSubscriptionSchema.safeParse(raw);
  if (!parsed.success) return {ok: false, error: 'invalid_subscription'};
  const context = await requirePermission(parsed.data.locale, 'account.update');
  const supabase = await createClient();
  const endpointHash = createHash('sha256').update(parsed.data.endpoint).digest('hex');
  const {error} = await supabase.from('push_subscriptions').upsert(
    {
      profile_id: context.user.id,
      endpoint: parsed.data.endpoint,
      endpoint_hash: endpointHash,
      p256dh: parsed.data.keys.p256dh,
      auth_secret: parsed.data.keys.auth,
      user_agent: null,
      revoked_at: null
    },
    {onConflict: 'endpoint_hash'}
  );
  return error ? {ok: false, error: 'save_failed'} : {ok: true};
}
export async function markNotificationReadAction(id: string) {
  const supabase = await createClient();
  await supabase.rpc('mark_notification_read', {p_notification_id: id});
}
export async function markAllNotificationsReadAction() {
  const supabase = await createClient();
  await supabase.rpc('mark_all_notifications_read');
}

export async function setGlobalUnsubscribeAction(locale: 'en' | 'ar', unsubscribed: boolean) {
  const context = await requirePermission(locale, 'account.update');
  const supabase = await createClient();
  const {error} = await supabase.from('notification_settings').upsert(
    {
      profile_id: context.user.id,
      timezone: 'UTC',
      global_unsubscribed_at: unsubscribed ? new Date().toISOString() : null
    },
    {onConflict: 'profile_id'}
  );
  revalidatePath(`/${locale}/account/notifications`);
  return error ? ({ok: false, error: 'save_failed'} as const) : ({ok: true} as const);
}
