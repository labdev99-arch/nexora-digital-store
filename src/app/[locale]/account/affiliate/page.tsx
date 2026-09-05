import QRCode from 'qrcode';
import {BadgeCheck, Clock3} from 'lucide-react';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {Button} from '@/components/ui/button';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/surfaces';
import {requireUser} from '@/features/auth/server/authorization';
import {AffiliateDashboard} from '@/features/growth/components/affiliate-dashboard';
import {applyForAffiliateAction} from '@/features/growth/server/actions';
import {getAffiliateDashboard} from '@/features/growth/server/queries';
import type {AppLocale} from '@/i18n/routing';

export default async function AffiliatePage({params}: {params: Promise<{locale: AppLocale}>}) {
  const {locale} = await params;
  setRequestLocale(locale);
  const identity = await requireUser(locale);
  const t = await getTranslations('Growth.affiliate');
  const data = await getAffiliateDashboard(identity.user.id);
  if (!data.account) {
    return (
      <main className="account-page growth-page">
        <header className="account-page-heading">
          <div>
            <p>{t('eyebrow')}</p>
            <h1>{t('apply.title')}</h1>
            <span>{t('apply.description')}</span>
          </div>
        </header>
        <Card className="growth-application">
          <CardHeader>
            <span className="growth-card-icon">
              <BadgeCheck />
            </span>
            <CardTitle>{t('apply.cardTitle')}</CardTitle>
            <p>{t('apply.cardDescription')}</p>
          </CardHeader>
          <CardContent>
            <form action={applyForAffiliateAction.bind(null, locale)} className="growth-form">
              <label>
                <span>{t('apply.message')}</span>
                <textarea name="message" rows={5} maxLength={1000} />
              </label>
              <Button type="submit" variant="gradient">
                {t('apply.submit')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }
  if (data.account.status !== 'active') {
    return (
      <main className="account-page growth-page">
        <header className="account-page-heading">
          <div>
            <p>{t('eyebrow')}</p>
            <h1>{t('review.title')}</h1>
            <span>{t('review.description')}</span>
          </div>
        </header>
        <Card className="growth-review">
          <Clock3 />
          <div>
            <strong>{t('review.status')}</strong>
            <p>{t('review.next')}</p>
          </div>
        </Card>
      </main>
    );
  }
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const referralUrl = `${base}/${locale}/r/${data.account.referral_code}`;
  const qrDataUrl = await QRCode.toDataURL(referralUrl, {margin: 1, width: 352});
  return (
    <main className="account-page growth-page">
      <header className="account-page-heading">
        <div>
          <p>{t('eyebrow')}</p>
          <h1>{t('dashboard.title')}</h1>
          <span>{t('dashboard.description')}</span>
        </div>
        <span className="account-role-chip">{t('dashboard.levels')}</span>
      </header>
      <AffiliateDashboard
        data={data}
        locale={locale}
        qrDataUrl={qrDataUrl}
        referralUrl={referralUrl}
        t={(key, values) => t(key, values)}
      />
    </main>
  );
}
