import {NextResponse} from 'next/server';

import {getAuthContext} from '@/features/auth/server/authorization';
import {getAdminResource} from '@/features/admin/resource-registry';
import {createAdminRow, listAdminRows, requestMetadata} from '@/features/admin/server/admin-data';

async function authorize(resourceKey: string) {
  const resource = getAdminResource(resourceKey);
  const identity = await getAuthContext();
  if (!resource || !identity || !identity.permissions.includes(resource.permission)) return null;
  return {resource, identity};
}

export async function GET(request: Request, {params}: {params: Promise<{resource: string}>}) {
  const {resource: key} = await params;
  const authorized = await authorize(key);
  if (!authorized) return NextResponse.json({error: 'forbidden'}, {status: 403});
  const url = new URL(request.url);
  try {
    const data = await listAdminRows(authorized.resource, {
      page: Number(url.searchParams.get('page') ?? 1),
      pageSize: Number(url.searchParams.get('pageSize') ?? 25),
      query: url.searchParams.get('q') ?? undefined,
      filterField: url.searchParams.get('filterField') ?? undefined,
      filterValue: url.searchParams.get('filterValue') ?? undefined,
      sort: url.searchParams.get('sort') ?? undefined,
      direction: url.searchParams.get('direction') === 'asc' ? 'asc' : 'desc'
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {error: error instanceof Error ? error.message : 'resource_list_failed'},
      {status: 400}
    );
  }
}

export async function POST(request: Request, {params}: {params: Promise<{resource: string}>}) {
  const {resource: key} = await params;
  const authorized = await authorize(key);
  if (!authorized) return NextResponse.json({error: 'forbidden'}, {status: 403});
  try {
    const row = await createAdminRow(
      authorized.resource,
      authorized.identity,
      requestMetadata(request),
      await request.json()
    );
    return NextResponse.json({row}, {status: 201});
  } catch (error) {
    return NextResponse.json(
      {error: error instanceof Error ? error.message : 'resource_create_failed'},
      {status: 400}
    );
  }
}
