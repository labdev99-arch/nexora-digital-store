import {createHmac, timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {hashExternalId} from '@/features/notifications/server/connection-crypto';
import {sendWhatsAppText} from '@/features/notifications/server/adapters';
import {createAdminClient} from '@/lib/supabase/admin';

export function GET(request: Request) {
  const url = new URL(request.url);
  if (
    url.searchParams.get('hub.mode') === 'subscribe' &&
    url.searchParams.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN
  )
    return new Response(url.searchParams.get('hub.challenge') ?? '', {status: 200});
  return new Response('forbidden', {status: 403});
}
export async function POST(request: Request) {
  const raw = await request.text(),
    signature = request.headers.get('x-hub-signature-256') ?? '',
    secret = process.env.WHATSAPP_APP_SECRET ?? '';
  const expected = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
  const valid = Boolean(
    secret &&
    signature.length === expected.length &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  );
  if (!valid) return NextResponse.json({error: 'invalid_signature'}, {status: 401});
  const body = JSON.parse(raw) as WhatsAppPayload;
  const admin = createAdminClient();
  const externalId = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id ?? crypto.randomUUID();
  await admin.from('notification_webhook_events').upsert(
    {
      provider: 'whatsapp',
      external_event_id: externalId,
      signature_valid: true,
      event_type: 'message',
      payload: body
    },
    {onConflict: 'provider,external_event_id', ignoreDuplicates: true}
  );
  for (const entry of body.entry ?? [])
    for (const change of entry.changes ?? [])
      for (const message of change.value.messages ?? []) {
        const text = message.text?.body?.trim().toLowerCase() ?? '';
        if (!text) continue;
        const {data: connection} = await admin
          .from('notification_channel_connections')
          .select('*')
          .eq('channel', 'whatsapp')
          .eq('external_id_hash', hashExternalId(message.from))
          .eq('status', 'verified')
          .maybeSingle();
        if (!connection) continue;
        const whereOrder = /where.*order|order.*status|أين.*طلبي|وين.*طلبي|حالة.*الطلب/i.test(text);
        if (!whereOrder) continue;
        const {data: order} = await admin
          .from('orders')
          .select('id,order_number,status')
          .eq('profile_id', String(connection.profile_id))
          .is('deleted_at', null)
          .order('created_at', {ascending: false})
          .limit(1)
          .maybeSingle();
        const metadata =
          connection.metadata &&
          typeof connection.metadata === 'object' &&
          !Array.isArray(connection.metadata)
            ? connection.metadata
            : {};
        const locale = String(metadata.locale ?? 'en');
        const answer = order
          ? locale === 'ar'
            ? `طلبك ${order.order_number}: ${order.status}`
            : `Order ${order.order_number}: ${order.status}`
          : locale === 'ar'
            ? 'لا يوجد طلب حديث.'
            : 'No recent order was found.';
        await sendWhatsAppText(message.from, answer);
      }
  await admin
    .from('notification_webhook_events')
    .update({processed_at: new Date().toISOString()})
    .eq('provider', 'whatsapp')
    .eq('external_event_id', externalId);
  return NextResponse.json({received: true});
}
type WhatsAppPayload = {
  entry?: Array<{
    changes?: Array<{
      value: {messages?: Array<{id: string; from: string; text?: {body?: string}}>};
    }>;
  }>;
};
