import 'server-only';

import type {Json} from '@/lib/supabase/database.types';

export type SupplierOrderState =
  'submitted' | 'processing' | 'partial' | 'completed' | 'failed' | 'cancelled';

export type SupplierCredentials = {
  endpoint: string;
  apiKey: string | null;
  sandbox: boolean;
  settings: Json;
};

export type SupplierOrderRequest = {
  idempotencyKey: string;
  externalServiceId: string;
  quantity: number;
  target: string;
  options: Json;
};

export type SupplierOrderResult = {
  externalOrderId: string;
  status: SupplierOrderState;
  deliveredQuantity: number;
  costAmount: number | null;
  safeResponse: Json;
  deliveryPayload?: string | null;
};

export type SupplierStatusResult = Omit<SupplierOrderResult, 'externalOrderId'>;

export interface SupplierDriver {
  readonly code: 'smm_panel' | 'reseller_api' | 'mock';
  placeOrder(
    request: SupplierOrderRequest,
    credentials: SupplierCredentials
  ): Promise<SupplierOrderResult>;
  checkStatus(
    externalOrderId: string,
    credentials: SupplierCredentials
  ): Promise<SupplierStatusResult>;
  getBalance(credentials: SupplierCredentials): Promise<{amount: number; currency: string}>;
  cancel(externalOrderId: string, credentials: SupplierCredentials): Promise<boolean>;
}

export class SupplierError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable: boolean,
    message: string
  ) {
    super(message);
    this.name = 'SupplierError';
  }
}

export function requireSupplierSuccess(response: Response) {
  if (!response.ok) {
    throw new SupplierError(
      `supplier_http_${response.status}`,
      response.status === 408 || response.status === 429 || response.status >= 500,
      'Supplier request failed'
    );
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SupplierError('supplier_response_invalid', false, 'Supplier response is invalid');
  }
  return value as Record<string, unknown>;
}

export function safeSupplierResponse(value: Record<string, unknown>): Json {
  const safe: Record<string, Json> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (/key|secret|token|password/i.test(key)) continue;
    if (entry === null || ['string', 'number', 'boolean'].includes(typeof entry)) {
      safe[key] = entry as Json;
    }
  }
  return safe;
}
