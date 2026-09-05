import {NextResponse} from 'next/server';

import {requireUser} from '@/features/auth/server/authorization';
import {createAdminClient} from '@/lib/supabase/admin';

export async function GET() {
  const identity = await requireUser('en');
  const admin = createAdminClient();
  const profileId = identity.user.id;
  const request = await admin
    .from('data_export_requests')
    .insert({profile_id: profileId, status: 'processing'})
    .select('id')
    .single();
  if (request.error) return NextResponse.json({error: 'export_request_failed'}, {status: 500});

  const [profile, roles, orders, wallets, payments, tickets, reviews, consents] = await Promise.all(
    [
      admin.from('profiles').select('*').eq('id', profileId).maybeSingle(),
      admin.from('profile_roles').select('role,created_at,expires_at').eq('profile_id', profileId),
      admin.from('orders').select('*').eq('profile_id', profileId),
      admin
        .from('wallets')
        .select('id,currency_code,account_type,cached_balance,frozen,created_at')
        .eq('owner_id', profileId),
      admin
        .from('payments')
        .select('id,status,currency_code,requested_amount,fee_amount,provider_code,created_at')
        .eq('profile_id', profileId),
      admin.from('support_tickets').select('*').eq('profile_id', profileId),
      admin.from('reviews').select('*').eq('profile_id', profileId),
      admin.from('privacy_consents').select('*').eq('profile_id', profileId)
    ]
  );
  const failed = [profile, roles, orders, wallets, payments, tickets, reviews, consents].find(
    (result) => result.error
  );
  if (failed?.error) {
    await admin
      .from('data_export_requests')
      .update({
        status: 'failed',
        failure_code: 'query_failed',
        updated_at: new Date().toISOString()
      })
      .eq('id', request.data.id);
    return NextResponse.json({error: 'export_failed'}, {status: 500});
  }

  const exportedAt = new Date().toISOString();
  const payload = {
    format: 'Nexora GDPR export v1',
    exportedAt,
    profile: profile.data,
    roles: roles.data,
    orders: orders.data,
    wallets: wallets.data,
    payments: payments.data,
    tickets: tickets.data,
    reviews: reviews.data,
    consents: consents.data
  };
  await admin
    .from('data_export_requests')
    .update({
      status: 'ready',
      completed_at: exportedAt,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      updated_at: exportedAt
    })
    .eq('id', request.data.id);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="nexora-data-${exportedAt.slice(0, 10)}.json"`,
      'Cache-Control': 'private, no-store'
    }
  });
}
