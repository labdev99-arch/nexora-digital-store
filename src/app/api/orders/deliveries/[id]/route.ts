import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';

import {getAuthContext} from '@/features/auth/server/authorization';
import {revealDelivery} from '@/features/commerce/server/order-service';
import {createAdminClient} from '@/lib/supabase/admin';

export async function POST(_request: Request, {params}: {params: Promise<{id: string}>}) {
  try {
    const {id} = await params;
    const auth = await getAuthContext();
    const admin = createAdminClient();
    const {data: delivery} = await admin
      .from('order_deliveries')
      .select('order_id')
      .eq('id', id)
      .maybeSingle();
    if (!delivery) throw new Error('delivery_not_found');
    const store = await cookies();
    const guestToken = store.get(`nexora_order_${delivery.order_id}`)?.value ?? null;
    const data = await revealDelivery(id, {profileId: auth?.user.id ?? null, guestToken});
    return NextResponse.json(data);
  } catch (cause) {
    return NextResponse.json(
      {error: cause instanceof Error ? cause.message : 'delivery_failed'},
      {status: 400}
    );
  }
}
