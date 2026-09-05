import 'server-only';

import webpush from 'web-push';

import {createAdminClient} from '@/lib/supabase/admin';
import type {NotificationAdapter} from '../types';

async function jsonRequest(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`notification_provider_${response.status}`);
  return (await response.json()) as Record<string, unknown>;
}
export const emailAdapter: NotificationAdapter = {
  channel: 'email',
  async send(target, content) {
    if (!target.email) throw new Error('email_destination_missing');
    const key = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!key || !from) throw new Error('resend_not_configured');
    const result = await jsonRequest('https://api.resend.com/emails', {
      method: 'POST',
      headers: {authorization: `Bearer ${key}`, 'content-type': 'application/json'},
      body: JSON.stringify({
        from,
        to: target.email,
        subject: content.subject ?? 'Nexora',
        html: `<main dir="${target.locale === 'ar' ? 'rtl' : 'ltr'}"><p>${escapeHtml(content.body)}</p>${content.actionUrl ? `<a href="${absolute(content.actionUrl)}">Nexora</a>` : ''}</main>`
      })
    });
    return {providerMessageId: typeof result.id === 'string' ? result.id : null};
  }
};
export const whatsappAdapter: NotificationAdapter = {
  channel: 'whatsapp',
  async send(target, content, data) {
    if (!target.externalId) throw new Error('whatsapp_not_linked');
    const token = process.env.WHATSAPP_ACCESS_TOKEN,
      phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneId || !content.providerTemplateName)
      throw new Error('whatsapp_not_configured');
    const parameters = Object.values(data)
      .filter((v): v is string | number | boolean =>
        ['string', 'number', 'boolean'].includes(typeof v)
      )
      .slice(0, 10)
      .map((v) => ({type: 'text', text: String(v)}));
    const result = await jsonRequest(`https://graph.facebook.com/v23.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {authorization: `Bearer ${token}`, 'content-type': 'application/json'},
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: target.externalId,
        type: 'template',
        template: {
          name: content.providerTemplateName,
          language: {code: target.locale === 'ar' ? 'ar' : 'en'},
          components: parameters.length ? [{type: 'body', parameters}] : []
        }
      })
    });
    const messages = Array.isArray(result.messages) ? result.messages : [];
    const first = messages[0] as Record<string, unknown> | undefined;
    return {providerMessageId: typeof first?.id === 'string' ? first.id : null};
  }
};
export const telegramAdapter: NotificationAdapter = {
  channel: 'telegram',
  async send(target, content) {
    if (!target.externalId) throw new Error('telegram_not_linked');
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error('telegram_not_configured');
    const result = await jsonRequest(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        chat_id: target.externalId,
        text: content.body,
        reply_markup: content.actionUrl
          ? {inline_keyboard: [[{text: 'Nexora', url: absolute(content.actionUrl)}]]}
          : undefined
      })
    });
    const message = result.result as Record<string, unknown> | undefined;
    return {providerMessageId: message?.message_id ? String(message.message_id) : null};
  }
};
export const pushAdapter: NotificationAdapter = {
  channel: 'push',
  async send(target, content, data) {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) throw new Error('push_not_configured');
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? 'mailto:support@nexora.store',
      publicKey,
      privateKey
    );
    const admin = createAdminClient();
    const {data: rows} = await admin
      .from('push_subscriptions')
      .select('*')
      .eq('profile_id', target.userId)
      .is('revoked_at', null);
    if (!rows?.length) throw new Error('push_not_subscribed');
    await Promise.all(
      rows.map(async (row) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: String(row.endpoint),
              keys: {p256dh: String(row.p256dh), auth: String(row.auth_secret)}
            },
            JSON.stringify({
              title: content.subject ?? 'Nexora',
              body: content.body,
              url: content.actionUrl,
              data
            })
          );
        } catch (error) {
          const status = (error as {statusCode?: number}).statusCode;
          if (status === 404 || status === 410)
            await admin
              .from('push_subscriptions')
              .update({revoked_at: new Date().toISOString()})
              .eq('id', row.id);
          throw error;
        }
      })
    );
    return {providerMessageId: null, metadata: {subscriptions: rows.length}};
  }
};
export const smsAdapter: NotificationAdapter = {
  channel: 'sms',
  async send(target, content) {
    if (!target.phone) throw new Error('sms_destination_missing');
    const endpoint = process.env.SMS_ADAPTER_ENDPOINT,
      token = process.env.SMS_ADAPTER_TOKEN;
    if (!endpoint || !token) throw new Error('sms_adapter_not_configured');
    const result = await jsonRequest(endpoint, {
      method: 'POST',
      headers: {authorization: `Bearer ${token}`, 'content-type': 'application/json'},
      body: JSON.stringify({to: target.phone, message: content.body})
    });
    return {providerMessageId: typeof result.id === 'string' ? result.id : null};
  }
};
export const inAppAdapter: NotificationAdapter = {
  channel: 'in_app',
  async send() {
    return {providerMessageId: null};
  }
};
export const adapters: Record<NotificationAdapter['channel'], NotificationAdapter> = {
  email: emailAdapter,
  whatsapp: whatsappAdapter,
  telegram: telegramAdapter,
  push: pushAdapter,
  sms: smsAdapter,
  in_app: inAppAdapter
};

export async function sendWhatsAppText(to: string, body: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN,
    phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) throw new Error('whatsapp_not_configured');
  return jsonRequest(`https://graph.facebook.com/v23.0/${phoneId}/messages`, {
    method: 'POST',
    headers: {authorization: `Bearer ${token}`, 'content-type': 'application/json'},
    body: JSON.stringify({messaging_product: 'whatsapp', to, type: 'text', text: {body}})
  });
}
export async function sendTelegramText(chatId: string, body: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('telegram_not_configured');
  return jsonRequest(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({chat_id: chatId, text: body})
  });
}
function absolute(path: string) {
  return new URL(path, process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').toString();
}
function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
