import {NextResponse} from 'next/server';

import {getAuthContext} from '@/features/auth/server/authorization';
import {createAdminClient} from '@/lib/supabase/admin';

export async function POST(_request: Request, {params}: {params: Promise<{id: string}>}) {
  const identity = await getAuthContext();
  if (!identity?.permissions.includes('fulfillment.manage'))
    return NextResponse.json({error: 'forbidden'}, {status: 403});
  const {id} = await params;
  const admin = createAdminClient();
  const {data, error} = await admin.rpc('claim_manual_fulfillment_task', {
    p_task_id: id,
    p_staff_id: identity.user.id
  });
  return error ? NextResponse.json({error: error.message}, {status: 409}) : NextResponse.json(data);
}
