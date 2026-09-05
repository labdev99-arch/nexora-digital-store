import {notFound} from 'next/navigation';
import {setRequestLocale} from 'next-intl/server';

import {AdminResourceConsole} from '@/features/admin/components/admin-resource-console';
import {getAdminResource} from '@/features/admin/resource-registry';
import {listAdminRows} from '@/features/admin/server/admin-data';
import {requirePermission} from '@/features/auth/server/authorization';
import type {AppLocale} from '@/i18n/routing';

export default async function AdminResourcePage({
  params,
  searchParams
}: {
  params: Promise<{locale: AppLocale; resource: string}>;
  searchParams: Promise<{page?: string; q?: string}>;
}) {
  const {locale, resource: key} = await params;
  const query = await searchParams;
  setRequestLocale(locale);
  const resource = getAdminResource(key);
  if (!resource) notFound();
  const identity = await requirePermission(locale, resource.permission);
  const data = await listAdminRows(resource, {
    page: Number(query.page ?? 1),
    query: query.q
  });
  return (
    <AdminResourceConsole
      resource={resource}
      initialData={data}
      canImportExport={identity.permissions.includes('import_export.manage')}
    />
  );
}
