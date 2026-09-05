import {randomUUID} from 'node:crypto';

import {NextResponse} from 'next/server';

import {getAuthContext} from '@/features/auth/server/authorization';
import {createAdminClient} from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function POST(request: Request, {params}: {params: Promise<{id: string}>}) {
  const identity = await getAuthContext();
  if (!identity?.permissions.includes('fulfillment.manage'))
    return NextResponse.json({error: 'forbidden'}, {status: 403});
  const form = await request.formData();
  const file = form.get('file');
  const quantity = Number(form.get('quantity') ?? 1);
  if (!(file instanceof File) || file.size < 1 || file.size > 20 * 1024 * 1024)
    return NextResponse.json({error: 'invalid_file'}, {status: 400});
  const {id} = await params;
  const extension =
    file.name
      .split('.')
      .pop()
      ?.replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 12) || 'bin';
  const storagePath = `manual/${id}/${randomUUID()}.${extension}`;
  const admin = createAdminClient();
  const {error: uploadError} = await admin.storage
    .from('order-deliveries')
    .upload(storagePath, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false
    });
  if (uploadError) return NextResponse.json({error: 'file_upload_failed'}, {status: 400});
  const {data, error} = await admin.rpc('complete_manual_delivery', {
    p_task_id: id,
    p_staff_id: identity.user.id,
    p_kind: 'file',
    p_storage_path: storagePath,
    p_display_hint: file.name.slice(0, 120),
    p_quantity: quantity
  });
  if (error) {
    await admin.storage.from('order-deliveries').remove([storagePath]);
    return NextResponse.json({error: error.message}, {status: 409});
  }
  return NextResponse.json(data);
}
