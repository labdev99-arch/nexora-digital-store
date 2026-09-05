import 'server-only';

import type {
  SupplierCredentials,
  SupplierDriver,
  SupplierOrderResult,
  SupplierStatusResult
} from './supplier-driver';

const states = new Map<string, SupplierStatusResult>();

export class MockSupplierDriver implements SupplierDriver {
  readonly code = 'mock' as const;

  async placeOrder(
    request: Parameters<SupplierDriver['placeOrder']>[0],
    credentials: SupplierCredentials
  ): Promise<SupplierOrderResult> {
    const externalOrderId = `mock-${request.idempotencyKey}`;
    const shouldFail = request.target === 'mock:fail';
    const result: SupplierStatusResult = shouldFail
      ? {status: 'failed', deliveredQuantity: 0, costAmount: null, safeResponse: {sandbox: true}}
      : {
          status: 'completed',
          deliveredQuantity: request.quantity,
          costAmount: request.quantity * 10,
          deliveryPayload: credentials.sandbox ? `NEXORA-MOCK-${request.externalServiceId}` : null,
          safeResponse: {sandbox: true, immediate: true}
        };
    states.set(externalOrderId, result);
    return {externalOrderId, ...result};
  }

  async checkStatus(
    externalOrderId: string,
    credentials: SupplierCredentials
  ): Promise<SupplierStatusResult> {
    void credentials;
    return (
      states.get(externalOrderId) ?? {
        status: 'failed',
        deliveredQuantity: 0,
        costAmount: null,
        safeResponse: {sandbox: true, missing: true}
      }
    );
  }

  async getBalance(credentials: SupplierCredentials) {
    void credentials;
    return {amount: 100_000_000, currency: 'USD'};
  }

  async cancel(externalOrderId: string, credentials: SupplierCredentials) {
    void credentials;
    if (!states.has(externalOrderId)) return false;
    states.set(externalOrderId, {
      status: 'cancelled',
      deliveredQuantity: 0,
      costAmount: null,
      safeResponse: {sandbox: true}
    });
    return true;
  }
}
