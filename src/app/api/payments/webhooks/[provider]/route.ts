import {NextRequest, NextResponse} from 'next/server';

import {processPaymentWebhook} from '@/features/payments/server/webhook-service';

export async function POST(request: NextRequest, {params}: {params: Promise<{provider: string}>}) {
  const {provider} = await params;
  const rawBody = await request.text();
  try {
    const result = await processPaymentWebhook(provider, rawBody, request.headers);
    return NextResponse.json({received: true, ...result});
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'webhook_failed';
    const status = message.includes('signature') ? 400 : 500;
    return NextResponse.json({error: message}, {status});
  }
}
