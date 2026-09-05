import {getTranslations, setRequestLocale} from 'next-intl/server';

import {requirePermission} from '@/features/auth/server/authorization';
import {PrivacyControls} from '@/features/privacy/components/privacy-controls';

export default async function PrivacyPage({params}: {params: Promise<{locale: string}>}) {
  const {locale} = await params;
  setRequestLocale(locale);
  await requirePermission(locale, 'account.update');
  const t = await getTranslations({locale, namespace: 'Privacy.account'});
  return (
    <main className="account-page">
      <header className="account-heading">
        <p>{t('eyebrow')}</p>
        <h1>{t('title')}</h1>
        <span>{t('description')}</span>
      </header>
      <PrivacyControls />
    </main>
  );
}
