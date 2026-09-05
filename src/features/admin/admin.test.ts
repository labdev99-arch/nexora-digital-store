import {describe, expect, it} from 'vitest';

import {adminResourceKeys, getAdminResource} from './resource-registry';
import {parseCsv, parseExcelXml, rowsToCsv, rowsToExcelXml} from './server/tabular';

describe('Phase 7 administrative registry', () => {
  it('covers every requested administrative domain with a permission', () => {
    expect(adminResourceKeys).toEqual(
      expect.arrayContaining([
        'products',
        'variants',
        'categories',
        'stockCodes',
        'suppliers',
        'orders',
        'users',
        'roles',
        'wallets',
        'payments',
        'coupons',
        'flashSales',
        'tiers',
        'loyaltyRules',
        'affiliates',
        'tickets',
        'reviews',
        'blogPosts',
        'pages',
        'banners'
      ])
    );
    expect(adminResourceKeys.every((key) => Boolean(getAdminResource(key)?.permission))).toBe(true);
  });

  it('does not expose generic mutations for invariant-sensitive records', () => {
    for (const key of ['wallets', 'payments', 'orders', 'stockCodes']) {
      const resource = getAdminResource(key);
      expect(resource?.canCreate).toBe(false);
      expect(resource?.canUpdate).toBe(false);
      expect(resource?.canDelete).toBe(false);
    }
  });

  it('rejects unknown resource names', () => {
    expect(getAdminResource('wallet_transactions')).toBeNull();
    expect(getAdminResource('supplier_credentials')).toBeNull();
  });
});

describe('Phase 7 tabular interchange', () => {
  const rows = [{id: '1', name: 'Nexora, "Gold"', metadata: {locale: 'ar'}}];
  const columns = ['id', 'name', 'metadata'] as const;

  it('round-trips quoted CSV and a UTF-8 BOM', () => {
    const csv = rowsToCsv(rows, columns);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(parseCsv(csv)).toEqual([{id: '1', name: 'Nexora, "Gold"', metadata: '{"locale":"ar"}'}]);
  });

  it('round-trips SpreadsheetML and escapes markup', () => {
    const xml = rowsToExcelXml(rows, columns);
    expect(xml).toContain('&quot;Gold&quot;');
    expect(parseExcelXml(xml)).toEqual([
      {id: '1', name: 'Nexora, "Gold"', metadata: '{"locale":"ar"}'}
    ]);
  });
});
