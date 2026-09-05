'use client';

import {Check, Code2, Download, KeyRound, PackagePlus, RadioTower, WalletCards} from 'lucide-react';
import Link from 'next/link';
import {useLocale, useTranslations} from 'next-intl';
import {useMemo, useState, type FormEvent} from 'react';

import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/form-controls';
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Progress
} from '@/components/ui/surfaces';
import type {resellerDashboard} from '../server/reseller-service';

type Dashboard = Awaited<ReturnType<typeof resellerDashboard>>;
type Wallet = {id: string; currency_code: string; cached_balance: number; locked: boolean};
type Order = {
  id: string;
  order_number?: string;
  sandbox_order_number?: string;
  status: string;
  currency_code: string;
  total_amount: number;
  created_at: string;
};
type ApiKey = {
  id: string;
  name: string;
  key_prefix: string;
  environment: string;
  scopes: string[];
  revoked_at: string | null;
};

export function ResellerDashboard({data}: {data: Dashboard}) {
  const t = useTranslations('Reseller');
  const locale = useLocale();
  const wallets = data.wallets as Wallet[];
  const orders = [...(data.orders as Order[]), ...(data.sandboxOrders as Order[])];
  const keys = data.apiKeys as ApiKey[];
  const nextTier = data.tiers.find(
    (tier) => tier.minimum_30d_volume > data.account.volume_30d_amount
  );
  const previousMinimum = data.tier.minimum_30d_volume;
  const progress = nextTier
    ? Math.round(
        ((data.account.volume_30d_amount - previousMinimum) /
          Math.max(1, nextTier.minimum_30d_volume - previousMinimum)) *
          100
      )
    : 100;
  const [secret, setSecret] = useState<{apiKey?: string; signingSecret: string} | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const money = useMemo(
    () => (amount: number, currency: string) =>
      new Intl.NumberFormat(locale, {style: 'currency', currency}).format(
        amount / (currency === 'LBP' ? 1 : 100)
      ),
    [locale]
  );

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/reseller/orders', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID()},
      body: JSON.stringify({
        currencyCode: String(form.get('currency')),
        localeCode: locale,
        countryCode: 'LB',
        items: [
          {
            variantId: String(form.get('variant')),
            quantity: Number(form.get('quantity')),
            optionValues: {}
          }
        ]
      })
    });
    setMessage(response.ok ? t('orderCreated') : t('requestFailed'));
    setBusy(false);
  }

  async function submitKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/reseller/api-keys', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        name: String(form.get('name')),
        environment: String(form.get('environment')),
        scopes: ['catalog:read', 'orders:write', 'orders:read', 'balance:read', 'webhooks:manage'],
        rateLimitPerMinute: 60,
        ipAllowlist: []
      })
    });
    const body = (await response.json()) as {apiKey?: string; signingSecret?: string};
    if (response.ok && body.signingSecret)
      setSecret({apiKey: body.apiKey, signingSecret: body.signingSecret});
    else setMessage(t('requestFailed'));
    setBusy(false);
  }

  async function submitWebhook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/reseller/webhooks', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        url: String(form.get('url')),
        events: ['order.updated', 'order.delivered', 'order.failed', 'balance.low']
      })
    });
    const body = (await response.json()) as {signingSecret?: string};
    if (response.ok && body.signingSecret) setSecret({signingSecret: body.signingSecret});
    else setMessage(t('requestFailed'));
    setBusy(false);
  }

  return (
    <main className="account-page reseller-dashboard">
      <header className="account-page-heading reseller-heading">
        <div>
          <span className="section-eyebrow">{t('eyebrow')}</span>
          <h1>{t('title')}</h1>
          <p>{t('description')}</p>
        </div>
        <div className="reseller-actions">
          <Button asChild variant="outline">
            <Link href="/api/reseller/price-list?format=csv" prefetch={false}>
              <Download />
              {t('csv')}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/api/reseller/price-list?format=json" prefetch={false}>
              <Download />
              {t('json')}
            </Link>
          </Button>
          <Button asChild variant="gradient">
            <Link href={`/${locale}/developers`}>
              <Code2 />
              {t('apiDocs')}
            </Link>
          </Button>
        </div>
      </header>
      {message ? (
        <Alert title={message} tone="info">
          {t('refreshHint')}
        </Alert>
      ) : null}
      {secret ? (
        <Alert title={t('secretTitle')} tone="warning">
          {t('secretOnce')}
          <br />
          {secret.apiKey ? <code>{secret.apiKey}</code> : null}
          <br />
          <code>{secret.signingSecret}</code>
        </Alert>
      ) : null}
      <section className="reseller-summary-grid">
        <Card>
          <CardHeader>
            <CardTitle>{t('tier')}</CardTitle>
            <Badge tone="accent">{data.tier.name[locale] ?? data.tier.code}</Badge>
          </CardHeader>
          <CardContent>
            <Progress
              value={progress}
              label={
                nextTier
                  ? t('nextTier', {tier: nextTier.name[locale] ?? nextTier.code})
                  : t('topTier')
              }
            />
            <p>{t('volume30d', {value: money(data.account.volume_30d_amount, 'USD')})}</p>
            <p>
              {t('creditLimit', {
                value: money(
                  data.account.credit_limit_override ?? data.tier.default_credit_limit,
                  data.account.credit_currency_code ?? data.tier.credit_currency_code
                )
              })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <WalletCards />
            <CardTitle>{t('balances')}</CardTitle>
          </CardHeader>
          <CardContent className="reseller-balance-list">
            {wallets.length ? (
              wallets.map((wallet) => (
                <div key={wallet.id}>
                  <strong>{money(wallet.cached_balance, wallet.currency_code)}</strong>
                  <Badge tone={wallet.locked ? 'danger' : 'success'}>
                    {wallet.locked ? t('frozen') : t('available')}
                  </Badge>
                </div>
              ))
            ) : (
              <p>{t('noBalances')}</p>
            )}
          </CardContent>
        </Card>
      </section>
      <section className="reseller-workspace-grid">
        <Card>
          <CardHeader>
            <PackagePlus />
            <CardTitle>{t('bulkOrder')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="reseller-form" onSubmit={(event) => void submitOrder(event)}>
              <label>
                {t('product')}
                <select name="variant" required>
                  {data.products.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.products.name[locale] ?? item.sku} ·{' '}
                      {money(item.wholesale_price_amount, item.currency_code)}
                    </option>
                  ))}
                </select>
              </label>
              <Input
                name="quantity"
                type="number"
                min={1}
                defaultValue={1}
                label={t('quantity')}
                required
              />
              <input
                type="hidden"
                name="currency"
                value={data.products[0]?.currency_code ?? 'USD'}
              />
              <Button type="submit" loading={busy} variant="gradient">
                {t('placeOrder')}
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <KeyRound />
            <CardTitle>{t('apiKeys')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="reseller-form" onSubmit={(event) => void submitKey(event)}>
              <Input name="name" label={t('keyName')} required />
              <label>
                {t('environment')}
                <select name="environment">
                  <option value="sandbox">{t('sandbox')}</option>
                  <option value="live">{t('live')}</option>
                </select>
              </label>
              <Button type="submit" loading={busy}>
                {t('createKey')}
              </Button>
            </form>
            <div className="reseller-list">
              {keys.map((key) => (
                <div key={key.id}>
                  <span>
                    <strong>{key.name}</strong>
                    <small>{key.key_prefix}</small>
                  </span>
                  <Badge
                    tone={
                      key.revoked_at ? 'danger' : key.environment === 'live' ? 'warning' : 'info'
                    }
                  >
                    {key.revoked_at ? t('revoked') : key.environment}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <RadioTower />
            <CardTitle>{t('webhooks')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="reseller-form" onSubmit={(event) => void submitWebhook(event)}>
              <Input name="url" type="url" pattern="https://.*" label={t('webhookUrl')} required />
              <Button type="submit" loading={busy}>
                {t('addWebhook')}
              </Button>
            </form>
            <p>{t('webhookEvents')}</p>
          </CardContent>
        </Card>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>{t('wholesaleCatalog')}</CardTitle>
          <Badge tone="success">
            <Check />
            {t('liveStock')}
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="ui-table-shell">
            <table className="ui-table">
              <thead>
                <tr>
                  <th>{t('product')}</th>
                  <th>{t('sku')}</th>
                  <th>{t('price')}</th>
                  <th>{t('stock')}</th>
                </tr>
              </thead>
              <tbody>
                {data.products.slice(0, 50).map((item) => (
                  <tr key={item.id}>
                    <td>{item.products.name[locale] ?? item.sku}</td>
                    <td>{item.sku}</td>
                    <td>{money(item.wholesale_price_amount, item.currency_code)}</td>
                    <td>
                      <Badge tone={item.available ? 'success' : 'danger'}>
                        {item.unlimited_stock ? t('unlimited') : String(item.stock_quantity)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('orderHistory')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="reseller-list">
            {orders.length ? (
              orders.slice(0, 20).map((order) => (
                <div key={order.id}>
                  <span>
                    <strong>{order.order_number ?? order.sandbox_order_number ?? order.id}</strong>
                    <small>
                      {new Intl.DateTimeFormat(locale, {dateStyle: 'medium'}).format(
                        new Date(order.created_at)
                      )}
                    </small>
                  </span>
                  <span>
                    <Badge
                      tone={
                        order.status === 'failed'
                          ? 'danger'
                          : order.status === 'completed'
                            ? 'success'
                            : 'info'
                      }
                    >
                      {order.status}
                    </Badge>
                    <strong>{money(order.total_amount, order.currency_code)}</strong>
                  </span>
                </div>
              ))
            ) : (
              <p>{t('noOrders')}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
