import {
  ArrowUpRight,
  BadgeDollarSign,
  FileText,
  Flag,
  Languages,
  Percent,
  Settings,
  WalletCards
} from 'lucide-react';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {requirePermission} from '@/features/auth/server/authorization';
import {Link} from '@/i18n/navigation';
import type {AppLocale} from '@/i18n/routing';

const settings = [
  {key: 'currencies', href: '/admin/resources/currencies', icon: BadgeDollarSign},
  {key: 'exchangeRates', href: '/admin/resources/exchangeRates', icon: WalletCards},
  {key: 'locales', href: '/admin/resources/locales', icon: Languages},
  {key: 'taxRules', href: '/admin/resources/taxRules', icon: Percent},
  {key: 'paymentMethods', href: '/admin/resources/paymentMethods', icon: WalletCards},
  {key: 'featureFlags', href: '/admin/resources/featureFlags', icon: Flag},
  {key: 'platformSettings', href: '/admin/resources/platformSettings', icon: Settings},
  {key: 'legalPages', href: '/admin/resources/pages', icon: FileText}
] as const;

export default async function SettingsPage({params}: {params: Promise<{locale: AppLocale}>}) {
  const {locale} = await params;
  setRequestLocale(locale);
  await requirePermission(locale, 'settings.manage');
  const t = await getTranslations({locale, namespace: 'Admin.settings'});
  return (
    <main className="account-page admin-settings-page">
      <header className="account-page-heading">
        <div>
          <span className="section-eyebrow">{t('eyebrow')}</span>
          <h1>{t('title')}</h1>
          <p>{t('description')}</p>
        </div>
      </header>
      <section className="admin-resource-grid">
        {settings.map(({key, href, icon: Icon}) => (
          <Link key={key} href={href}>
            <span>
              <Icon />
            </span>
            <div>
              <strong>{t(`${key}.title`)}</strong>
              <small>{t(`${key}.description`)}</small>
            </div>
            <ArrowUpRight />
          </Link>
        ))}
      </section>
    </main>
  );
}
