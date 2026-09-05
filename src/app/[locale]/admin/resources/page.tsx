import {setRequestLocale} from 'next-intl/server';

import {AdminResourceHub} from '@/features/admin/components/resource-hub';
import {requirePermission} from '@/features/auth/server/authorization';
import type {AppLocale} from '@/i18n/routing';

export default async function ResourcesPage({params}: {params: Promise<{locale: AppLocale}>}) {
  const {locale} = await params;
  setRequestLocale(locale);
  const identity = await requirePermission(locale, 'admin.access');
  return <AdminResourceHub permissions={identity.permissions} />;
}
