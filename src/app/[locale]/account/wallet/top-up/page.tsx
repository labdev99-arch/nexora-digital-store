import {getTranslations, setRequestLocale} from 'next-intl/server';

import {requireUser} from '@/features/auth/server/authorization';
import {TopupConsole} from '@/features/payments/components/topup-console';
import {getPaymentIdentity} from '@/features/payments/server/identity';
import {listAvailablePaymentMethods} from '@/features/payments/server/payment-service';
import {getSavedPaymentMethods, getUserPayments} from '@/features/payments/server/queries';
import type {PaymentMethodRow, PaymentRow} from '@/features/payments/types';
import type {AppLocale} from '@/i18n/routing';
import {createClient} from '@/lib/supabase/server';

export default async function WalletTopupPage({params}: {params: Promise<{locale: AppLocale}>}) {
  const {locale} = await params;
  setRequestLocale(locale);
  const context = await requireUser(locale);
  const identity = await getPaymentIdentity();
  if (!identity) return null;
  const supabase = await createClient();
  const [{data: profile}, methods, payments, savedMethods, t] = await Promise.all([
    supabase.from('profiles').select('currency_code').eq('id', context.user.id).single(),
    listAvailablePaymentMethods(identity),
    getUserPayments(context.user.id),
    getSavedPaymentMethods(context.user.id),
    getTranslations({locale, namespace: 'Payments'})
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
      <TopupConsole
        methods={methods as PaymentMethodRow[]}
        initialPayments={payments as PaymentRow[]}
        savedMethods={savedMethods}
        defaultCurrency={profile?.currency_code ?? 'USD'}
      />
    </div>
  );
}
