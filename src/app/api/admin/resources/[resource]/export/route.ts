import {NextResponse} from 'next/server';

import {getAdminResource} from '@/features/admin/resource-registry';
import {exportAdminRows} from '@/features/admin/server/admin-data';
import {rowsToCsv, rowsToExcelXml} from '@/features/admin/server/tabular';
import {getAuthContext} from '@/features/auth/server/authorization';

export async function GET(request: Request, {params}: {params: Promise<{resource: string}>}) {
  const {resource: key} = await params;
  const resource = getAdminResource(key);
  const identity = await getAuthContext();
  if (
    !resource ||
    !identity ||
    !identity.permissions.includes(resource.permission) ||
    !identity.permissions.includes('import_export.manage')
  )
    return NextResponse.json({error: 'forbidden'}, {status: 403});
  const url = new URL(request.url);
  const format = url.searchParams.get('format') === 'xls' ? 'xls' : 'csv';
  const rows = await exportAdminRows(resource, url.searchParams.get('q') ?? undefined);
  const columns = [
    ...new Set(['id', ...resource.listColumns, ...resource.fields.map((field) => field.key)])
  ];
  const body = format === 'xls' ? rowsToExcelXml(rows, columns) : rowsToCsv(rows, columns);
  return new NextResponse(body, {
    headers: {
      'Content-Type':
        format === 'xls' ? 'application/vnd.ms-excel; charset=utf-8' : 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${resource.key}-${new Date().toISOString().slice(0, 10)}.${format}"`,
      'Cache-Control': 'private, no-store'
    }
  });
}
