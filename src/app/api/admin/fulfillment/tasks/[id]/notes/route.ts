import {NextResponse} from 'next/server';

import {getAuthContext} from '@/features/auth/server/authorization';
import {manualNoteSchema} from '@/features/fulfillment/schemas/fulfillment';
import {encryptOrderPayload} from '@/features/commerce/server/payload-crypto';
import {createAdminClient} from '@/lib/supabase/admin';

export async function POST(request: Request, {params}: {params: Promise<{id: string}>}) {
  const identity = await getAuthContext();
  if (!identity?.permissions.includes('fulfillment.manage'))
    return NextResponse.json({error: 'forbidden'}, {status: 403});
  try {
    const input = manualNoteSchema.parse(await request.json());
    const {id} = await params;
    const admin = createAdminClient();
    const {data, error} = await admin
      .from('manual_fulfillment_notes')
      .insert({
        task_id: id,
        author_id: identity.user.id,
        body_ciphertext: encryptOrderPayload(input.body),
        visibility: 'internal'
      })
      .select('id,created_at')
      .single();
    return error
      ? NextResponse.json({error: error.message}, {status: 400})
      : NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {error: error instanceof Error ? error.message : 'note_invalid'},
      {status: 400}
    );
  }
}
