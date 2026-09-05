import {NextResponse} from 'next/server';

import {getAuthContext} from '@/features/auth/server/authorization';
import {createAdminClient} from '@/lib/supabase/admin';

export async function GET(_: Request, {params}: {params: Promise<{id: string}>}) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({error: 'unauthorized'}, {status: 401});
  const {id} = await params;
  const admin = createAdminClient();
  const {data: attachment} = await admin
    .from('support_ticket_attachments')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  const {data: ticket} = attachment
    ? await admin
        .from('support_tickets')
        .select('profile_id')
        .eq('id', String(attachment.ticket_id))
        .maybeSingle()
    : {data: null};
  if (
    !attachment ||
    !ticket ||
    (ticket.profile_id !== context.user.id && !context.permissions.includes('support.manage'))
  )
    return NextResponse.json({error: 'not_found'}, {status: 404});
  const {data, error} = await admin.storage
    .from('support-attachments')
    .createSignedUrl(String(attachment.storage_path), 60, {
      download: String(attachment.file_name)
    });
  if (error || !data) return NextResponse.json({error: 'download_failed'}, {status: 500});
  return NextResponse.redirect(data.signedUrl);
}
