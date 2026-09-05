'use client';

import {
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  FileSpreadsheet,
  Filter,
  LockKeyhole,
  ShieldCheck,
  WalletCards
} from 'lucide-react';
import {useEffect, useState} from 'react';

import {Button} from '@/components/ui/button';
import {Badge, Card, EmptyState} from '@/components/ui/surfaces';
import {formatDate} from '@/i18n/formatters';
import {Link} from '@/i18n/navigation';
import type {AppLocale} from '@/i18n/routing';
import {formatMinorUnits} from '@/lib/money';
import {createClient} from '@/lib/supabase/client';
import type {WalletOverview as WalletOverviewData} from '../types';

type Labels = {
  title: string;
  description: string;
  protected: string;
  available: string;
  held: string;
  frozen: string;
  statement: string;
  statementDescription: string;
  allCurrencies: string;
  allTypes: string;
  from: string;
  to: string;
  filter: string;
  clear: string;
  csv: string;
  pdf: string;
  emptyTitle: string;
  emptyDescription: string;
  details: string;
  page: string;
  previous: string;
  next: string;
  types: Record<string, string>;
};

export function WalletOverview({
  locale,
  profileId,
  data,
  labels,
  values,
  page,
  pageSize
}: {
  locale: AppLocale;
  profileId: string;
  data: WalletOverviewData;
  labels: Labels;
  values: Record<string, string | undefined>;
  page: number;
  pageSize: number;
}) {
  const [balances, setBalances] = useState(data.balances);
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`wallet:${profileId}`)
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'wallets', filter: `owner_id=eq.${profileId}`},
        (payload) => {
          const row = payload.new as {
            id?: string;
            account_type?: string;
            cached_balance?: number;
            locked?: boolean;
          };
          if (!row.id) return;
          setBalances((current) =>
            current.map((balance) => {
              if (row.id === balance.availableWalletId)
                return {
                  ...balance,
                  available: Number(row.cached_balance ?? balance.available),
                  frozen: Boolean(row.locked)
                };
              if (row.id === balance.holdWalletId)
                return {...balance, held: Number(row.cached_balance ?? balance.held)};
              return balance;
            })
          );
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profileId]);
  const pages = Math.max(Math.ceil(data.totalTransactions / pageSize), 1);
  const params = new URLSearchParams(
    Object.entries(values).filter((entry): entry is [string, string] => Boolean(entry[1]))
  );
  const pageHref = (nextPage: number) => {
    const next = new URLSearchParams(params);
    next.set('page', String(nextPage));
    return `/account/wallet?${next.toString()}`;
  };
  return (
    <div className="wallet-page account-page">
      <header className="account-page-heading wallet-page-heading">
        <div>
          <span className="section-eyebrow">{labels.protected}</span>
          <h1>{labels.title}</h1>
          <p>{labels.description}</p>
        </div>
        <span className="wallet-integrity-chip">
          <ShieldCheck aria-hidden="true" />
          {labels.protected}
        </span>
      </header>

      <section className="wallet-balance-grid">
        {balances.map((balance) => (
          <Card className="wallet-balance-card" key={balance.currencyCode}>
            <div className="wallet-balance-card-head">
              <span>
                <WalletCards aria-hidden="true" />
                {balance.currencyCode}
              </span>
              {balance.frozen ? (
                <Badge tone="danger">
                  <LockKeyhole aria-hidden="true" />
                  {labels.frozen}
                </Badge>
              ) : null}
            </div>
            <small>{labels.available}</small>
            <strong>{formatMinorUnits(balance.available, balance.currencyCode, locale)}</strong>
            <div className="wallet-held-row">
              <span>{labels.held}</span>
              <b>{formatMinorUnits(balance.held, balance.currencyCode, locale)}</b>
            </div>
          </Card>
        ))}
      </section>

      <section className="wallet-statement-section">
        <div className="wallet-section-heading">
          <div>
            <h2>{labels.statement}</h2>
            <p>{labels.statementDescription}</p>
          </div>
          <div className="wallet-export-actions">
            <Button asChild variant="outline" size="sm">
              <a href={`/${locale}/account/wallet/statement.csv?${params.toString()}`}>
                <FileSpreadsheet aria-hidden="true" />
                {labels.csv}
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={`/${locale}/account/wallet/statement.pdf?${params.toString()}`}>
                <Download aria-hidden="true" />
                {labels.pdf}
              </a>
            </Button>
          </div>
        </div>
        <form className="wallet-filters" method="get">
          <label>
            <span className="sr-only">{labels.allCurrencies}</span>
            <select name="currency" defaultValue={values.currency ?? ''}>
              <option value="">{labels.allCurrencies}</option>
              {balances.map((balance) => (
                <option key={balance.currencyCode} value={balance.currencyCode}>
                  {balance.currencyCode}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">{labels.allTypes}</span>
            <select name="type" defaultValue={values.type ?? ''}>
              <option value="">{labels.allTypes}</option>
              {Object.entries(labels.types).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{labels.from}</span>
            <input type="date" name="from" defaultValue={values.from} />
          </label>
          <label>
            <span>{labels.to}</span>
            <input type="date" name="to" defaultValue={values.to} />
          </label>
          <Button type="submit" variant="gradient" size="sm">
            <Filter aria-hidden="true" />
            {labels.filter}
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/account/wallet" locale={locale}>
              {labels.clear}
            </Link>
          </Button>
        </form>

        {data.transactions.length ? (
          <div className="wallet-transaction-list">
            {data.transactions.map((transaction) => (
              <Link
                key={transaction.id}
                href={`/account/wallet/transactions/${transaction.id}`}
                locale={locale}
                className="wallet-transaction-row"
              >
                <span className="wallet-transaction-icon" data-direction={transaction.direction}>
                  {transaction.direction === 'credit' ? (
                    <ArrowDownLeft aria-hidden="true" />
                  ) : (
                    <ArrowUpRight aria-hidden="true" />
                  )}
                </span>
                <span className="wallet-transaction-copy">
                  <strong>{labels.types[transaction.type] ?? transaction.type}</strong>
                  <small>{formatDate(transaction.created_at, locale)}</small>
                </span>
                <span className="wallet-transaction-reference">
                  <small>{transaction.reference_type}</small>
                  <b>{transaction.id.slice(0, 8)}</b>
                </span>
                <strong
                  className="wallet-transaction-amount"
                  data-direction={transaction.direction}
                >
                  {transaction.signedAmount > 0 ? '+' : ''}
                  {formatMinorUnits(transaction.signedAmount, transaction.currency_code, locale)}
                </strong>
                <span className="sr-only">{labels.details}</span>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState title={labels.emptyTitle} description={labels.emptyDescription} />
        )}

        {data.transactions.length ? (
          <nav className="catalog-pagination" aria-label={labels.page}>
            <Button asChild variant="outline" disabled={page <= 1}>
              <Link href={pageHref(Math.max(1, page - 1))} locale={locale}>
                {labels.previous}
              </Link>
            </Button>
            <span>
              {labels.page.replace('{page}', String(page)).replace('{pages}', String(pages))}
            </span>
            <Button asChild variant="outline" disabled={page >= pages}>
              <Link href={pageHref(Math.min(pages, page + 1))} locale={locale}>
                {labels.next}
              </Link>
            </Button>
          </nav>
        ) : null}
      </section>
    </div>
  );
}
