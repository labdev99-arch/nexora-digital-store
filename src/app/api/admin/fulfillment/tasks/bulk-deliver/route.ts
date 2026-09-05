import {NextResponse} from 'next/server';

import {getAuthContext} from '@/features/auth/server/authorization';
import {encryptOrderPayload} from '@/features/commerce/server/payload-crypto';
import {bulkManualDeliverySchema} from '@/features/fulfillment/schemas/fulfillment';
import {createAdminClient} from '@/lib/supabase/admin';

export async function POST(request: Request) {
  const identity = await getAuthContext();
  if (!identity?.permissions.includes('fulfillment.manage'))
    return NextResponse.json({error: 'forbidden'}, {status: 403});
  const input = bulkManualDeliverySchema.parse(await request.json());
  const admin = createAdminClient();
  const results = [];
  for (const delivery of input.deliveries) {
    const {data, error} = await admin.rpc('complete_manual_delivery', {
      p_task_id: delivery.taskId,
      p_staff_id: identity.user.id,
      p_kind: delivery.kind,
      p_payload_ciphertext: delivery.payload ? encryptOrderPayload(delivery.payload) : null,
      p_display_hint: delivery.displayHint ?? null,
      p_storage_path: delivery.storagePath ?? null,
      p_quantity: delivery.quantity
    });
    results.push({
      taskId: delivery.taskId,
      ok: !error,
      deliveryId: data?.id ?? null,
      error: error?.message ?? null
    });
  }
  return NextResponse.json({results});
}
