import {getTranslations, setRequestLocale} from 'next-intl/server';
import {requireUser} from '@/features/auth/server/authorization';
import {LoyaltyDashboard} from '@/features/growth/components/loyalty-dashboard';
import {getLoyaltyDashboard} from '@/features/growth/server/queries';
import type {AppLocale} from '@/i18n/routing';
export default async function LoyaltyPage({params}: {params: Promise<{locale: AppLocale}>}) {
  const {locale} = await params;
  setRequestLocale(locale);
  const identity = await requireUser(locale);
  const [data, t] = await Promise.all([
    getLoyaltyDashboard(identity.user.id),
    getTranslations('Growth.loyalty')
  ]);
  return (
    <main className="account-page growth-page">
      <header className="account-page-heading">
        <div>
          <p>{t('eyebrow')}</p>
          <h1>{t('title')}</h1>
          <span>{t('description')}</span>
        </div>
      </header>
      <LoyaltyDashboard data={data} locale={locale} t={(key, values) => t(key, values)} />
    </main>
  );
}
