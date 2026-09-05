import 'server-only';

import type {Json} from '@/lib/supabase/database.types';
import type {PaymentStatus} from '../../types';

export type ProviderCapability =
  | 'automatic'
  | 'proof_upload'
  | 'saved_methods'
  | 'sca'
  | 'refunds'
  | 'disputes'
  | 'webhooks'
  | 'crypto_confirmations';

export type PaymentProviderContext = {
  paymentId: string;
  profileId: string;
  email: string | null;
  amount: number;
  feeAmount: number;
  payableAmount: number;
  currencyCode: string;
  returnUrl: string;
  idempotencyKey: string;
  sandbox: boolean;
  locale: string;
  config: Json;
  savedPaymentMethodId?: string;
  providerCustomerId?: string;
  crypto?: {asset: 'USDT' | 'BTC' | 'ETH'; network: 'TRC20' | 'ERC20' | 'BEP20' | 'BITCOIN'};
};

export type ProviderInitiation = {
  providerPaymentId: string;
  status: PaymentStatus;
  reference?: string;
  expiresAt?: string;
  rateExpiresAt?: string;
  clientAction: Json;
  metadata?: Json;
};

export type ProviderVerification = {
  verified: boolean;
  status: PaymentStatus;
  receivedAmount?: number;
  providerEventId?: string;
  metadata?: Json;
};

export type ProviderWebhook = {
  eventId: string;
  eventType: string;
  providerPaymentId?: string;
  paymentId?: string;
  status: PaymentStatus;
  receivedAmount?: number;
  dispute?: {id: string; amount: number; currencyCode: string; status: string; reason?: string};
  savedMethod?: {providerCustomerId: string; providerPaymentMethodId: string};
  refund?: {providerRefundId: string; status: 'pending' | 'succeeded' | 'failed'};
  raw: Json;
};

export type ProviderRefund = {providerRefundId: string; status: 'pending' | 'succeeded' | 'failed'};

export interface PaymentProvider {
  readonly code: string;
  readonly capabilities: ReadonlySet<ProviderCapability>;
  initiate(context: PaymentProviderContext): Promise<ProviderInitiation>;
  verify(providerPaymentId: string, context: PaymentProviderContext): Promise<ProviderVerification>;
  handleWebhook(rawBody: string, headers: Headers): Promise<ProviderWebhook>;
  refund(
    providerPaymentId: string,
    amount: number,
    currencyCode: string,
    idempotencyKey: string
  ): Promise<ProviderRefund>;
  getStatus(
    providerPaymentId: string,
    context: PaymentProviderContext
  ): Promise<ProviderVerification>;
}

export function unsupported(operation: string): never {
  throw new Error(`provider_operation_not_supported:${operation}`);
}
