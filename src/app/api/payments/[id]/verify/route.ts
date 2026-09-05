import {NextResponse} from 'next/server';

import {getPaymentIdentity} from '@/features/payments/server/identity';
import {verifyAndSettlePayment} from '@/features/payments/server/payment-service';

export async function POST(_request: Request, {params}: {params: Promise<{id: string}>}) {
  const identity = await getPaymentIdentity();
  if (!identity) return NextResponse.json({error: 'unauthorized'}, {status: 401});
  try {
    const {id} = await params;
    const payment = await verifyAndSettlePayment(identity, id);
    return NextResponse.json({payment});
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'payment_failed';
    return NextResponse.json(
      {error: message},
      {status: message === 'payment_not_found' ? 404 : 400}
    );
  }
}
