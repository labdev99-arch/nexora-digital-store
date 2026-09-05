import {NextResponse} from 'next/server';

import {getAuthContext} from '@/features/auth/server/authorization';
import {importStockCodes} from '@/features/fulfillment/server/stock-import';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const identity = await getAuthContext();
  if (!identity?.permissions.includes('fulfillment.manage'))
    return NextResponse.json({error: 'forbidden'}, {status: 403});
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({error: 'file_required'}, {status: 400});
  try {
    const result = await importStockCodes(identity.user.id, {
      variantId: form.get('variantId'),
      filename: file.name,
      csv: await file.text()
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {error: error instanceof Error ? error.message : 'stock_import_failed'},
      {status: 400}
    );
  }
}
