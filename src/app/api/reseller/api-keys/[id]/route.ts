import {NextResponse} from 'next/server';

import {getAuthContext} from '@/features/auth/server/authorization';
import {revokeApiKey} from '@/features/reseller/server/credentials-service';

export async function DELETE(_: Request, {params}: {params: Promise<{id: string}>}) {
  const identity = await getAuthContext();
  if (!identity) return NextResponse.json({error: 'unauthorized'}, {status: 401});
  try {
    const {id} = await params;
    await revokeApiKey(identity, id);
    return NextResponse.json({revoked: true});
  } catch (error) {
    return NextResponse.json(
      {error: error instanceof Error ? error.message : 'request_failed'},
      {status: 400}
    );
  }
}
