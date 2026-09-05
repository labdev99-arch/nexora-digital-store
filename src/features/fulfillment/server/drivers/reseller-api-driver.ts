import 'server-only';

import {
  asRecord,
  requireSupplierSuccess,
  safeSupplierResponse,
  SupplierError,
  type SupplierCredentials,
  type SupplierDriver,
  type SupplierOrderResult,
  type SupplierStatusResult
} from './supplier-driver';

async function call(
  credentials: SupplierCredentials,
  path: string,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>
) {
  const response = await fetch(new URL(path, credentials.endpoint), {
    method,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(credentials.apiKey ? {authorization: `Bearer ${credentials.apiKey}`} : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12_000)
  });
  requireSupplierSuccess(response);
  return asRecord(await response.json());
}

function normalizedStatus(value: unknown): SupplierStatusResult['status'] {
  const input = String(value ?? '').toLowerCase();
  if (input === 'completed' || input === 'success') return 'completed';
  if (input === 'partial' || input === 'partially_delivered') return 'partial';
  if (input === 'failed' || input === 'rejected') return 'failed';
  if (input === 'cancelled') return 'cancelled';
  return input === 'processing' ? 'processing' : 'submitted';
}

export class ResellerApiDriver implements SupplierDriver {
  readonly code = 'reseller_api' as const;

  async placeOrder(
    request: Parameters<SupplierDriver['placeOrder']>[0],
    credentials: SupplierCredentials
  ): Promise<SupplierOrderResult> {
    const value = await call(credentials, '/orders', 'POST', {
      idempotency_key: request.idempotencyKey,
      product_id: request.externalServiceId,
      quantity: request.quantity,
      target: request.target,
      options: request.options
    });
    const externalOrderId = String(value.order_id ?? value.id ?? '');
    if (!externalOrderId)
      throw new SupplierError('supplier_order_missing', false, 'Order id missing');
    return {
      externalOrderId,
      status: normalizedStatus(value.status),
      deliveredQuantity: Number(value.delivered_quantity ?? 0),
      costAmount: typeof value.cost_minor === 'number' ? value.cost_minor : null,
      deliveryPayload: typeof value.delivery === 'string' ? value.delivery : null,
      safeResponse: safeSupplierResponse(value)
    };
  }

  async checkStatus(externalOrderId: string, credentials: SupplierCredentials) {
    const value = await call(credentials, `/orders/${encodeURIComponent(externalOrderId)}`, 'GET');
    return {
      status: normalizedStatus(value.status),
      deliveredQuantity: Number(value.delivered_quantity ?? 0),
      costAmount: typeof value.cost_minor === 'number' ? value.cost_minor : null,
      deliveryPayload: typeof value.delivery === 'string' ? value.delivery : null,
      safeResponse: safeSupplierResponse(value)
    };
  }

  async getBalance(credentials: SupplierCredentials) {
    const value = await call(credentials, '/balance', 'GET');
    return {amount: Number(value.amount_minor ?? 0), currency: String(value.currency ?? 'USD')};
  }

  async cancel(externalOrderId: string, credentials: SupplierCredentials) {
    const value = await call(
      credentials,
      `/orders/${encodeURIComponent(externalOrderId)}/cancel`,
      'POST'
    );
    return value.cancelled === true || normalizedStatus(value.status) === 'cancelled';
  }
}
