import {NextResponse} from 'next/server';
import {createHash} from 'node:crypto';
import {createAdminClient} from '@/lib/supabase/admin';
import {encryptExternalId, hashExternalId} from '@/features/notifications/server/connection-crypto';
import {sendTelegramText} from '@/features/notifications/server/adapters';

const tokenHash = (value: string) =>
  createHash('sha256')
    .update(`${process.env.NOTIFICATION_HASH_SALT ?? ''}:${value}`)
    .digest('hex');
export async function POST(request: Request) {
  if (
    !process.env.TELEGRAM_WEBHOOK_SECRET ||
    request.headers.get('x-telegram-bot-api-secret-token') !== process.env.TELEGRAM_WEBHOOK_SECRET
  )
    return NextResponse.json({error: 'invalid_signature'}, {status: 401});
  const update = (await request.json()) as TelegramUpdate;
  const message = update.message;
  if (!message?.text) return NextResponse.json({received: true});
  const admin = createAdminClient();
  await admin.from('notification_webhook_events').upsert(
    {
      provider: 'telegram',
      external_event_id: String(update.update_id),
      signature_valid: true,
      event_type: 'message',
      payload: update
    },
    {onConflict: 'provider,external_event_id', ignoreDuplicates: true}
  );
  const chatId = String(message.chat.id),
    text = message.text.trim();
  if (text.startsWith('/start ')) {
    const token = text.slice(7).trim();
    const {data: verification} = await admin
      .from('notification_verifications')
      .select('*')
      .eq('channel', 'telegram')
      .eq('code_hash', tokenHash(token))
      .is('verified_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (verification) {
      await admin
        .from('notification_verifications')
        .update({verified_at: new Date().toISOString()})
        .eq('id', verification.id);
      await admin.from('notification_channel_connections').upsert(
        {
          profile_id: verification.profile_id,
          channel: 'telegram',
          status: 'verified',
          external_id_ciphertext: encryptExternalId(chatId),
          external_id_hash: hashExternalId(chatId),
          display_hint: `@${message.from?.username ?? message.from?.first_name ?? chatId}`,
          verified_at: new Date().toISOString(),
          revoked_at: null,
          metadata: {locale: message.from?.language_code === 'ar' ? 'ar' : 'en'}
        },
        {onConflict: 'profile_id,channel'}
      );
      await sendTelegramText(
        chatId,
        message.from?.language_code === 'ar' ? 'تم ربط حسابك بنجاح.' : 'Your account is linked.'
      );
    }
  } else {
    const {data: connection} = await admin
      .from('notification_channel_connections')
      .select('*')
      .eq('channel', 'telegram')
      .eq('external_id_hash', hashExternalId(chatId))
      .eq('status', 'verified')
      .maybeSingle();
    if (connection)
      await handleCommand(
        admin,
        String(connection.profile_id),
        chatId,
        text,
        message.from?.language_code === 'ar'
      );
  }
  await admin
    .from('notification_webhook_events')
    .update({processed_at: new Date().toISOString()})
    .eq('provider', 'telegram')
    .eq('external_event_id', String(update.update_id));
  return NextResponse.json({received: true});
}
async function handleCommand(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
  chatId: string,
  text: string,
  ar: boolean
) {
  if (text === '/orders') {
    const {data} = await admin
      .from('orders')
      .select('order_number,status')
      .eq('profile_id', profileId)
      .order('created_at', {ascending: false})
      .limit(5);
    await sendTelegramText(
      chatId,
      data?.length
        ? data.map((row) => `${row.order_number}: ${row.status}`).join('\n')
        : ar
          ? 'لا توجد طلبات.'
          : 'No orders yet.'
    );
    return;
  }
  if (text === '/balance') {
    const {data} = await admin
      .from('wallets')
      .select('currency_code,cached_balance')
      .eq('owner_id', profileId)
      .eq('account_type', 'customer')
      .is('deleted_at', null);
    await sendTelegramText(
      chatId,
      data?.length
        ? data.map((row) => `${row.currency_code}: ${row.cached_balance}`).join('\n')
        : ar
          ? 'لا يوجد رصيد.'
          : 'No wallet balance.'
    );
    return;
  }
  if (text.startsWith('/status ')) {
    const query = text.slice(8).trim();
    const {data} = await admin
      .from('orders')
      .select('order_number,status')
      .eq('profile_id', profileId)
      .or(`id.eq.${query},order_number.eq.${query}`)
      .maybeSingle();
    await sendTelegramText(
      chatId,
      data
        ? `${data.order_number}: ${data.status}`
        : ar
          ? 'لم يتم العثور على الطلب.'
          : 'Order not found.'
    );
    return;
  }
  if (text === '/support') {
    await sendTelegramText(
      chatId,
      new URL(
        `/${ar ? 'ar' : 'en'}/support`,
        process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
      ).toString()
    );
    return;
  }
  await sendTelegramText(
    chatId,
    ar
      ? 'الأوامر: /orders /balance /status <id> /support'
      : 'Commands: /orders /balance /status <id> /support'
  );
}
type TelegramUpdate = {
  update_id: number;
  message?: {
    text?: string;
    chat: {id: number};
    from?: {username?: string; first_name?: string; language_code?: string};
  };
};
