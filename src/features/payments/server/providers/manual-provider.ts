import {createHash, randomUUID} from 'node:crypto';

import type {PaymentProvider, PaymentProviderContext, ProviderInitiation} from './payment-provider';
import {unsupported} from './payment-provider';

export class ManualProofProvider implements PaymentProvider {
  readonly capabilities = new Set(['proof_upload'] as const);

  constructor(
    readonly code: string,
    private readonly referencePrefix: string
  ) {}

  async initiate(context: PaymentProviderContext): Promise<ProviderInitiation> {
    const entropy = createHash('sha256')
      .update(`${context.paymentId}:${context.idempotencyKey}`)
      .digest('hex')
      .slice(0, 10)
      .toUpperCase();
    const reference = `${this.referencePrefix}-${entropy}`;
    return {
      providerPaymentId: `${this.code}_${randomUUID()}`,
      reference,
      status: 'awaiting_proof',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      clientAction: {
        type: 'proof_upload',
        reference,
        amount: context.payableAmount,
        currency: context.currencyCode
      },
      metadata: {sandbox: context.sandbox}
    };
  }

  async verify() {
    return {verified: false, status: 'awaiting_proof' as const};
  }

  async getStatus() {
    return {verified: false, status: 'awaiting_proof' as const};
  }

  async handleWebhook(): Promise<never> {
    return unsupported('webhook');
  }

  async refund(): Promise<never> {
    return unsupported('refund');
  }
}
