import {NextResponse} from 'next/server';

import {getAuthContext} from '@/features/auth/server/authorization';
import {
  createWebhookEndpoint,
  listWebhookEndpoints
} from '@/features/reseller/server/credentials-service';

export async function GET() {
  const identity = await getAuthContext();
  if (!identity) return NextResponse.json({error: 'unauthorized'}, {status: 401});
  try {
    return NextResponse.json({endpoints: await listWebhookEndpoints(identity)});
  } catch (error) {
    return NextResponse.json(
      {error: error instanceof Error ? error.message : 'request_failed'},
      {status: 400}
    );
  }
}

export async function POST(request: Request) {
  const identity = await getAuthContext();
  if (!identity) return NextResponse.json({error: 'unauthorized'}, {status: 401});
  try {
    return NextResponse.json(await createWebhookEndpoint(identity, await request.json()), {
      status: 201
    });
  } catch (error) {
    return NextResponse.json(
      {error: error instanceof Error ? error.message : 'request_failed'},
      {status: 400}
    );
  }
}
