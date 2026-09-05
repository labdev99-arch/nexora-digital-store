import 'server-only';

import {createHash, randomUUID} from 'node:crypto';

import {z} from 'zod';

import type {AuthContext} from '@/features/auth/server/authorization';
import type {AdminField, AdminResourceDefinition} from '../resource-registry';

export type AdminRow = {id: string} & Record<string, unknown>;

type ListOptions = {
  page?: number;
  pageSize?: number;
  query?: string;
  filterField?: string;
  filterValue?: string;
  sort?: string;
  direction?: 'asc' | 'desc';
};

type RequestMetadata = {ipAddress: string | null; userAgent: string | null; requestId: string};

function trustedConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase trusted server credentials are not configured.');
  return {url: `${url}/rest/v1`, key};
}

async function trustedRequest(path: string, init?: RequestInit): Promise<Response> {
  const {url, key} = trustedConfig();
  const response = await fetch(`${url}/${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...init?.headers
    }
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as {message?: string} | null;
    throw new Error(error?.message ?? `admin_data_request_failed_${response.status}`);
  }
  return response;
}

function safeSearch(value: string): string {
  return value
    .replace(/[,*()]/g, ' ')
    .trim()
    .slice(0, 120);
}

function selectedColumns(resource: AdminResourceDefinition): string {
  return [...new Set(['id', ...resource.listColumns, ...resource.fields.map((field) => field.key)])]
    .filter((column) => /^[a-z][a-z0-9_]*$/.test(column))
    .join(',');
}

export async function listAdminRows(
  resource: AdminResourceDefinition,
  options: ListOptions = {}
): Promise<{rows: AdminRow[]; count: number; page: number; pages: number}> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 25));
  const from = (page - 1) * pageSize;
  const params = new URLSearchParams({select: selectedColumns(resource)});
  if (resource.softDelete) params.set('deleted_at', 'is.null');
  const query = safeSearch(options.query ?? '');
  if (query && resource.searchColumns.length > 0) {
    params.set(
      'or',
      `(${resource.searchColumns.map((column) => `${column}.ilike.*${query}*`).join(',')})`
    );
  }
  if (
    options.filterField &&
    resource.fields.some((field) => field.key === options.filterField) &&
    options.filterValue
  ) {
    params.set(options.filterField, `eq.${options.filterValue}`);
  }
  const allowedSort = new Set(['created_at', 'updated_at', ...resource.listColumns]);
  const sort = allowedSort.has(options.sort ?? '') ? options.sort : 'created_at';
  params.set('order', `${sort}.${options.direction === 'asc' ? 'asc' : 'desc'}.nullslast`);
  const response = await trustedRequest(`${resource.table}?${params}`, {
    headers: {Range: `${from}-${from + pageSize - 1}`, Prefer: 'count=exact'}
  });
  const rows = (await response.json()) as AdminRow[];
  const range = response.headers.get('content-range');
  const count = Number(range?.split('/')[1] ?? rows.length);
  return {rows, count, page, pages: Math.max(1, Math.ceil(count / pageSize))};
}

export async function getAdminRow(
  resource: AdminResourceDefinition,
  id: string
): Promise<AdminRow | null> {
  const response = await trustedRequest(
    `${resource.table}?id=eq.${encodeURIComponent(id)}&select=${selectedColumns(resource)}&limit=1`
  );
  const rows = (await response.json()) as AdminRow[];
  return rows[0] ?? null;
}

function schemaForField(field: AdminField): z.ZodType {
  const base =
    field.type === 'number'
      ? z.coerce.number().int().safe()
      : field.type === 'boolean'
        ? z.boolean()
        : field.type === 'json'
          ? z.json()
          : field.type === 'datetime'
            ? z.iso.datetime({offset: true})
            : field.type === 'select'
              ? z.string().refine((value) => field.options?.includes(value) ?? false)
              : z.string().max(20000);
  return field.required ? base : base.nullable().optional();
}

export function normalizeAdminPayload(
  resource: AdminResourceDefinition,
  input: unknown,
  partial = false
): Record<string, unknown> {
  const record = z.record(z.string(), z.unknown()).parse(input);
  const output: Record<string, unknown> = {};
  for (const field of resource.fields) {
    if (field.readOnly || !(field.key in record)) continue;
    let value = record[field.key];
    if (value === '' && !field.required) {
      output[field.key] = null;
      continue;
    }
    if (field.type === 'json' && typeof value === 'string') value = JSON.parse(value);
    if (field.type === 'datetime' && value === '') value = null;
    output[field.key] = schemaForField(field).parse(value);
  }
  if (!partial) {
    for (const field of resource.fields.filter((item) => item.required)) {
      if (!(field.key in output)) throw new Error(`missing_${field.key}`);
    }
  }
  if (Object.keys(output).length === 0) throw new Error('empty_admin_payload');
  return output;
}

async function writeAudit(
  identity: AuthContext,
  metadata: RequestMetadata,
  action: string,
  resource: AdminResourceDefinition,
  resourceId: string | null,
  before: AdminRow | null,
  after: AdminRow | null
) {
  await trustedRequest('audit_logs', {
    method: 'POST',
    headers: {Prefer: 'return=minimal'},
    body: JSON.stringify({
      actor_id: identity.user.id,
      actor_type: 'admin',
      action,
      resource_type: resource.key,
      resource_id: resourceId,
      before,
      after,
      request_id: metadata.requestId,
      ip_address: metadata.ipAddress,
      ip_hash: metadata.ipAddress
        ? createHash('sha256').update(metadata.ipAddress).digest('hex')
        : null,
      user_agent: metadata.userAgent?.slice(0, 1024) ?? null,
      user_agent_hash: metadata.userAgent
        ? createHash('sha256').update(metadata.userAgent).digest('hex')
        : null
    })
  });
}

export function requestMetadata(request: Request): RequestMetadata {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const validIp = forwarded && /^[0-9a-f:.]+$/i.test(forwarded) ? forwarded : null;
  return {
    ipAddress: validIp,
    userAgent: request.headers.get('user-agent'),
    requestId: request.headers.get('x-request-id') ?? randomUUID()
  };
}

export async function createAdminRow(
  resource: AdminResourceDefinition,
  identity: AuthContext,
  metadata: RequestMetadata,
  input: unknown
): Promise<AdminRow> {
  if (!resource.canCreate) throw new Error('resource_create_protected');
  const payload = normalizeAdminPayload(resource, input);
  const response = await trustedRequest(resource.table, {
    method: 'POST',
    headers: {Prefer: 'return=representation'},
    body: JSON.stringify(payload)
  });
  const row = ((await response.json()) as AdminRow[])[0];
  if (!row) throw new Error('resource_create_failed');
  await writeAudit(identity, metadata, 'create', resource, row.id, null, row);
  return row;
}

export async function updateAdminRow(
  resource: AdminResourceDefinition,
  identity: AuthContext,
  metadata: RequestMetadata,
  id: string,
  input: unknown
): Promise<AdminRow> {
  if (!resource.canUpdate) throw new Error('resource_update_protected');
  const before = await getAdminRow(resource, id);
  if (!before) throw new Error('resource_not_found');
  const payload = normalizeAdminPayload(resource, input, true);
  if (resource.table === 'reseller_accounts' && 'manual_tier_id' in payload) {
    payload.manual_override_by = identity.user.id;
    payload.manual_override_at = new Date().toISOString();
  }
  const response = await trustedRequest(`${resource.table}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {Prefer: 'return=representation'},
    body: JSON.stringify(payload)
  });
  const after = ((await response.json()) as AdminRow[])[0];
  if (!after) throw new Error('resource_update_failed');
  await writeAudit(identity, metadata, 'update', resource, id, before, after);
  return after;
}

