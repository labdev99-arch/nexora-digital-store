'use client';

import {
  Activity,
  CircleDollarSign,
  PackageCheck,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  Users,
  WalletCards
} from 'lucide-react';
import {useLocale, useTranslations} from 'next-intl';
import {useEffect, useMemo, useState} from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

import {StatCard} from '@/components/ui/advanced';
import {Badge, Card, CardContent, CardHeader, CardTitle} from '@/components/ui/surfaces';
import {createClient} from '@/lib/supabase/client';
import type {AdminActivity, AdminDashboardData} from '../server/analytics';

export function AdminDashboard({
  data,
  currencies,
  range
}: {
  data: AdminDashboardData;
  currencies: string[];
  range: number;
}) {
  const t = useTranslations('Admin.dashboard');
  const locale = useLocale();
  const [activity, setActivity] = useState(data.activity);
  const money = useMemo(
    () => new Intl.NumberFormat(locale, {style: 'currency', currency: data.currency}),
    [data.currency, locale]
  );
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('admin-live-activity')
      .on(
        'postgres_changes',
        {event: 'INSERT', schema: 'public', table: 'audit_logs'},
        (payload) => {
          const row = payload.new as {
            id: string;
            action: string;
            resource_type: string;
            created_at: string;
          };
          const item: AdminActivity = {
            id: row.id,
            kind: 'audit',
            title: row.action,
            detail: row.resource_type,
            createdAt: row.created_at
          };
          setActivity((current) =>
            [item, ...current.filter((event) => event.id !== item.id)].slice(0, 20)
          );
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);
  const chartColors = [
    'var(--accent)',
    'var(--info)',
    'var(--success)',
    'var(--warning)',
    'var(--danger)'
  ];
  return (
    <main className="account-page admin-dashboard-page">
      <header className="account-page-heading admin-dashboard-heading">
        <div>
          <span className="section-eyebrow">{t('eyebrow')}</span>
          <h1>{t('title')}</h1>
          <p>{t('description')}</p>
        </div>
        <form className="admin-dashboard-filters">
          <label>
            <span>{t('dateRange')}</span>
            <select name="range" defaultValue={String(range)}>
              {[7, 30, 90, 365].map((days) => (
                <option key={days} value={days}>
                  {t('days', {days})}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t('currency')}</span>
            <select name="currency" defaultValue={data.currency}>
              {currencies.map((currency) => (
                <option key={currency}>{currency}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="admin-filter-submit">
            <RefreshCw />
            {t('apply')}
          </button>
        </form>
      </header>

      <section className="admin-metric-grid">
        <StatCard
          label={t('revenue')}
          value={money.format(data.revenue / 100)}
          icon={<CircleDollarSign />}
          change={t('selectedPeriod')}
        />
        <StatCard
          label={t('grossProfit')}
          value={money.format(data.grossProfit / 100)}
          icon={<TrendingUp />}
          change={t('margin', {value: data.marginBps / 100})}
        />
        <StatCard
          label={t('aov')}
          value={money.format(data.averageOrderValue / 100)}
          icon={<ShoppingBag />}
          change={t('paidOrders')}
        />
        <StatCard
          label={t('walletFloat')}
          value={money.format(data.walletFloat / 100)}
          icon={<WalletCards />}
          change={t('customerBalances')}
        />
        <StatCard
          label={t('manualQueue')}
          value={number.format(data.pendingManual)}
          icon={<PackageCheck />}
          change={t('requiresAction')}
        />
        <StatCard
          label={t('refundRate')}
          value={`${(data.refundRateBps / 100).toFixed(2)}%`}
          icon={<Activity />}
          change={t('selectedPeriod')}
        />
      </section>

      <section className="admin-chart-grid">
        <Card className="admin-chart-wide">
          <CardHeader>
            <CardTitle>{t('revenueProfit')}</CardTitle>
          </CardHeader>
          <CardContent className="admin-chart-body">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.dailyRevenue}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" stroke="var(--text-muted)" />
                <YAxis
                  stroke="var(--text-muted)"
                  tickFormatter={(value: number) => money.format(value / 100)}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface-raised)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)'
                  }}
                  formatter={(value) => money.format(Number(value) / 100)}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--accent)"
                  strokeWidth={3}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="profit"
                  stroke="var(--success)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('ordersByStatus')}</CardTitle>
          </CardHeader>
          <CardContent className="admin-chart-body">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={data.orderStatuses}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={64}
                  outerRadius={104}
                >
                  {data.orderStatuses.map((entry, index) => (
                    <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface-raised)',
                    border: '1px solid var(--border)'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('conversionFunnel')}</CardTitle>
          </CardHeader>
          <CardContent className="admin-chart-body">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.funnel} layout="vertical">
                <CartesianGrid stroke="var(--border)" horizontal={false} />
                <XAxis type="number" stroke="var(--text-muted)" />
                <YAxis type="category" dataKey="name" stroke="var(--text-muted)" width={80} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface-raised)',
                    border: '1px solid var(--border)'
                  }}
                />
                <Bar dataKey="value" fill="var(--accent)" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('customers')}</CardTitle>
          </CardHeader>
          <CardContent className="admin-customer-split">
            <div>
              <Users />
              <strong>{number.format(data.newCustomers)}</strong>
              <span>{t('newCustomers')}</span>
            </div>
            <div>
              <Users />
              <strong>{number.format(data.returningCustomers)}</strong>
              <span>{t('returningCustomers')}</span>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="admin-ranking-grid">
        <Ranking
          title={t('topProducts')}
          rows={data.topProducts}
          format={(value) => money.format(value / 100)}
        />
        <Ranking
          title={t('topCategories')}
          rows={data.topCategories}
          format={(value) => money.format(value / 100)}
        />
        <Ranking
          title={t('paymentBreakdown')}
          rows={data.paymentMethods}
          format={(value) => money.format(value / 100)}
        />
        <Card>
          <CardHeader>
            <CardTitle>{t('supplierReliability')}</CardTitle>
          </CardHeader>
          <CardContent className="admin-ranking-list">
            {data.supplierReliability.map((supplier) => (
              <div key={supplier.name}>
                <span>{supplier.name}</span>
                <Badge
                  tone={
                    supplier.reliability >= 9500
                      ? 'success'
                      : supplier.reliability >= 8000
                        ? 'warning'
                        : 'danger'
                  }
                >
                  {(supplier.reliability / 100).toFixed(1)}%
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t('liveActivity')}</CardTitle>
          <span className="admin-live-indicator">
            <i />
            {t('live')}
          </span>
        </CardHeader>
        <CardContent>
          <ol className="admin-activity-feed">
            {activity.map((item) => (
              <li key={item.id}>
                <span data-kind={item.kind}>
                  <Activity />
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </div>
                <time>
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                  }).format(new Date(item.createdAt))}
                </time>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </main>
  );
}

function Ranking({
  title,
  rows,
  format
}: {
  title: string;
  rows: Array<{name: string; value: number}>;
  format: (value: number) => string;
}) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="admin-ranking-list">
        {rows.map((row) => (
          <div key={row.name}>
            <span>{row.name}</span>
            <i>
              <b style={{inlineSize: `${Math.round((row.value / max) * 100)}%`}} />
            </i>
            <strong>{format(row.value)}</strong>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
