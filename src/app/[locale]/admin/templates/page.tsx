import {setRequestLocale} from 'next-intl/server';

import {TemplateEditor} from '@/features/admin/components/template-editor';
import {getAdminResource} from '@/features/admin/resource-registry';
import {listAdminRows} from '@/features/admin/server/admin-data';
import {requirePermission} from '@/features/auth/server/authorization';
import type {AppLocale} from '@/i18n/routing';
import {createAdminClient} from '@/lib/supabase/admin';

export default async function TemplatesPage({params}: {params: Promise<{locale: AppLocale}>}) {
  const {locale} = await params;
  setRequestLocale(locale);
  await requirePermission(locale, 'settings.manage');
  const resource = getAdminResource('notificationTemplates');
  if (!resource) return null;
  const admin = createAdminClient();
  const [{rows}, {data: locales}] = await Promise.all([
    listAdminRows(resource, {pageSize: 100, sort: 'template_key', direction: 'asc'}),
    admin.from('locales').select('code,native_name').eq('enabled', true).order('sort_order')
  ]);
  return <TemplateEditor initialTemplates={rows} locales={locales ?? []} />;
}
