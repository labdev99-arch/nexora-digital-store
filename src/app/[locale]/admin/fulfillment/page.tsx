import {getTranslations, setRequestLocale} from 'next-intl/server';

import {requirePermission} from '@/features/auth/server/authorization';
import {FulfillmentConsole} from '@/features/fulfillment/components/fulfillment-console';
import {getFulfillmentDashboard} from '@/features/fulfillment/server/queries';
import type {AppLocale} from '@/i18n/routing';

export default async function Page({params}: {params: Promise<{locale: AppLocale}>}) {
  const {locale} = await params;
  setRequestLocale(locale);
  await requirePermission(locale, 'fulfillment.manage');
  const [dashboard, t] = await Promise.all([
    getFulfillmentDashboard(),
    getTranslations({locale, namespace: 'FulfillmentAdmin'})
  ]);
  return (
    <div className="account-page">
      <header className="account-page-heading">
        <div>
          <span className="section-eyebrow">{t('eyebrow')}</span>
          <h1>{t('title')}</h1>
          <p>{t('description')}</p>
        </div>
      </header>
      <FulfillmentConsole
        jobs={dashboard.jobs}
        deadLetterCount={dashboard.deadLetters.length}
        tasks={dashboard.tasks}
        suppliers={dashboard.suppliers}
        variants={dashboard.variants}
        reliability={dashboard.reliability}
        performance={dashboard.performance}
      />
    </div>
  );
}
