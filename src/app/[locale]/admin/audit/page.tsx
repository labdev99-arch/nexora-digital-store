import {setRequestLocale} from 'next-intl/server';

import {AdminResourceConsole} from '@/features/admin/components/admin-resource-console';
import {getAdminResource} from '@/features/admin/resource-registry';
import {listAdminRows} from '@/features/admin/server/admin-data';
import {requirePermission} from '@/features/auth/server/authorization';
import type {AppLocale} from '@/i18n/routing';

export default async function AuditPage({params}: {params: Promise<{locale: AppLocale}>}) {
  const {locale} = await params;
  setRequestLocale(locale);
  const identity = await requirePermission(locale, 'audit.read');
  const resource = getAdminResource('auditLogs');
  if (!resource) return null;
  const data = await listAdminRows(resource);
  return (
    <AdminResourceConsole
      resource={resource}
      initialData={data}
      canImportExport={identity.permissions.includes('import_export.manage')}
    />
  );
}
