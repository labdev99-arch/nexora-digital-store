import 'server-only';

import {createHmac, randomUUID, timingSafeEqual} from 'node:crypto';

import type {Json} from '@/lib/supabase/database.types';
import type {PaymentProvider, PaymentProviderContext, ProviderWebhook} from './payment-provider';

type NowPayment = {
  payment_id: string | number;
  payment_status: string;
  pay_address: string;
  pay_amount: number;
  pay_currency: string;
  price_amount: number;
  price_currency: string;
  order_id: string;
  outcome_amount?: number;
};

function stable(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key] ?? null)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function status(value: string) {
  if (value === 'finished' || value === 'confirmed') return 'paid' as const;
  if (value === 'failed') return 'failed' as const;
  if (value === 'expired') return 'expired' as const;
  return 'awaiting_payment' as const;
}

export class CryptoPaymentProvider implements PaymentProvider {
  readonly code = 'nowpayments';
  readonly capabilities = new Set([
    'automatic',
    'refunds',
    'webhooks',
    'crypto_confirmations'
  ] as const);

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const key = process.env.NOWPAYMENTS_API_KEY;
    if (!key) throw new Error('nowpayments_not_configured');
    const response = await fetch(`https://api.nowpayments.io/v1${path}`, {
      ...init,
      headers: {'x-api-key': key, 'content-type': 'application/json', ...init?.headers}
    });
    if (!response.ok) throw new Error(`nowpayments_http_${response.status}`);
    return (await response.json()) as T;
  }

  async initiate(context: PaymentProviderContext) {
    const selection = context.crypto ?? {asset: 'USDT' as const, network: 'TRC20' as const};
    const payCurrency =
      selection.asset === 'USDT'
        ? `usdt${selection.network.toLowerCase()}`
        : selection.asset.toLowerCase();
    if (context.sandbox && !process.env.NOWPAYMENTS_API_KEY) {
      const providerPaymentId = `np_sandbox_${randomUUID()}`;
      const expectedAtomic =
        selection.asset === 'BTC'
          ? '100000'
          : selection.asset === 'ETH'
            ? '1000000000000000'
            : String(context.payableAmount * 10_000);
      return {
        providerPaymentId,
        status: 'awaiting_payment' as const,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        rateExpiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
        clientAction: {
          type: 'crypto_transfer',
          asset: selection.asset,
          network: selection.network,
          address: `sandbox_${selection.network}_${context.paymentId.replaceAll('-', '')}`,
          expectedAtomic
        },
        metadata: {
          asset: selection.asset,
          network: selection.network,
          expectedAtomic,
          atomicScale: selection.asset === 'BTC' ? 8 : selection.asset === 'ETH' ? 18 : 6,
          requiredConfirmations: selection.asset === 'BTC' ? 2 : 12,
          quoteNumerator: context.payableAmount,
          quoteDenominator: 1
        }
      };
    }
    const result = await this.request<NowPayment>('/payment', {
      method: 'POST',
      body: JSON.stringify({
        price_amount: context.payableAmount / 100,
        price_currency: context.currencyCode.toLowerCase(),
        pay_currency: payCurrency,
        order_id: context.paymentId,
        order_description: 'Nexora wallet top-up',
        ipn_callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/payments/webhooks/crypto`
      })
    });
    return {
      providerPaymentId: String(result.payment_id),
      status: status(result.payment_status),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      rateExpiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
      clientAction: {
        type: 'crypto_transfer',
        asset: selection.asset,
        network: selection.network,
        address: result.pay_address,
        amount: String(result.pay_amount),
        currency: result.pay_currency
      },
      metadata: {
        asset: selection.asset,
        network: selection.network,
        expectedAtomic: String(
          Math.round(
            result.pay_amount *
              10 ** (selection.asset === 'BTC' ? 8 : selection.asset === 'ETH' ? 18 : 6)
          )
        ),
        atomicScale: selection.asset === 'BTC' ? 8 : selection.asset === 'ETH' ? 18 : 6,
        requiredConfirmations: selection.asset === 'BTC' ? 2 : 12,
        quoteNumerator: context.payableAmount,
        quoteDenominator: 1
      }
    };
  }

  async verify(providerPaymentId: string, context: PaymentProviderContext) {
    if (context.sandbox && !process.env.NOWPAYMENTS_API_KEY)
      return {
        verified: true,
        status: 'paid' as const,
        receivedAmount: context.payableAmount,
        providerEventId: `crypto-sandbox:${providerPaymentId}`
      };
    const result = await this.request<NowPayment>(
      `/payment/${encodeURIComponent(providerPaymentId)}`
    );
    return {
      verified: ['finished', 'confirmed'].includes(result.payment_status),
      status: status(result.payment_status),
      receivedAmount: Math.round((result.outcome_amount ?? result.price_amount) * 100)
    };
  }

  getStatus(providerPaymentId: string, context: PaymentProviderContext) {
    return this.verify(providerPaymentId, context);
  }

  async handleWebhook(rawBody: string, headers: Headers): Promise<ProviderWebhook> {
    const secret = process.env.NOWPAYMENTS_IPN_SECRET;
    const signature = headers.get('x-nowpayments-sig');
    if (!secret || !signature) throw new Error('nowpayments_signature_missing');
    const raw = JSON.parse(rawBody) as Json;
    const expected = createHmac('sha512', secret).update(stable(raw)).digest('hex');
    const valid =
      signature.length === expected.length &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!valid) throw new Error('nowpayments_signature_invalid');
    const payload = raw as Record<string, Json>;
    const paymentStatus = String(payload.payment_status ?? 'waiting');
    const priceAmount = Number(payload.price_amount ?? 0);
    return {
      eventId: `${String(payload.payment_id)}:${paymentStatus}:${String(payload.actually_paid ?? 0)}`,
      eventType: `payment.${paymentStatus}`,
      providerPaymentId: String(payload.payment_id),
      paymentId: String(payload.order_id ?? ''),
      status: status(paymentStatus),
      receivedAmount: Math.round(priceAmount * 100),
      raw
    };
  }

  async refund(
    _providerPaymentId: string,
    _amount: number,
    _currencyCode: string,
    _idempotencyKey: string
  ): Promise<never> {
    void _providerPaymentId;
    void _amount;
    void _currencyCode;
    void _idempotencyKey;
    throw new Error('nowpayments_refund_requires_payout_workflow');
  }
}
