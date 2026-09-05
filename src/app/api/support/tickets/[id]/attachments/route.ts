import {NextResponse} from 'next/server';
import {requireUser} from '@/features/auth/server/authorization';
import {createAdminClient} from '@/lib/supabase/admin';
const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain']);
export async function POST(request: Request, {params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  const context = await requireUser('en');
  const admin = createAdminClient();
  const {data: ticket} = await admin
    .from('support_tickets')
    .select('id')
    .eq('id', id)
    .eq('profile_id', context.user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!ticket) return NextResponse.json({error: 'not_found'}, {status: 404});
  const form = await request.formData(),
    file = form.get('file');
  if (
    !(file instanceof File) ||
    file.size < 1 ||
    file.size > 10 * 1024 * 1024 ||
    !allowed.has(file.type)
  )
    return NextResponse.json({error: 'invalid_file'}, {status: 400});
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120),
    path = `${context.user.id}/${id}/${crypto.randomUUID()}-${safe}`;
  const {error} = await admin.storage
    .from('support-attachments')
    .upload(path, file, {contentType: file.type, upsert: false});
  if (error) return NextResponse.json({error: 'upload_failed'}, {status: 500});
  await admin.from('support_ticket_attachments').insert({
    ticket_id: id,
    uploaded_by: context.user.id,
    storage_path: path,
    file_name: safe,
    content_type: file.type,
    size_bytes: file.size
  });
  return NextResponse.json({ok: true});
}
