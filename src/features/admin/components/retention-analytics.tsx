'use client';

import {Activity, Repeat2, UserMinus, Users} from 'lucide-react';
import {useLocale, useTranslations} from 'next-intl';

import {StatCard} from '@/components/ui/advanced';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/surfaces';
import type {RetentionData} from '../server/analytics';

export function RetentionAnalytics({data, currency}: {data: RetentionData; currency: string}) {
  const t = useTranslations('Admin.analytics');
  const locale = useLocale();
  const money = new Intl.NumberFormat(locale, {style: 'currency', currency});
  return (
    <>
      <section className="admin-metric-grid">
        <StatCard
          label={t('averageLtv')}
          value={money.format(data.averageLtv / 100)}
          icon={<Activity />}
        />
        <StatCard
          label={t('activeCustomers')}
          value={String(data.activeCustomers)}
          icon={<Users />}
        />
        <StatCard
          label={t('churnedCustomers')}
          value={String(data.churnedCustomers)}
          icon={<UserMinus />}
        />
        <StatCard
          label={t('churnRate')}
          value={`${(data.churnRateBps / 100).toFixed(1)}%`}
          icon={<Repeat2 />}
        />
      </section>
      <Card>
        <CardHeader>
          <CardTitle>{t('cohortRetention')}</CardTitle>
        </CardHeader>
        <CardContent className="cohort-table-wrap">
          <table className="cohort-table">
            <thead>
              <tr>
                <th>{t('cohort')}</th>
                <th>{t('customers')}</th>
                {Array.from({length: 12}, (_, index) => (
                  <th key={index}>M{index}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.cohorts.map((cohort) => (
                <tr key={cohort.cohort}>
                  <th>{cohort.cohort}</th>
                  <td>{cohort.customers}</td>
                  {cohort.retention.map((value, index) => (
                    <td key={index}>
                      <span style={{opacity: Math.max(0.16, value / 10000)}}>
                        {(value / 100).toFixed(0)}%
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('ltvTable')}</CardTitle>
        </CardHeader>
        <CardContent className="admin-data-table-wrap">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>{t('customer')}</th>
                <th>{t('orders')}</th>
                <th>{t('lifetimeValue')}</th>
                <th>{t('lastOrder')}</th>
              </tr>
            </thead>
            <tbody>
              {data.ltv.map((row) => (
                <tr key={row.customerId}>
                  <td>{row.customerId}</td>
                  <td>{row.orders}</td>
                  <td>{money.format(row.value / 100)}</td>
                  <td>
                    {new Intl.DateTimeFormat(locale, {dateStyle: 'medium'}).format(
                      new Date(row.lastOrderAt)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}
