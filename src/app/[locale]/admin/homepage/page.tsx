import {setRequestLocale} from 'next-intl/server';

import {HomepageBuilder} from '@/features/admin/components/homepage-builder';
import {getAdminResource} from '@/features/admin/resource-registry';
import {listAdminRows} from '@/features/admin/server/admin-data';
import {requirePermission} from '@/features/auth/server/authorization';
import type {AppLocale} from '@/i18n/routing';

export default async function HomepageBuilderPage({
  params
}: {
  params: Promise<{locale: AppLocale}>;
}) {
  const {locale} = await params;
  setRequestLocale(locale);
  await requirePermission(locale, 'marketing.manage');
  const resource = getAdminResource('homepageSections');
  if (!resource) return null;
  const {rows} = await listAdminRows(resource, {
    pageSize: 100,
    sort: 'sort_order',
    direction: 'asc'
  });
  return <HomepageBuilder initialSections={rows} />;
}
