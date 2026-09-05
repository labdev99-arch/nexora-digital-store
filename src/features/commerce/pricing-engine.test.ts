import {describe, expect, it} from 'vitest';

import {priceLine} from './pricing-engine';

describe('authoritative pricing pipeline', () => {
  const scenarios = [
    {name: 'base only', input: {id: 'a', quantity: 2, baseUnitAmount: 1000}, total: 2000},
    {
      name: 'tier overrides base',
      input: {id: 'a', quantity: 2, baseUnitAmount: 1000, tierUnitAmount: 900},
      total: 1800
    },
    {
      name: 'country follows tier',
      input: {
        id: 'a',
        quantity: 2,
        baseUnitAmount: 1000,
        tierUnitAmount: 900,
        countryUnitAmount: 850
      },
      total: 1700
    },
    {
      name: 'quantity percent',
      input: {id: 'a', quantity: 10, baseUnitAmount: 100, quantityDiscountBps: 1000},
      total: 900
    },
    {
      name: 'flash then coupon',
      input: {
        id: 'a',
        quantity: 1,
        baseUnitAmount: 1000,
        flashDiscountBps: 1000,
        coupons: [{code: 'SAVE20', kind: 'percent' as const, value: 2000, applies: true}]
      },
      total: 720
    },
    {
      name: 'free item cannot go negative',
      input: {
        id: 'a',
        quantity: 1,
        baseUnitAmount: 1000,
        coupons: [{code: 'FREE', kind: 'free_item' as const, value: 0, applies: true}],
        feeFixed: 25
      },
      total: 25
    },
    {
      name: 'loyalty after coupon',
      input: {
        id: 'a',
        quantity: 1,
        baseUnitAmount: 1000,
        coupons: [{code: 'FIXED', kind: 'fixed' as const, value: 100, applies: true}],
        loyaltyDiscountBps: 1000
      },
      total: 810
    },
    {
      name: 'fees before tax',
      input: {id: 'a', quantity: 1, baseUnitAmount: 1000, feeBps: 300, feeFixed: 20, taxBps: 1100},
      total: 1165
    },
    {
      name: 'inclusive tax does not raise total',
      input: {id: 'a', quantity: 1, baseUnitAmount: 1110, taxBps: 1100, taxInclusive: true},
      total: 1110
    },
    {
      name: 'full pipeline ordering',
      input: {
        id: 'a',
        quantity: 2,
        baseUnitAmount: 1000,
        tierUnitAmount: 950,
        countryUnitAmount: 900,
        quantityDiscountBps: 500,
        flashDiscountBps: 1000,
        coupons: [{code: 'SAVE', kind: 'fixed' as const, value: 100, applies: true}],
        loyaltyDiscountBps: 500,
        feeFixed: 20,
        taxBps: 1000
      },
      total: 1526
    }
  ];

  it.each(scenarios)('$name', ({input, total}) => {
    expect(priceLine(input).totalAmount).toBe(total);
  });

  it('rejects unsafe or floating money', () => {
    expect(() => priceLine({id: 'x', quantity: 1, baseUnitAmount: 1.5})).toThrow();
    expect(() => priceLine({id: 'x', quantity: 1, baseUnitAmount: Number.MAX_VALUE})).toThrow();
  });
});
