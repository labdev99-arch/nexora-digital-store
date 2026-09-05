import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {WalletOverview} from '@/features/wallet/components/wallet-overview';
import {walletStatementFiltersSchema} from '@/features/wallet/schemas/wallet';
import {getWalletOverview} from '@/features/wallet/server/queries';
import {requireUser} from '@/features/auth/server/authorization';
import type {AppLocale} from '@/i18n/routing';
import {Link} from '@/i18n/navigation';
import {Button} from '@/components/ui/button';

type Props = {
  params: Promise<{locale: AppLocale}>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({params}: Pick<Props, 'params'>): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: 'Wallet'});
  return {title: t('metaTitle'), description: t('description')};
}

export default async function WalletPage({params, searchParams}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const context = await requireUser(locale);
  const raw = await searchParams;
  const single = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])
  );
  const filters = walletStatementFiltersSchema.parse(single);
  const pageSize = 20;
  const [data, t] = await Promise.all([
    getWalletOverview(context.user.id, {...filters, pageSize}),
    getTranslations({locale, namespace: 'Wallet'})
  ]);
  const typeKeys = [
    'topup',
    'top_up',
    'purchase',
    'refund',
    'commission',
    'affiliate_commission',
    'cashback',
    'bonus',
    'admin_adjustment',
    'hold',
    'release',
    'payout',
    'fee',
    'chargeback'
  ] as const;
  return (
    <>
      <div className="wallet-topup-launch">
        <Button asChild variant="gradient">
          <Link href="/account/wallet/top-up">{t('topupAction')}</Link>
        </Button>
      </div>
      <WalletOverview
        locale={locale}
        profileId={context.user.id}
        data={data}
        page={filters.page}
        pageSize={pageSize}
        values={{
          currency: filters.currency,
          type: filters.type,
          from: filters.from,
          to: filters.to
        }}
        labels={{
          title: t('title'),
          description: t('description'),
          protected: t('protected'),
          available: t('available'),
          held: t('held'),
          frozen: t('frozen'),
          statement: t('statement.title'),
          statementDescription: t('statement.description'),
          allCurrencies: t('filters.allCurrencies'),
          allTypes: t('filters.allTypes'),
          from: t('filters.from'),
          to: t('filters.to'),
          filter: t('filters.apply'),
          clear: t('filters.clear'),
          csv: t('export.csv'),
          pdf: t('export.pdf'),
          emptyTitle: t('empty.title'),
          emptyDescription: t('empty.description'),
          details: t('details'),
          page: t.raw('pagination.page') as string,
          previous: t('pagination.previous'),
          next: t('pagination.next'),
          types: Object.fromEntries(typeKeys.map((key) => [key, t(`types.${key}`)]))
        }}
      />
    </>
  );
}
