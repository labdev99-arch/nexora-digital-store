import {NextResponse} from 'next/server';

import {getAuthContext} from '@/features/auth/server/authorization';
import {wholesaleCatalog} from '@/features/reseller/server/reseller-service';

function csvCell(value: unknown) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const identity = await getAuthContext();
  if (!identity?.permissions.includes('reseller.access'))
    return NextResponse.json({error: 'forbidden'}, {status: 403});
  const url = new URL(request.url);
  const catalog = await wholesaleCatalog(
    identity.user.id,
    url.searchParams.get('currency') ?? undefined
  );
  const rows = catalog.products.map((item) => ({
    variant_id: item.id,
    sku: item.sku,
    product: item.products.name.en ?? item.sku,
    currency: item.currency_code,
    price_amount: item.wholesale_price_amount,
    available: item.available
  }));
  if (url.searchParams.get('format') === 'csv') {
    const headings = ['variant_id', 'sku', 'product', 'currency', 'price_amount', 'available'];
    const csv = [
      headings.join(','),
      ...rows.map((row) => headings.map((key) => csvCell(row[key as keyof typeof row])).join(','))
    ].join('\n');
    return new Response(`\uFEFF${csv}`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="nexora-wholesale-prices.csv"'
      }
    });
  }
  const payload = {tier: catalog.tier.code, rows};
  if (url.searchParams.get('format') === 'json') {
    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="nexora-wholesale-prices.json"'
      }
    });
  }
  return NextResponse.json(payload);
}
