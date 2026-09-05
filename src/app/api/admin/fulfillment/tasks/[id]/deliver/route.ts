import {NextResponse} from 'next/server';

import {getAuthContext} from '@/features/auth/server/authorization';
import {encryptOrderPayload} from '@/features/commerce/server/payload-crypto';
import {manualDeliverySchema} from '@/features/fulfillment/schemas/fulfillment';
import {createAdminClient} from '@/lib/supabase/admin';

export async function POST(request: Request, {params}: {params: Promise<{id: string}>}) {
  const identity = await getAuthContext();
  if (!identity?.permissions.includes('fulfillment.manage'))
    return NextResponse.json({error: 'forbidden'}, {status: 403});
  try {
    const input = manualDeliverySchema.parse(await request.json());
    const {id} = await params;
    const admin = createAdminClient();
    const {data, error} = await admin.rpc('complete_manual_delivery', {
      p_task_id: id,
      p_staff_id: identity.user.id,
      p_kind: input.kind,
      p_payload_ciphertext: input.payload ? encryptOrderPayload(input.payload) : null,
      p_display_hint: input.displayHint ?? null,
      p_storage_path: input.storagePath ?? null,
      p_quantity: input.quantity
    });
    return error
      ? NextResponse.json({error: error.message}, {status: 409})
      : NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {error: error instanceof Error ? error.message : 'invalid_delivery'},
      {status: 400}
    );
  }
}
