import {NextResponse} from 'next/server';

import {getAdminResource} from '@/features/admin/resource-registry';
import {deleteAdminRow, requestMetadata, updateAdminRow} from '@/features/admin/server/admin-data';
import {getAuthContext} from '@/features/auth/server/authorization';

async function authorize(resourceKey: string) {
  const resource = getAdminResource(resourceKey);
  const identity = await getAuthContext();
  if (!resource || !identity || !identity.permissions.includes(resource.permission)) return null;
  return {resource, identity};
}

export async function PATCH(
  request: Request,
  {params}: {params: Promise<{resource: string; id: string}>}
) {
  const {resource: key, id} = await params;
  const authorized = await authorize(key);
  if (!authorized) return NextResponse.json({error: 'forbidden'}, {status: 403});
  try {
    const row = await updateAdminRow(
      authorized.resource,
      authorized.identity,
      requestMetadata(request),
      id,
      await request.json()
    );
    return NextResponse.json({row});
  } catch (error) {
    return NextResponse.json(
      {error: error instanceof Error ? error.message : 'resource_update_failed'},
      {status: 400}
    );
  }
}

export async function DELETE(
  request: Request,
  {params}: {params: Promise<{resource: string; id: string}>}
) {
  const {resource: key, id} = await params;
  const authorized = await authorize(key);
  if (!authorized) return NextResponse.json({error: 'forbidden'}, {status: 403});
  try {
    await deleteAdminRow(authorized.resource, authorized.identity, requestMetadata(request), id);
    return new NextResponse(null, {status: 204});
  } catch (error) {
    return NextResponse.json(
      {error: error instanceof Error ? error.message : 'resource_delete_failed'},
      {status: 400}
    );
  }
}
