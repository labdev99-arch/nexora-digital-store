import {NextResponse} from 'next/server';
import {z} from 'zod';

import {getAdminResource} from '@/features/admin/resource-registry';
import {listSavedAdminFilters, saveAdminFilter} from '@/features/admin/server/admin-data';
import {getAuthContext} from '@/features/auth/server/authorization';

const saveSchema = z.object({
  resource: z.string().min(1).max(80),
  name: z.string().trim().min(1).max(80),
  filters: z.record(z.string(), z.unknown()),
  sort: z.record(z.string(), z.unknown())
});

export async function GET(request: Request) {
  const identity = await getAuthContext();
  const resource = getAdminResource(new URL(request.url).searchParams.get('resource') ?? '');
  if (!identity || !resource || !identity.permissions.includes(resource.permission))
    return NextResponse.json({error: 'forbidden'}, {status: 403});
  return NextResponse.json({filters: await listSavedAdminFilters(identity.user.id, resource.key)});
}

export async function POST(request: Request) {
  const identity = await getAuthContext();
  if (!identity) return NextResponse.json({error: 'forbidden'}, {status: 403});
  try {
    const input = saveSchema.parse(await request.json());
    const resource = getAdminResource(input.resource);
    if (!resource || !identity.permissions.includes(resource.permission))
      return NextResponse.json({error: 'forbidden'}, {status: 403});
    const filter = await saveAdminFilter(
      identity.user.id,
      resource.key,
      input.name,
      input.filters,
      input.sort
    );
    return NextResponse.json({filter}, {status: 201});
  } catch (error) {
    return NextResponse.json(
      {error: error instanceof Error ? error.message : 'filter_save_failed'},
      {status: 400}
    );
  }
}
