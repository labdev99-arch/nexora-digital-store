import {NextResponse} from 'next/server';

import {requireUser} from '@/features/auth/server/authorization';
import {createAdminClient} from '@/lib/supabase/admin';

const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function POST(request: Request) {
  const context = await requireUser('en');
  const form = await request.formData();
  const file = form.get('file');
  const orderItemId = String(form.get('orderItemId') ?? '');
  if (
    !(file instanceof File) ||
    !/^[0-9a-f-]{36}$/i.test(orderItemId) ||
    file.size < 1 ||
    file.size > 5 * 1024 * 1024 ||
    !allowed.has(file.type)
  )
    return NextResponse.json({error: 'invalid_file'}, {status: 400});

  const admin = createAdminClient();
  const {data: item} = await admin
    .from('order_items')
    .select('order_id')
    .eq('id', orderItemId)
    .maybeSingle();
  const {data: order} = item
    ? await admin
        .from('orders')
        .select('id')
        .eq('id', item.order_id)
        .eq('profile_id', context.user.id)
        .in('status', ['delivered', 'completed'])
        .maybeSingle()
    : {data: null};
  if (!order) return NextResponse.json({error: 'not_eligible'}, {status: 403});

  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
  const path = `${context.user.id}/${orderItemId}/${crypto.randomUUID()}-${safe}`;
  const {error} = await admin.storage
    .from('review-images')
    .upload(path, file, {contentType: file.type, upsert: false});
  if (error) return NextResponse.json({error: 'upload_failed'}, {status: 500});
  return NextResponse.json({path});
}
