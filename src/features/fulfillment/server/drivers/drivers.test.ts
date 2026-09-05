import {afterEach, describe, expect, it, vi} from 'vitest';

import {MockSupplierDriver} from './mock-driver';
import {ResellerApiDriver} from './reseller-api-driver';
import {SmmPanelDriver} from './smm-panel-driver';

const credentials = {
  endpoint: 'https://supplier.test/api',
  apiKey: 'test-key',
  sandbox: true,
  settings: {}
};
const request = {
  idempotencyKey: 'order-item-1',
  externalServiceId: '42',
  quantity: 3,
  target: 'player-7',
  options: {}
};

afterEach(() => vi.unstubAllGlobals());

describe('supplier drivers', () => {
  it('mock supplier completes an automatic order immediately', async () => {
    const driver = new MockSupplierDriver();
    const placed = await driver.placeOrder(request, credentials);
    expect(placed).toMatchObject({status: 'completed', deliveredQuantity: 3, costAmount: 30});
    expect(placed.deliveryPayload).toContain('NEXORA-MOCK');
    await expect(driver.checkStatus(placed.externalOrderId, credentials)).resolves.toMatchObject({
      status: 'completed'
    });
  });

  it('maps the standard Perfect Panel add response without leaking the API key', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({order: 991, key: 'leak'}), {status: 200}));
    vi.stubGlobal('fetch', fetchMock);
    const placed = await new SmmPanelDriver().placeOrder(request, credentials);
    expect(placed).toMatchObject({externalOrderId: '991', status: 'submitted'});
    expect(placed.safeResponse).not.toHaveProperty('key');
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain('action=add');
  });

  it('normalizes a generic reseller API immediate delivery', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            order_id: 'r-1',
            status: 'success',
            delivered_quantity: 3,
            cost_minor: 44,
            delivery: 'CODE-1'
          }),
          {status: 200}
        )
      )
    );
    const placed = await new ResellerApiDriver().placeOrder(request, credentials);
    expect(placed).toMatchObject({
      externalOrderId: 'r-1',
      status: 'completed',
      deliveredQuantity: 3,
      costAmount: 44,
      deliveryPayload: 'CODE-1'
    });
  });

  it('supports supplier cancellation in the mock sandbox', async () => {
    const driver = new MockSupplierDriver();
    const placed = await driver.placeOrder(request, credentials);
    await expect(driver.cancel(placed.externalOrderId, credentials)).resolves.toBe(true);
    await expect(driver.checkStatus(placed.externalOrderId, credentials)).resolves.toMatchObject({
      status: 'cancelled'
    });
  });
});
