import {NextRequest, NextResponse} from 'next/server';

import {getPaymentIdentity} from '@/features/payments/server/identity';
import {initiateWalletTopup} from '@/features/payments/server/payment-service';

export async function POST(request: NextRequest) {
  const identity = await getPaymentIdentity();
  if (!identity) return NextResponse.json({error: 'unauthorized'}, {status: 401});
  try {
    const body = (await request.json()) as unknown;
    const key = request.headers.get('idempotency-key') ?? '';
    const locale = request.headers.get('x-locale') === 'ar' ? 'ar' : 'en';
    const payment = await initiateWalletTopup(identity, body, key, locale);
    return NextResponse.json({payment}, {status: 201});
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : 'payment_failed';
    const status =
      code.includes('invalid') || code.includes('range') || code.includes('unavailable')
        ? 400
        : 500;
    return NextResponse.json({error: code}, {status});
  }
}
