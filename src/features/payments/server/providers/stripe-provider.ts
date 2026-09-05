import 'server-only';

import {createHash, randomUUID} from 'node:crypto';
import Stripe from 'stripe';

import type {Json} from '@/lib/supabase/database.types';
import type {
  PaymentProvider,
  PaymentProviderContext,
  ProviderRefund,
  ProviderVerification,
  ProviderWebhook
} from './payment-provider';

function asJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function mapStatus(status: Stripe.PaymentIntent.Status): ProviderVerification['status'] {
  if (status === 'succeeded') return 'paid';
  if (status === 'requires_action' || status === 'requires_confirmation') return 'requires_action';
  if (status === 'processing' || status === 'requires_capture') return 'authorized';
  if (status === 'canceled') return 'cancelled';
  return 'awaiting_payment';
}

export class StripePaymentProvider implements PaymentProvider {
  readonly code = 'stripe';
  readonly capabilities = new Set([
    'automatic',
    'saved_methods',
    'sca',
    'refunds',
    'disputes',
    'webhooks'
  ] as const);
  private readonly client: Stripe | null;

  constructor() {
    this.client = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
  }

  async initiate(context: PaymentProviderContext) {
    if (context.sandbox && !this.client) {
      const id = `pi_sandbox_${randomUUID()}`;
      return {
        providerPaymentId: id,
        status: 'requires_action' as const,
        clientAction: {
          type: 'stripe_sandbox',
          clientSecret: `${id}_secret_test`,
          paymentId: context.paymentId
        },
        metadata: {sandbox: true}
      };
    }
    if (!this.client) throw new Error('stripe_not_configured');
    const customerId =
      context.providerCustomerId ??
      (
        await this.client.customers.create(
          {email: context.email ?? undefined, metadata: {profile_id: context.profileId}},
          {idempotencyKey: `${context.idempotencyKey}:customer`}
        )
      ).id;
    const intent = await this.client.paymentIntents.create(
      {
        amount: context.payableAmount,
        currency: context.currencyCode.toLowerCase(),
        automatic_payment_methods: {enabled: true},
        payment_method: context.savedPaymentMethodId,
        customer: customerId,
        setup_future_usage: 'off_session',
        metadata: {payment_id: context.paymentId, profile_id: context.profileId},
        receipt_email: context.email ?? undefined,
        return_url: context.returnUrl
      },
      {idempotencyKey: context.idempotencyKey}
    );
    return {
      providerPaymentId: intent.id,
      status: mapStatus(intent.status),
      clientAction: {type: 'stripe_client_secret', clientSecret: intent.client_secret ?? ''},
      metadata: {livemode: intent.livemode, providerCustomerId: customerId}
    };
  }

  async verify(providerPaymentId: string, context: PaymentProviderContext) {
    if (context.sandbox && !this.client) {
      return {
        verified: true,
        status: 'paid' as const,
        receivedAmount: context.payableAmount,
        providerEventId: `stripe-sandbox:${providerPaymentId}`
      };
    }
    if (!this.client) throw new Error('stripe_not_configured');
    const intent = await this.client.paymentIntents.retrieve(providerPaymentId);
    return {
      verified: intent.status === 'succeeded',
      status: mapStatus(intent.status),
      receivedAmount: intent.amount_received
    };
  }

  getStatus(providerPaymentId: string, context: PaymentProviderContext) {
    return this.verify(providerPaymentId, context);
  }

  async handleWebhook(rawBody: string, headers: Headers): Promise<ProviderWebhook> {
    const signature = headers.get('stripe-signature');
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!this.client || !signature || !secret) throw new Error('stripe_webhook_not_configured');
    const event = this.client.webhooks.constructEvent(rawBody, signature, secret);
    const object = event.data.object;
    if (object.object === 'payment_intent') {
      return {
        eventId: event.id,
        eventType: event.type,
        providerPaymentId: object.id,
        paymentId: object.metadata.payment_id,
        status: mapStatus(object.status),
        receivedAmount: object.amount_received,
        savedMethod:
          typeof object.customer === 'string' && typeof object.payment_method === 'string'
            ? {
                providerCustomerId: object.customer,
                providerPaymentMethodId: object.payment_method
              }
            : undefined,
        raw: asJson(event)
      };
    }
    if (object.object === 'dispute') {
      const dispute = object;
      return {
        eventId: event.id,
        eventType: event.type,
        providerPaymentId:
          typeof dispute.payment_intent === 'string'
            ? dispute.payment_intent
            : dispute.payment_intent?.id,
        status: 'disputed',
        dispute: {
          id: dispute.id,
          amount: dispute.amount,
          currencyCode: dispute.currency.toUpperCase(),
          status: dispute.status
        },
        raw: asJson(event)
      };
    }
    if (object.object === 'refund') {
      return {
        eventId: event.id,
        eventType: event.type,
        providerPaymentId:
          typeof object.payment_intent === 'string'
            ? object.payment_intent
            : object.payment_intent?.id,
        status: object.status === 'failed' ? 'failed' : 'partially_refunded',
        refund: {
          providerRefundId: object.id,
          status:
            object.status === 'succeeded'
              ? 'succeeded'
              : object.status === 'failed' || object.status === 'canceled'
                ? 'failed'
                : 'pending'
        },
        raw: asJson(event)
      };
    }
    return {eventId: event.id, eventType: event.type, status: 'created', raw: asJson(event)};
  }

  async refund(
    providerPaymentId: string,
    amount: number,
    _currencyCode: string,
    idempotencyKey: string
  ): Promise<ProviderRefund> {
    if (!this.client) return {providerRefundId: `re_sandbox_${randomUUID()}`, status: 'succeeded'};
    const refund = await this.client.refunds.create(
      {payment_intent: providerPaymentId, amount},
      {idempotencyKey}
    );
    return {
      providerRefundId: refund.id,
      status:
        refund.status === 'succeeded'
          ? 'succeeded'
          : refund.status === 'failed'
            ? 'failed'
            : 'pending'
    };
  }
}

export function stripeSignatureFingerprint(headers: Headers): string {
  return createHash('sha256')
    .update(headers.get('stripe-signature') ?? '')
    .digest('hex');
}
