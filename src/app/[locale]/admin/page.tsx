import {setRequestLocale} from 'next-intl/server';

import {AdminDashboard} from '@/features/admin/components/admin-dashboard';
import {AdminResourceHub} from '@/features/admin/components/resource-hub';
import {getAdminDashboard} from '@/features/admin/server/analytics';
import {requirePermission} from '@/features/auth/server/authorization';
import type {AppLocale} from '@/i18n/routing';
import {createAdminClient} from '@/lib/supabase/admin';

export default async function AdminPage({
  params,
  searchParams
}: {
  params: Promise<{locale: AppLocale}>;
  searchParams: Promise<{range?: string; currency?: string}>;
}) {
  const {locale} = await params;
  const query = await searchParams;
  setRequestLocale(locale);
  const identity = await requirePermission(locale, 'admin.access');
  if (!identity.permissions.includes('analytics.read')) {
    return <AdminResourceHub permissions={identity.permissions} />;
  }
  const admin = createAdminClient();
  const {data: currencyRows} = await admin
    .from('currencies')
    .select('code')
    .eq('enabled', true)
    .order('is_base', {ascending: false});
  const currencies = currencyRows?.map((row) => row.code) ?? ['USD'];
  const currency = currencies.includes(query.currency ?? '') ? (query.currency ?? 'USD') : 'USD';
  const allowedRanges = new Set([7, 30, 90, 365]);
  const range = Number(query.range ?? 30);
  const days = allowedRanges.has(range) ? range : 30;
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const data = await getAdminDashboard({from, to, currency, locale});
  return <AdminDashboard data={data} currencies={currencies} range={days} />;
}
