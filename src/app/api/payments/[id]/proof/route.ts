import {NextResponse} from 'next/server';

import {getPaymentIdentity} from '@/features/payments/server/identity';
import {uploadPaymentProof} from '@/features/payments/server/payment-service';

export async function POST(request: Request, {params}: {params: Promise<{id: string}>}) {
  const identity = await getPaymentIdentity();
  if (!identity) return NextResponse.json({error: 'unauthorized'}, {status: 401});
  try {
    const {id} = await params;
    const form = await request.formData();
    const file = form.get('proof');
    if (!(file instanceof File))
      return NextResponse.json({error: 'payment_proof_required'}, {status: 400});
    const result = await uploadPaymentProof(identity, id, file);
    return NextResponse.json(result, {status: 201});
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'payment_proof_failed';
    return NextResponse.json({error: message}, {status: 400});
  }
}
