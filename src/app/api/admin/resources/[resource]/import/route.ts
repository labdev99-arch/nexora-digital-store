import {NextResponse} from 'next/server';

import {getAdminResource} from '@/features/admin/resource-registry';
import {createAdminRow, requestMetadata} from '@/features/admin/server/admin-data';
import {parseCsv, parseExcelXml} from '@/features/admin/server/tabular';
import {getAuthContext} from '@/features/auth/server/authorization';

export async function POST(request: Request, {params}: {params: Promise<{resource: string}>}) {
  const {resource: key} = await params;
  const resource = getAdminResource(key);
  const identity = await getAuthContext();
  if (
    !resource ||
    !identity ||
    !identity.permissions.includes(resource.permission) ||
    !identity.permissions.includes('import_export.manage') ||
    !resource.canCreate
  )
    return NextResponse.json({error: 'forbidden'}, {status: 403});
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size < 1 || file.size > 5 * 1024 * 1024)
      return NextResponse.json({error: 'invalid_file'}, {status: 400});
    const source = await file.text();
    const parsed = source.includes('<Workbook') ? parseExcelXml(source) : parseCsv(source);
    const rows = parsed.slice(0, 1000);
    const metadata = requestMetadata(request);
    const errors: Array<{row: number; error: string}> = [];
    let imported = 0;
    for (const [index, row] of rows.entries()) {
      try {
        await createAdminRow(resource, identity, metadata, row);
        imported += 1;
      } catch (error) {
        errors.push({
          row: index + 2,
          error: error instanceof Error ? error.message : 'invalid_row'
        });
      }
    }
    return NextResponse.json({imported, rejected: errors.length, errors: errors.slice(0, 100)});
  } catch (error) {
    return NextResponse.json(
      {error: error instanceof Error ? error.message : 'import_failed'},
      {status: 400}
    );
  }
}
