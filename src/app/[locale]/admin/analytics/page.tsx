import {getTranslations, setRequestLocale} from 'next-intl/server';

import {RetentionAnalytics} from '@/features/admin/components/retention-analytics';
import {getRetentionData} from '@/features/admin/server/analytics';
import {requirePermission} from '@/features/auth/server/authorization';
import type {AppLocale} from '@/i18n/routing';

export default async function AnalyticsPage({
  params,
  searchParams
}: {
  params: Promise<{locale: AppLocale}>;
  searchParams: Promise<{currency?: string}>;
}) {
  const {locale} = await params;
  const {currency = 'USD'} = await searchParams;
  setRequestLocale(locale);
  await requirePermission(locale, 'analytics.read');
  const [data, t] = await Promise.all([
    getRetentionData(currency),
    getTranslations({locale, namespace: 'Admin.analytics'})
  ]);
  return (
    <main className="account-page admin-retention-page">
      <header className="account-page-heading">
        <div>
          <span className="section-eyebrow">{t('eyebrow')}</span>
          <h1>{t('title')}</h1>
          <p>{t('description')}</p>
        </div>
      </header>
      <RetentionAnalytics data={data} currency={currency} />
    </main>
  );
}