export async function deleteAdminRow(
  resource: AdminResourceDefinition,
  identity: AuthContext,
  metadata: RequestMetadata,
  id: string
): Promise<void> {
  if (!resource.canDelete) throw new Error('resource_delete_protected');
  const before = await getAdminRow(resource, id);
  if (!before) throw new Error('resource_not_found');
  await trustedRequest(`${resource.table}?id=eq.${encodeURIComponent(id)}`, {
    method: resource.softDelete ? 'PATCH' : 'DELETE',
    headers: {Prefer: 'return=minimal'},
    body: resource.softDelete ? JSON.stringify({deleted_at: new Date().toISOString()}) : undefined
  });
  await writeAudit(
    identity,
    metadata,
    resource.softDelete ? 'archive' : 'delete',
    resource,
    id,
    before,
    null
  );
}

export async function bulkDeleteAdminRows(
  resource: AdminResourceDefinition,
  identity: AuthContext,
  metadata: RequestMetadata,
  ids: string[]
): Promise<number> {
  const uniqueIds = [...new Set(ids)].slice(0, 100);
  for (const id of uniqueIds) await deleteAdminRow(resource, identity, metadata, id);
  return uniqueIds.length;
}

export async function exportAdminRows(
  resource: AdminResourceDefinition,
  query?: string
): Promise<AdminRow[]> {
  const params = new URLSearchParams({
    select: selectedColumns(resource),
    order: 'created_at.desc.nullslast'
  });
  if (resource.softDelete) params.set('deleted_at', 'is.null');
  const search = safeSearch(query ?? '');
  if (search && resource.searchColumns.length > 0) {
    params.set(
      'or',
      `(${resource.searchColumns.map((column) => `${column}.ilike.*${search}*`).join(',')})`
    );
  }
  const response = await trustedRequest(`${resource.table}?${params}`, {
    headers: {Range: '0-9999'}
  });
  return (await response.json()) as AdminRow[];
}

export async function listSavedAdminFilters(ownerId: string, resource: string) {
  const params = new URLSearchParams({
    owner_id: `eq.${ownerId}`,
    resource: `eq.${resource}`,
    deleted_at: 'is.null',
    select: 'id,name,filters,sort,is_default',
    order: 'name.asc'
  });
  const response = await trustedRequest(`admin_saved_filters?${params}`);
  return (await response.json()) as Array<{
    id: string;
    name: string;
    filters: Record<string, unknown>;
    sort: Record<string, unknown>;
    is_default: boolean;
  }>;
}

export async function saveAdminFilter(
  ownerId: string,
  resource: string,
  name: string,
  filters: Record<string, unknown>,
  sort: Record<string, unknown>
) {
  const response = await trustedRequest('admin_saved_filters?on_conflict=owner_id,resource,name', {
    method: 'POST',
    headers: {Prefer: 'resolution=merge-duplicates,return=representation'},
    body: JSON.stringify({owner_id: ownerId, resource, name, filters, sort})
  });
  return ((await response.json()) as AdminRow[])[0];
}
