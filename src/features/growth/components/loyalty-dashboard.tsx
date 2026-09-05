import {Award, Flame, Gift, ShieldCheck, Sparkles} from 'lucide-react';
import type {ReactNode} from 'react';

import {Button} from '@/components/ui/button';
import {Badge, Card, CardContent, CardHeader, CardTitle, Progress} from '@/components/ui/surfaces';
import type {AppLocale} from '@/i18n/routing';
import type {LoyaltyDashboardData} from '../types';
import {redeemLoyaltyAction} from '../server/actions';

type Copy = (key: string, values?: Record<string, string | number>) => string;
export function LoyaltyDashboard({
  data,
  locale,
  t
}: {
  data: LoyaltyDashboardData;
  locale: AppLocale;
  t: Copy;
}) {
  const number = new Intl.NumberFormat(locale);
  const tier = data.currentTier;
  const next = data.nextTier;
  const local = (value: Record<string, string>) =>
    value[locale] ?? value.en ?? Object.values(value)[0] ?? '';
  return (
    <div className="growth-dashboard">
      <section className="growth-tier-hero">
        <div className="growth-tier-orb">
          <Sparkles />
        </div>
        <div>
          <span>{t('tier.current')}</span>
          <h2>{tier ? local(tier.name) : t('tier.starter')}</h2>
          <p>{tier ? local(tier.description) : t('tier.defaultDescription')}</p>
        </div>
        <div className="growth-points">
          <strong>{number.format(data.account.points)}</strong>
          <span>{t('points')}</span>
        </div>
        <div className="growth-tier-progress">
          <div>
            <span>{next ? t('tier.progressTo', {tier: local(next.name)}) : t('tier.highest')}</span>
            <strong>{Math.round(data.progressBps / 100)}%</strong>
          </div>
          <Progress value={data.progressBps / 100} />
          {next ? (
            <small>
              {t('tier.remaining', {
                value: number.format(Math.max(0, next.minimumSpend - data.lifetimeSpend))
              })}
            </small>
          ) : null}
        </div>
      </section>
      <section className="growth-metric-grid">
        <Metric
          icon={<Award />}
          label={t('metrics.lifetime')}
          value={number.format(data.account.lifetimeEarned)}
        />
        <Metric
          icon={<Flame />}
          label={t('metrics.streak')}
          value={t('metrics.days', {days: data.account.streakDays})}
        />
        <Metric
          icon={<ShieldCheck />}
          label={t('metrics.discount')}
          value={t('metrics.percent', {value: (tier?.discountBps ?? 0) / 100})}
        />
        <Metric
          icon={<Sparkles />}
          label={t('metrics.multiplier')}
          value={t('metrics.multiplierValue', {
            value: (tier?.pointsMultiplierBps ?? 10000) / 10000
          })}
        />
      </section>
      <section className="growth-two-column">
        <Card>
          <CardHeader>
            <CardTitle>{t('redeem.title')}</CardTitle>
            <p>{t('redeem.description')}</p>
          </CardHeader>
          <CardContent className="growth-redemptions">
            <form action={redeemLoyaltyAction.bind(null, locale)}>
              <input type="hidden" name="kind" value="wallet_credit" />
              <Button type="submit" variant="gradient">
                <Gift />
                {t('redeem.wallet')}
              </Button>
              <small>{t('redeem.walletRate')}</small>
            </form>
            <form action={redeemLoyaltyAction.bind(null, locale)}>
              <input type="hidden" name="kind" value="discount" />
              <Button type="submit" variant="outline">
                <Sparkles />
                {t('redeem.discount')}
              </Button>
              <small>{t('redeem.discountRate')}</small>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('perks.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="growth-perks">
              <li>{t('perks.discount', {value: (tier?.discountBps ?? 0) / 100})}</li>
              <li>{tier?.priorityQueue ? t('perks.priority') : t('perks.standard')}</li>
              <li>{tier?.exclusiveProducts ? t('perks.exclusive') : t('perks.catalog')}</li>
              <li>{tier?.dedicatedSupport ? t('perks.dedicated') : t('perks.support')}</li>
            </ul>
          </CardContent>
        </Card>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>{t('badges.title')}</CardTitle>
          <p>{t('badges.description')}</p>
        </CardHeader>
        <CardContent>
          <div className="growth-badges">
            {data.badges.map((badge) => (
              <article key={badge.id} className={badge.earned ? 'earned' : undefined}>
                <span>
                  <Award />
                </span>
                <strong>{local(badge.name)}</strong>
                <p>{local(badge.description)}</p>
                <Badge tone={badge.earned ? 'success' : 'neutral'}>
                  {badge.earned ? t('badges.earned') : t('badges.locked')}
                </Badge>
              </article>
            ))}
            {!data.badges.length ? <p>{t('badges.empty')}</p> : null}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('history.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="growth-list">
            {data.entries.map((entry) => (
              <div key={entry.id}>
                <span>
                  <strong>{t(`entries.${entry.kind}`)}</strong>
                  <small>
                    {new Intl.DateTimeFormat(locale, {dateStyle: 'medium'}).format(
                      new Date(entry.createdAt)
                    )}
                  </small>
                </span>
                <strong className={entry.points > 0 ? 'growth-positive' : 'growth-negative'}>
                  {entry.points > 0 ? '+' : ''}
                  {number.format(entry.points)}
                </strong>
              </div>
            ))}
            {!data.entries.length ? <p>{t('history.empty')}</p> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
function Metric({icon, label, value}: {icon: ReactNode; label: string; value: string}) {
  return (
    <Card className="growth-metric">
      <span className="growth-card-icon">{icon}</span>
      <span>{label}</span>
      <strong>{value}</strong>
    </Card>
  );
}
