import 'server-only';

import path from 'node:path';
import PDFDocument from 'pdfkit';
import type {AppLocale} from '@/i18n/routing';
import {formatMinorUnits} from '@/lib/money';
import type {Json} from '@/lib/supabase/database.types';

const arabicFontPath = path.join(
  process.cwd(),
  'node_modules',
  '@embedpdf',
  'fonts-arabic',
  'fonts',
  'NotoNaskhArabic-Regular.ttf'
);
const labels = {
  en: {
    invoice: 'Invoice',
    receipt: 'Receipt',
    order: 'Order',
    date: 'Date',
    item: 'Item',
    quantity: 'Qty',
    amount: 'Amount',
    subtotal: 'Subtotal',
    discount: 'Discount',
    fees: 'Fees',
    tax: 'Tax',
    total: 'Total',
    paid: 'Paid',
    thankYou: 'Thank you for choosing Nexora.'
  },
  ar: {
    invoice: 'فاتورة',
    receipt: 'إيصال',
    order: 'الطلب',
    date: 'التاريخ',
    item: 'المنتج',
    quantity: 'الكمية',
    amount: 'المبلغ',
    subtotal: 'المجموع الفرعي',
    discount: 'الخصم',
    fees: 'الرسوم',
    tax: 'الضريبة',
    total: 'الإجمالي',
    paid: 'المدفوع',
    thankYou: 'شكراً لاختيارك نكسورا.'
  }
} as const;
function localized(value: Json, locale: AppLocale) {
  return value && !Array.isArray(value) && typeof value === 'object'
    ? String(value[locale] ?? value.en ?? '')
    : '';
}
function cleanArabicPdfText(value: string) {
  return value
    .replace(/[.·•\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
export async function createOrderPdf(
  locale: AppLocale,
  kind: 'invoice' | 'receipt',
  order: {
    order_number: string;
    currency_code: string;
    subtotal_amount: number;
    discount_amount: number;
    fee_amount: number;
    tax_amount: number;
    total_amount: number;
    paid_amount: number;
    created_at: string;
  },
  items: Array<{product_name: Json; variant_name: Json; quantity: number; total_amount: number}>
) {
  const copy = labels[locale];
  const rtl = locale === 'ar';
  const doc = new PDFDocument({
    size: 'A4',
    margin: 48,
    bufferPages: true,
    info: {Title: `${copy[kind]} ${order.order_number}`}
  });
  const chunks: Uint8Array[] = [];
  doc.on('data', (chunk: Uint8Array) => chunks.push(chunk));
  const done = new Promise<Uint8Array>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  if (rtl) doc.registerFont('NexoraArabic', arabicFontPath).font('NexoraArabic');
  const text = (value: string, options: PDFKit.Mixins.TextOptions = {}) =>
    doc.text(value, {...options, align: rtl ? 'right' : options.align});
  const pair = (label: string, value: string, valueFont: 'NexoraArabic' | 'Helvetica') => {
    const y = doc.y;
    doc.font('NexoraArabic').text(label, 360, y, {width: 187, align: 'right'});
    const labelEnd = doc.y;
    doc.font(valueFont).text(value, 48, y, {width: 288, align: 'right'});
    doc.y = Math.max(labelEnd, doc.y) + 4;
  };
  doc.fontSize(26).fillColor('black');
  text(copy[kind]);
  doc.moveDown(0.2).fontSize(11).fillColor('gray');
  const formattedDate = new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeStyle: 'short'
  }).format(new Date(order.created_at));
  if (rtl) {
    pair(copy.order, order.order_number, 'Helvetica');
    pair(copy.date, formattedDate, 'NexoraArabic');
  } else {
    text(`${copy.order}: ${order.order_number}`);
    text(`${copy.date}: ${formattedDate}`);
  }
  doc.moveDown().fillColor('black');
  for (const item of items) {
    doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor('lightgray').stroke();
    doc.moveDown(0.5).fontSize(11);
    if (rtl) {
      text(cleanArabicPdfText(localized(item.product_name, locale)));
      doc.fontSize(10).fillColor('gray');
      text(cleanArabicPdfText(localized(item.variant_name, locale)));
    } else {
      text(`${localized(item.product_name, locale)} - ${localized(item.variant_name, locale)}`);
    }
    doc.fontSize(9).fillColor('gray');
    if (rtl) {
      pair(copy.quantity, String(item.quantity), 'Helvetica');
      pair(
        copy.amount,
        formatMinorUnits(item.total_amount, order.currency_code, 'en'),
        'Helvetica'
      );
    } else {
      text(
        `${copy.quantity}: ${item.quantity}    ${copy.amount}: ${formatMinorUnits(item.total_amount, order.currency_code, locale)}`
      );
    }
    doc.fillColor('black').moveDown(0.5);
  }
  doc.moveDown();
  const totals: [
    [string, number],
    [string, number],
    [string, number],
    [string, number],
    [string, number],
    [string, number]
  ] = [
    [copy.subtotal, order.subtotal_amount],
    [copy.discount, -order.discount_amount],
    [copy.fees, order.fee_amount],
    [copy.tax, order.tax_amount],
    [copy.total, order.total_amount],
    [copy.paid, order.paid_amount]
  ];
  for (const [label, amount] of totals) {
    doc.fontSize(label === copy.total ? 14 : 10);
    if (rtl) pair(label, formatMinorUnits(amount, order.currency_code, 'en'), 'Helvetica');
    else text(`${label}: ${formatMinorUnits(amount, order.currency_code, locale)}`);
  }
  doc.moveDown(2).fontSize(10).fillColor('gray');
  if (rtl) doc.font('NexoraArabic');
  text(rtl ? cleanArabicPdfText(copy.thankYou) : copy.thankYou);
  doc.end();
  return done;
}
