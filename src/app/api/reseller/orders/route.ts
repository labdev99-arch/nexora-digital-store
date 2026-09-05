import {NextResponse} from 'next/server';

import {getAuthContext} from '@/features/auth/server/authorization';
import {placeApiOrder} from '@/features/reseller/server/reseller-service';
import {trustedRest} from '@/features/reseller/server/trusted-rest';

export async function POST(request: Request) {
  const identity = await getAuthContext();
  if (!identity?.permissions.includes('reseller.access'))
    return NextResponse.json({error: 'forbidden'}, {status: 403});
  try {
    const accounts = await trustedRest<{id: string; profile_id: string}[]>(
      `reseller_accounts?select=id,profile_id&profile_id=eq.${identity.user.id}&status=eq.active&deleted_at=is.null&limit=1`
    );
    if (!accounts[0]) throw new Error('reseller_account_inactive');
    const result = await placeApiOrder(
      {account: accounts[0], apiKey: {id: 'dashboard', environment: 'live'}},
      await request.json(),
      request.headers.get('idempotency-key') ?? crypto.randomUUID()
    );
    return NextResponse.json(result.body, {status: result.replayed ? 200 : 201});
  } catch (error) {
    return NextResponse.json(
      {error: error instanceof Error ? error.message : 'request_failed'},
      {status: 400}
    );
  }
}
