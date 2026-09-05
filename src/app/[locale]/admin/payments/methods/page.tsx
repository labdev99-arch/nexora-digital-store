import {getTranslations, setRequestLocale} from 'next-intl/server';
import {requirePermission} from '@/features/auth/server/authorization';
import {PaymentMethodsAdmin} from '@/features/payments/components/admin-payment-console';
import {getPaymentMethodsForAdmin} from '@/features/payments/server/queries';
import type {PaymentMethodRow} from '@/features/payments/types';
import type {AppLocale} from '@/i18n/routing';
export default async function Page({params}: {params: Promise<{locale: AppLocale}>}) {
  const {locale} = await params;
  setRequestLocale(locale);
  await requirePermission(locale, 'finance.manage');
  const [methods, t] = await Promise.all([
    getPaymentMethodsForAdmin(),
    getTranslations({locale, namespace: 'PaymentAdmin'})
  ]);
  return (
    <div className="account-page">
      <header className="account-page-heading">
        <div>
          <span className="section-eyebrow">{t('configEyebrow')}</span>
          <h1>{t('configTitle')}</h1>
          <p>{t('configDescription')}</p>
        </div>
      </header>
      <PaymentMethodsAdmin methods={methods as PaymentMethodRow[]} />
    </div>
  );
}
