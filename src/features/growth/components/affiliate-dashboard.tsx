import Image from 'next/image';
import {
  BarChart3,
  CircleDollarSign,
  Link2,
  MousePointerClick,
  QrCode,
  UsersRound
} from 'lucide-react';
import type {ReactNode} from 'react';

import {Button} from '@/components/ui/button';
import {Badge, Card, CardContent, CardHeader, CardTitle} from '@/components/ui/surfaces';
import type {AppLocale} from '@/i18n/routing';
import type {AffiliateDashboardData} from '../types';
import {createAffiliateLinkAction, requestAffiliatePayoutAction} from '../server/actions';
import {ShareActions} from './share-actions';

type Copy = (key: string, values?: Record<string, string | number>) => string;

export function AffiliateDashboard({
  data,
  locale,
  qrDataUrl,
  referralUrl,
  t
}: {
  data: AffiliateDashboardData;
  locale: AppLocale;
  qrDataUrl: string;
  referralUrl: string;
  t: Copy;
}) {
  const money = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: data.totals.currency
  });
  const number = new Intl.NumberFormat(locale);
  return (
    <div className="growth-dashboard">
      <section className="growth-metric-grid">
        <Metric
          icon={<MousePointerClick />}
          label={t('metrics.clicks')}
          value={number.format(data.totals.clicks)}
        />
        <Metric
          icon={<UsersRound />}
          label={t('metrics.signups')}
          value={number.format(data.totals.signups)}
        />
        <Metric
          icon={<BarChart3 />}
          label={t('metrics.conversions')}
          value={number.format(data.totals.conversions)}
          detail={t('metrics.conversionRate', {value: data.totals.conversionRate})}
        />
        <Metric
          icon={<CircleDollarSign />}
          label={t('metrics.available')}
          value={money.format(data.totals.available / 100)}
          detail={t('metrics.pendingValue', {value: money.format(data.totals.pending / 100)})}
        />
      </section>

      <section className="growth-two-column">
        <Card className="growth-referral-card">
          <CardHeader>
            <span className="growth-card-icon">
              <QrCode aria-hidden="true" />
            </span>
            <CardTitle>{t('referral.title')}</CardTitle>
            <p>{t('referral.description')}</p>
          </CardHeader>
          <CardContent className="growth-referral-content">
            <div className="growth-qr">
              <Image
                src={qrDataUrl}
                alt={t('referral.qrAlt')}
                width={176}
                height={176}
                unoptimized
              />
            </div>
            <div className="growth-referral-details">
              <code dir="ltr">{data.account?.referral_code}</code>
              <span dir="ltr" className="growth-url">
                {referralUrl}
              </span>
              <ShareActions
                url={referralUrl}
                message={t('referral.shareMessage')}
                labels={{
                  whatsapp: t('share.whatsapp'),
                  telegram: t('share.telegram'),
                  x: t('share.x'),
                  copy: t('share.copy'),
                  copied: t('share.copied')
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <span className="growth-card-icon">
              <CircleDollarSign aria-hidden="true" />
            </span>
            <CardTitle>{t('payout.title')}</CardTitle>
            <p>{t('payout.description')}</p>
          </CardHeader>
          <CardContent>
            <form action={requestAffiliatePayoutAction.bind(null, locale)} className="growth-form">
              <label>
                <span>{t('payout.amount')}</span>
                <input name="amount" type="number" min="1" max={data.totals.available} required />
              </label>
              <label>
                <span>{t('payout.currency')}</span>
                <input name="currency" value={data.totals.currency} readOnly />
              </label>
              <label>
                <span>{t('payout.destination')}</span>
                <select name="destinationKind">
                  <option value="wallet">{t('payout.wallet')}</option>
                  <option value="external">{t('payout.external')}</option>
                </select>
              </label>
              <label>
                <span>{t('payout.details')}</span>
                <input name="destinationDetails" />
              </label>
              <Button type="submit" variant="gradient" disabled={data.totals.available <= 0}>
                {t('payout.submit')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <span className="growth-card-icon">
            <Link2 aria-hidden="true" />
          </span>
          <CardTitle>{t('links.title')}</CardTitle>
          <p>{t('links.description')}</p>
        </CardHeader>
        <CardContent>
          <form action={createAffiliateLinkAction.bind(null, locale)} className="growth-link-form">
            <label>
              <span>{t('links.name')}</span>
              <input name="name" required />
            </label>
            <label>
              <span>{t('links.destination')}</span>
              <input name="destinationPath" defaultValue="/" dir="ltr" required />
            </label>
            <label>
              <span>{t('links.campaign')}</span>
              <input name="campaign" />
            </label>
            <Button type="submit">{t('links.create')}</Button>
          </form>
          <div className="growth-table-wrap">
            <table className="growth-table">
              <thead>
                <tr>
                  <th>{t('links.link')}</th>
                  <th>{t('metrics.clicks')}</th>
                  <th>{t('metrics.signups')}</th>
                  <th>{t('metrics.conversions')}</th>
                  <th>{t('links.revenue')}</th>
                </tr>
              </thead>
              <tbody>
                {data.links.map((link) => (
                  <tr key={link.id}>
                    <td>
                      <strong>{link.name}</strong>
                      <small dir="ltr">/r/{link.slug}</small>
                    </td>
                    <td>{number.format(link.clicks)}</td>
                    <td>{number.format(link.signups)}</td>
                    <td>{number.format(link.conversions)}</td>
                    <td>{money.format(link.revenue / 100)}</td>
                  </tr>
                ))}
                {!data.links.length ? (
                  <tr>
                    <td colSpan={5}>{t('links.empty')}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <section className="growth-two-column">
        <Card>
          <CardHeader>
            <CardTitle>{t('commissions.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="growth-list">
              {data.commissions.slice(0, 8).map((item) => (
                <div key={item.id}>
                  <span>
                    <strong>{money.format(item.amount / 100)}</strong>
                    <small>{t('commissions.level', {level: item.level})}</small>
                  </span>
                  <Badge
                    tone={
                      item.status === 'available'
                        ? 'success'
                        : item.status === 'held_review'
                          ? 'warning'
                          : 'neutral'
                    }
                  >
                    {t(`status.${item.status}`)}
                  </Badge>
                </div>
              ))}
              {!data.commissions.length ? <p>{t('commissions.empty')}</p> : null}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('payout.history')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="growth-list">
              {data.payouts.slice(0, 8).map((item) => (
                <div key={item.id}>
                  <span>
                    <strong>{money.format(item.amount / 100)}</strong>
                    <small>
                      {new Intl.DateTimeFormat(locale, {dateStyle: 'medium'}).format(
                        new Date(item.createdAt)
                      )}
                    </small>
                  </span>
                  <Badge>{t(`status.${item.status}`)}</Badge>
                </div>
              ))}
              {!data.payouts.length ? <p>{t('payout.empty')}</p> : null}
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t('assets.title')}</CardTitle>
          <p>{t('assets.description')}</p>
        </CardHeader>
        <CardContent>
          <div className="growth-assets">
            {data.assets.map((asset) => (
              <article key={asset.id}>
                <Badge>{asset.kind}</Badge>
                <strong>{asset.name[locale] ?? asset.name.en ?? asset.kind}</strong>
                <p>{asset.description[locale] ?? asset.description.en}</p>
                {asset.externalUrl ? (
                  <Button asChild size="sm" variant="outline">
                    <a href={asset.externalUrl} target="_blank" rel="noreferrer">
                      {t('assets.open')}
                    </a>
                  </Button>
                ) : null}
              </article>
            ))}
            {!data.assets.length ? <p>{t('assets.empty')}</p> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  detail
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <Card className="growth-metric">
      <span className="growth-card-icon">{icon}</span>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </Card>
  );
}
