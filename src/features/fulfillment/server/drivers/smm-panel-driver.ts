import 'server-only';

import {
  asRecord,
  requireSupplierSuccess,
  safeSupplierResponse,
  SupplierError,
  type SupplierCredentials,
  type SupplierDriver,
  type SupplierOrderResult,
  type SupplierOrderState,
  type SupplierStatusResult
} from './supplier-driver';

function state(value: unknown): SupplierOrderState {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized.includes('partial')) return 'partial';
  if (normalized.includes('complete')) return 'completed';
  if (normalized.includes('cancel')) return 'cancelled';
  if (normalized.includes('fail') || normalized.includes('error')) return 'failed';
  if (normalized.includes('process') || normalized.includes('progress')) return 'processing';
  return 'submitted';
}

async function call(credentials: SupplierCredentials, fields: Record<string, string>) {
  if (!credentials.apiKey)
    throw new SupplierError('supplier_key_missing', false, 'API key missing');
  const body = new URLSearchParams({key: credentials.apiKey, ...fields});
  const response = await fetch(credentials.endpoint, {
    method: 'POST',
    headers: {'content-type': 'application/x-www-form-urlencoded'},
    body,
    signal: AbortSignal.timeout(12_000)
  });
  requireSupplierSuccess(response);
  return asRecord(await response.json());
}

export class SmmPanelDriver implements SupplierDriver {
  readonly code = 'smm_panel' as const;

  async placeOrder(
    request: Parameters<SupplierDriver['placeOrder']>[0],
    credentials: SupplierCredentials
  ): Promise<SupplierOrderResult> {
    const value = await call(credentials, {
      action: 'add',
      service: request.externalServiceId,
      link: request.target,
      quantity: String(request.quantity)
    });
    const externalOrderId = String(value.order ?? value.id ?? '');
    if (!externalOrderId)
      throw new SupplierError('supplier_order_missing', false, 'Order id missing');
    return {
      externalOrderId,
      status: 'submitted',
      deliveredQuantity: 0,
      costAmount: null,
      safeResponse: safeSupplierResponse(value)
    };
  }

  async checkStatus(
    externalOrderId: string,
    credentials: SupplierCredentials
  ): Promise<SupplierStatusResult> {
    const value = await call(credentials, {action: 'status', order: externalOrderId});
    const status = state(value.status);
    const start = Number(value.start_count ?? 0);
    const remains = Number(value.remains ?? 0);
    const deliveredQuantity = Number.isFinite(start - remains) ? Math.max(0, start - remains) : 0;
    return {
      status,
      deliveredQuantity,
      costAmount: typeof value.charge === 'string' ? Math.round(Number(value.charge) * 100) : null,
      safeResponse: safeSupplierResponse(value)
    };
  }

  async getBalance(credentials: SupplierCredentials) {
    const value = await call(credentials, {action: 'balance'});
    return {
      amount: Math.round(Number(value.balance ?? 0) * 100),
      currency: String(value.currency ?? 'USD')
    };
  }

  async cancel(externalOrderId: string, credentials: SupplierCredentials) {
    const value = await call(credentials, {action: 'cancel', orders: externalOrderId});
    return !String(value.error ?? '').length;
  }
}
