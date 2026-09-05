import 'server-only';

import {createAdminClient} from '@/lib/supabase/admin';
import type {NotificationChannel, NotificationEventRow} from '@/lib/supabase/database.types';
import {formatMinorUnits} from '@/lib/money';
import {adapters} from './adapters';
import {decryptExternalId} from './connection-crypto';
import {renderTemplate} from './template';
import type {NotificationData, NotificationEvent} from '../types';

export async function notify(
  userId: string,
  event: NotificationEvent,
  data: NotificationData,
  options?: {idempotencyKey?: string; sourceType?: string; sourceId?: string}
) {
  const admin = createAdminClient();
  const {data: profile, error: profileError} = await admin
    .from('profiles')
    .select('locale_code')
    .eq('id', userId)
    .is('deleted_at', null)
    .single();
  if (profileError || !profile) throw new Error('notification_profile_not_found');
  const key = options?.idempotencyKey ?? `${event}:${options?.sourceId ?? crypto.randomUUID()}`;
  const {data: row, error} = await admin
    .from('notification_events')
    .upsert(
      {
        profile_id: userId,
        event_key: event,
        locale_code: profile.locale_code,
        data,
        idempotency_key: key,
        source_type: options?.sourceType ?? null,
        source_id: options?.sourceId ?? null
      },
      {onConflict: 'profile_id,idempotency_key', ignoreDuplicates: true}
    )
    .select('*')
    .maybeSingle();
  if (error) throw new Error('notification_enqueue_failed');
  return row;
}

