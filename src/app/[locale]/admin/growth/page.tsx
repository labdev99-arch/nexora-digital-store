import {getTranslations, setRequestLocale} from 'next-intl/server';
import {requirePermission} from '@/features/auth/server/authorization';
import {GrowthAdminReportView} from '@/features/growth/components/growth-admin-report';
import {getGrowthAdminReport} from '@/features/growth/server/queries';
import {Link} from '@/i18n/navigation';
import type {AppLocale} from '@/i18n/routing';
export default async function AdminGrowthPage({params}: {params: Promise<{locale: AppLocale}>}) {
  const {locale} = await params;
  setRequestLocale(locale);
  await requirePermission(locale, 'affiliate.manage');
  const [data, t] = await Promise.all([getGrowthAdminReport(), getTranslations('Growth.admin')]);
  return (
    <main className="account-page growth-page admin-growth-page">
      <header className="account-page-heading">
        <div>
          <p>{t('eyebrow')}</p>
          <h1>{t('title')}</h1>
          <span>{t('description')}</span>
        </div>
        <div className="growth-admin-links">
          <Link href="/admin/resources/affiliates">{t('manageAffiliates')}</Link>
          <Link href="/admin/resources/loyaltyRules">{t('manageRules')}</Link>
          <Link href="/admin/resources/tiers">{t('manageTiers')}</Link>
        </div>
      </header>
      <GrowthAdminReportView data={data} t={(key, values) => t(key, values)} />
    </main>
  );
}
