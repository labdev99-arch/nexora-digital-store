import {createHmac} from 'node:crypto';

import {afterEach, describe, expect, it} from 'vitest';

import type {PaymentProviderContext} from './payment-provider';
import {getPaymentProvider, registeredPaymentDrivers} from './registry';

const original = {...process.env};
afterEach(() => {
  process.env = {...original};
});

function context(driver: string): PaymentProviderContext {
  return {
    paymentId: '10000000-0000-4000-8000-000000000001',
    profileId: '20000000-0000-4000-8000-000000000001',
    email: 'sandbox@example.com',
    amount: 1000,
    feeAmount: driver === 'omt' ? 110 : 0,
    payableAmount: driver === 'omt' ? 1110 : 1000,
    currencyCode: 'USD',
    returnUrl: 'https://example.com/en/account/wallet/top-up',
    idempotencyKey: `sandbox-${driver}-12345678`,
    sandbox: true,
    locale: 'en',
    config: {},
    crypto: {asset: 'USDT', network: 'TRC20'}
  };
}

describe('payment provider registry', () => {
  it('contains every configured Phase 4 driver', () => {
    expect(registeredPaymentDrivers()).toEqual(
      expect.arrayContaining([
        'stripe',
        'areeba',
        'netcommerce',
        'checkout',
        'whish',
        'omt',
        'manual_bank',
        'manual_cash',
        'nowpayments'
      ])
    );
  });

  it.each([
    'stripe',
    'areeba',
    'netcommerce',
    'checkout',
    'whish',
    'omt',
    'manual_bank',
    'manual_cash',
    'nowpayments'
  ])('initiates %s safely in sandbox', async (driver) => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.NOWPAYMENTS_API_KEY;
    process.env.CARD_PAYMENT_PROVIDER = driver === 'stripe' ? 'stripe' : undefined;
    const provider = getPaymentProvider(driver);
    const result = await provider.initiate(context(driver));
    expect(result.providerPaymentId).toBeTruthy();
    expect(['requires_action', 'awaiting_payment', 'awaiting_proof']).toContain(result.status);
  });

  it('rejects a forged local gateway webhook and accepts a signed event', async () => {
    process.env.LOCAL_CARD_GATEWAY_WEBHOOK_SECRET = 'test-signing-secret';
    const body = JSON.stringify({
      id: 'evt_1',
      type: 'payment.paid',
      paymentId: context('areeba').paymentId,
      providerPaymentId: 'areeba_1',
      status: 'paid',
      amount: 1000
    });
    const provider = getPaymentProvider('areeba');
    await expect(
      provider.handleWebhook(body, new Headers({'x-payment-signature': 'forged'}))
    ).rejects.toThrow('signature_invalid');
    const signature = createHmac('sha256', 'test-signing-secret').update(body).digest('hex');
    const event = await provider.handleWebhook(
      body,
      new Headers({'x-payment-signature': signature})
    );
    expect(event.status).toBe('paid');
    expect(event.receivedAmount).toBe(1000);
  });
});