const channels: NotificationChannel[] = ['in_app', 'email', 'push', 'whatsapp', 'telegram', 'sms'];
function eventGroup(event: string) {
  return event.startsWith('order.')
    ? 'order_updates'
    : event.startsWith('wallet.')
      ? 'transactional'
      : event.startsWith('support.')
        ? 'transactional'
        : 'promotions';
}
function isQuiet(settings: Record<string, unknown> | null) {
  if (!settings?.quiet_hours_enabled || !settings.quiet_start || !settings.quiet_end) return false;
  const timezone = typeof settings.timezone === 'string' ? settings.timezone : 'UTC';
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short'
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0),
    minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0),
    current = hour * 60 + minute;
  const parse = (v: unknown) => {
    const parts = String(v).split(':').map(Number);
    return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  };
  const start = parse(settings.quiet_start),
    end = parse(settings.quiet_end);
  return start <= end ? current >= start && current < end : current >= start || current < end;
}
export async function processNotificationBatch(limit = 50) {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const {data: events, error} = await admin
    .from('notification_events')
    .select('*')
    .is('processed_at', null)
    .lte('available_at', now)
    .order('created_at')
    .limit(limit);
  if (error) throw new Error('notification_queue_read_failed');
  let delivered = 0;
  for (const raw of events ?? []) {
    const event = raw as NotificationEventRow;
    try {
      const result = await processEvent(event);
      delivered += result.delivered;
      await admin
        .from('notification_events')
        .update(
          result.retryAt
            ? {available_at: result.retryAt, processed_at: null}
            : {processed_at: new Date().toISOString()}
        )
        .eq('id', event.id);
    } catch {
      /* retain for retry */
    }
  }
  return {processed: events?.length ?? 0, delivered};
}
async function processEvent(event: NotificationEventRow) {
  const admin = createAdminClient();
  const [
    {data: profile},
    {data: settings},
    {data: matrix},
    {data: legacy},
    {data: connections},
    {data: templates},
    {data: user}
  ] = await Promise.all([
    admin.from('profiles').select('phone,locale_code').eq('id', event.profile_id).single(),
    admin
      .from('notification_settings')
      .select('*')
      .eq('profile_id', event.profile_id)
      .maybeSingle(),
    admin
      .from('notification_event_preferences')
      .select('*')
      .eq('profile_id', event.profile_id)
      .eq('event_key', event.event_key),
    admin.from('notification_preferences').select('*').eq('profile_id', event.profile_id),
    admin
      .from('notification_channel_connections')
      .select('*')
      .eq('profile_id', event.profile_id)
      .eq('status', 'verified'),
    admin
      .from('notification_templates')
      .select('*')
      .eq('template_key', event.event_key)
      .eq('locale_code', event.locale_code)
      .eq('active', true)
      .is('deleted_at', null),
    admin.auth.admin.getUserById(event.profile_id)
  ]);
  const quiet = isQuiet(settings as Record<string, unknown> | null);
  const baseData = (event.data ?? {}) as NotificationData;
  const data: NotificationData = {
    ...baseData,
    ...(baseData.wallet_url === '/account/wallet'
      ? {wallet_url: `/${event.locale_code}/account/wallet`}
      : {}),
    ...(typeof baseData.amount_minor === 'number' && typeof baseData.currency === 'string'
      ? {
          amount: formatMinorUnits(
            baseData.amount_minor,
            baseData.currency,
            event.locale_code === 'ar' ? 'ar' : 'en'
          )
        }
      : {})
  };
  let count = 0;
  let retryAt: string | null = null;
  for (const channel of channels) {
    const explicit = matrix?.find((row) => row.channel === channel);
    const old = legacy?.find((row) => row.channel === channel);
    const enabled = explicit
      ? Boolean(explicit.enabled)
      : old
        ? Boolean(old[eventGroup(event.event_key)])
        : channel === 'in_app';
    const template = templates?.find((row) => row.channel === channel);
    const connection = connections?.find((row) => row.channel === channel);
    const shouldSuppress =
      !enabled ||
      !template ||
      Boolean(settings?.global_unsubscribed_at) ||
      (quiet && channel !== 'in_app');
    const {data: existing} = await admin
      .from('notification_deliveries')
      .select('*')
      .eq('event_id', event.id)
      .eq('channel', channel)
      .maybeSingle();
    if (existing && ['sent', 'delivered', 'suppressed', 'dead_letter'].includes(existing.status))
      continue;
    const attempts = shouldSuppress
      ? Number(existing?.attempts ?? 0)
      : Number(existing?.attempts ?? 0) + 1;
    const {data: delivery} = await admin
      .from('notification_deliveries')
      .upsert(
        {
          event_id: event.id,
          profile_id: event.profile_id,
          channel,
          status: shouldSuppress ? 'suppressed' : 'processing',
          attempts,
          next_attempt_at: new Date().toISOString()
        },
        {onConflict: 'event_id,channel'}
      )
      .select('*')
      .single();
    if (shouldSuppress || !delivery) continue;
    const rendered = renderTemplate(
      {
        subject: template.subject,
        body: template.body,
        provider_template_name: template.provider_template_name
      },
      data,
      event.locale_code
    );
    const target = {
      userId: event.profile_id,
      email: user.user?.email ?? null,
      phone: profile?.phone ? String(profile.phone) : null,
      externalId: connection?.external_id_ciphertext
        ? decryptExternalId(String(connection.external_id_ciphertext))
        : null,
      locale: event.locale_code
    };
    try {
      const result = await adapters[channel].send(target, rendered, data);
      if (channel === 'in_app')
        await admin.from('in_app_notifications').upsert(
          {
            delivery_id: delivery.id,
            profile_id: event.profile_id,
            event_key: event.event_key,
            title: rendered.subject ?? rendered.body,
            body: rendered.body,
            action_url: rendered.actionUrl,
            data
          },
          {onConflict: 'delivery_id'}
        );
      await admin
        .from('notification_deliveries')
        .update({
          status: 'sent',
          provider_message_id: result.providerMessageId,
          sent_at: new Date().toISOString(),
          last_error: null,
          metadata: result.metadata ?? {}
        })
        .eq('id', delivery.id);
      count++;
    } catch (cause) {
      const nextAttemptAt = new Date(
        Date.now() + Math.min(3600, 2 ** attempts * 30) * 1000
      ).toISOString();
      const deadLetter = attempts >= Number(delivery.max_attempts);
      await admin
        .from('notification_deliveries')
        .update({
          status: deadLetter ? 'dead_letter' : 'failed',
          failed_at: new Date().toISOString(),
          next_attempt_at: nextAttemptAt,
          last_error: cause instanceof Error ? cause.message.slice(0, 250) : 'provider_failed'
        })
        .eq('id', delivery.id);
      if (!deadLetter && (!retryAt || nextAttemptAt < retryAt)) retryAt = nextAttemptAt;
    }
  }
  return {delivered: count, retryAt};
}
