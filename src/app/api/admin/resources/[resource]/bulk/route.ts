import {NextResponse} from 'next/server';
import {z} from 'zod';

import {getAdminResource} from '@/features/admin/resource-registry';
import {bulkDeleteAdminRows, requestMetadata} from '@/features/admin/server/admin-data';
import {getAuthContext} from '@/features/auth/server/authorization';

const bulkSchema = z.object({action: z.literal('delete'), ids: z.array(z.uuid()).min(1).max(100)});

export async function POST(request: Request, {params}: {params: Promise<{resource: string}>}) {
  const {resource: key} = await params;
  const resource = getAdminResource(key);
  const identity = await getAuthContext();
  if (!resource || !identity || !identity.permissions.includes(resource.permission))
    return NextResponse.json({error: 'forbidden'}, {status: 403});
  try {
    const input = bulkSchema.parse(await request.json());
    const count = await bulkDeleteAdminRows(
      resource,
      identity,
      requestMetadata(request),
      input.ids
    );
    return NextResponse.json({count});
  } catch (error) {
    return NextResponse.json(
      {error: error instanceof Error ? error.message : 'bulk_action_failed'},
      {status: 400}
    );
  }
}
