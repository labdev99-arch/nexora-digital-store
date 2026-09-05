import {getTranslations, setRequestLocale} from 'next-intl/server';
import {requirePermission} from '@/features/auth/server/authorization';
import {AdminPaymentQueue} from '@/features/payments/components/admin-payment-console';
import {getPaymentVerificationQueue} from '@/features/payments/server/queries';
import {Link} from '@/i18n/navigation';
import type {AppLocale} from '@/i18n/routing';
export default async function Page({params}: {params: Promise<{locale: AppLocale}>}) {
  const {locale} = await params;
  setRequestLocale(locale);
  await requirePermission(locale, 'finance.manage');
  const [items, t] = await Promise.all([
    getPaymentVerificationQueue(),
    getTranslations({locale, namespace: 'PaymentAdmin'})
  ]);
  return (
    <div className="account-page">
      <header className="account-page-heading">
        <div>
          <span className="section-eyebrow">{t('eyebrow')}</span>
          <h1>{t('title')}</h1>
          <p>{t('description')}</p>
        </div>
        <Link className="ui-button ui-button-outline ui-button-md" href="/admin/payments/methods">
          {t('manageMethods')}
        </Link>
      </header>
      <AdminPaymentQueue items={items} />
    </div>
  );
}
