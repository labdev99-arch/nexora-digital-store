// @vitest-environment node

import {mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

import {createOrderPdf} from './order-document';

const order = {
  order_number: 'NXR-20260814-00000001',
  currency_code: 'USD',
  subtotal_amount: 5000,
  discount_amount: 500,
  fee_amount: 100,
  tax_amount: 506,
  total_amount: 5106,
  paid_amount: 5106,
  created_at: '2026-08-14T12:00:00.000Z'
};
const items = [
  {
    product_name: {en: 'Premium digital subscription', ar: 'اشتراك رقمي مميز'},
    variant_name: {en: 'Private · 12 months', ar: 'خاص · 12 شهرًا'},
    quantity: 1,
    total_amount: 5106
  }
];

describe('localized order documents', () => {
  it.each(['en', 'ar'] as const)('creates a valid %s invoice PDF', async (locale) => {
    const pdf = await createOrderPdf(locale, 'invoice', order, items);
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.byteLength).toBeGreaterThan(1_500);
    if (process.env.ORDER_PDF_QA_DIR) {
      mkdirSync(process.env.ORDER_PDF_QA_DIR, {recursive: true});
      writeFileSync(path.join(process.env.ORDER_PDF_QA_DIR, `invoice-${locale}.pdf`), pdf);
    }
  });
});
