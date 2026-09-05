import 'server-only';

import {createHmac, randomUUID, timingSafeEqual} from 'node:crypto';

import type {PaymentProvider, PaymentProviderContext, ProviderWebhook} from './payment-provider';

export class LocalCardGatewayProvider implements PaymentProvider {
  readonly capabilities = new Set([
    'automatic',
    'saved_methods',
    'sca',
    'refunds',
    'webhooks'
  ] as const);

  constructor(readonly code: string) {}

  async initiate(context: PaymentProviderContext) {
    if (!context.sandbox) throw new Error(`${this.code}_gateway_not_configured`);
    const providerPaymentId = `${this.code}_sandbox_${randomUUID()}`;
    return {
      providerPaymentId,
      status: 'requires_action' as const,
      clientAction: {
        type: 'local_gateway_sandbox',
        provider: this.code,
        paymentId: context.paymentId
      },
      metadata: {sandbox: true}
    };
  }

  async verify(providerPaymentId: string, context: PaymentProviderContext) {
    if (!context.sandbox) throw new Error(`${this.code}_gateway_not_configured`);
    return {
      verified: true,
      status: 'paid' as const,
      receivedAmount: context.payableAmount,
      providerEventId: `${this.code}:${providerPaymentId}`
    };
  }

  getStatus(providerPaymentId: string, context: PaymentProviderContext) {
    return this.verify(providerPaymentId, context);
  }

  async handleWebhook(rawBody: string, headers: Headers): Promise<ProviderWebhook> {
    const secret = process.env.LOCAL_CARD_GATEWAY_WEBHOOK_SECRET;
    const signature = headers.get('x-payment-signature');
    if (!secret || !signature) throw new Error('local_gateway_signature_missing');
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const valid =
      signature.length === expected.length &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!valid) throw new Error('local_gateway_signature_invalid');
    const payload = JSON.parse(rawBody) as {
      id: string;
      type: string;
      paymentId: string;
      providerPaymentId: string;
      status: 'paid' | 'failed';
      amount: number;
    };
    return {
      eventId: payload.id,
      eventType: payload.type,
      paymentId: payload.paymentId,
      providerPaymentId: payload.providerPaymentId,
      status: payload.status,
      receivedAmount: payload.amount,
      raw: payload
    };
  }

  async refund(
    _providerPaymentId: string,
    _amount: number,
    _currencyCode: string,
    _idempotencyKey: string
  ) {
    void _providerPaymentId;
    void _amount;
    void _currencyCode;
    void _idempotencyKey;
    if (process.env.NODE_ENV === 'production')
      throw new Error(`${this.code}_gateway_not_configured`);
    return {providerRefundId: `${this.code}_refund_${randomUUID()}`, status: 'succeeded' as const};
  }
}
