import {NextResponse} from 'next/server';
import {z} from 'zod';

import {requireUser} from '@/features/auth/server/authorization';
import {sanitizePlainText} from '@/lib/security/sanitize';
import {createAdminClient} from '@/lib/supabase/admin';

const schema = z.object({reason: z.string().max(1000).optional()});

export async function POST(request: Request) {
  const identity = await requireUser('en');
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({error: 'invalid_input'}, {status: 400});
  const admin = createAdminClient();
  const {data: blockingOrders} = await admin
    .from('orders')
    .select('id')
    .eq('profile_id', identity.user.id)
    .in('status', ['awaiting_payment', 'paid', 'processing', 'partially_delivered', 'disputed'])
    .limit(1);
  if (blockingOrders?.length) {
    return NextResponse.json({error: 'active_orders_must_be_resolved'}, {status: 409});
  }
  const {error} = await admin.from('account_deletion_requests').insert({
    profile_id: identity.user.id,
    status: 'cooling_off',
    reason: parsed.data.reason ? sanitizePlainText(parsed.data.reason, 1000) : null,
    scheduled_for: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  });
  if (error?.code === '23505')
    return NextResponse.json({error: 'request_already_active'}, {status: 409});
  if (error) return NextResponse.json({error: 'request_failed'}, {status: 500});
  await admin.auth.admin.signOut(identity.user.id, 'global');
  return NextResponse.json({scheduled: true, coolingOffDays: 7});
}
