import {
  AlertTriangle,
  Coins,
  MousePointerClick,
  ShieldCheck,
  Sparkles,
  UsersRound
} from 'lucide-react';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/surfaces';
import type {GrowthAdminReport} from '../types';
type Copy = (key: string, values?: Record<string, string | number>) => string;
export function GrowthAdminReportView({data, t}: {data: GrowthAdminReport; t: Copy}) {
  const number = new Intl.NumberFormat();
  return (
    <div className="growth-dashboard">
      <section className="growth-metric-grid">
        <Metric
          icon={<UsersRound />}
          label={t('activeAffiliates')}
          value={number.format(data.activeAffiliates)}
          detail={t('applications', {value: data.applications})}
        />
        <Metric
          icon={<MousePointerClick />}
          label={t('clicks')}
          value={number.format(data.clicks)}
          detail={t('signups', {value: data.signups})}
        />
        <Metric
          icon={<Coins />}
          label={t('availableCommissions')}
          value={number.format(data.availableCommissions)}
          detail={t('pendingCommissions', {value: data.pendingCommissions})}
        />
        <Metric
          icon={<AlertTriangle />}
          label={t('fraudSignals')}
          value={number.format(data.openFraudSignals)}
          detail={t('pendingPayouts', {value: data.pendingPayouts})}
        />
        <Metric
          icon={<Sparkles />}
          label={t('loyaltyMembers')}
          value={number.format(data.loyaltyMembers)}
          detail={t('issuedPoints', {value: number.format(data.issuedPoints)})}
        />
        <Metric
          icon={<ShieldCheck />}
          label={t('redeemedPoints')}
          value={number.format(data.redeemedPoints)}
        />
      </section>
      <section className="growth-two-column">
        <Card>
          <CardHeader>
            <CardTitle>{t('topAffiliates')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="growth-list">
              {data.topAffiliates.map((row) => (
                <div key={row.code}>
                  <span>
                    <strong>{row.code}</strong>
                    <small>{t('affiliateConversions', {value: row.conversions})}</small>
                  </span>
                  <strong>{number.format(row.earnings)}</strong>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('tierDistribution')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="growth-list">
              {data.tierDistribution.map((row) => (
                <div key={row.name}>
                  <strong>{row.name}</strong>
                  <span>{number.format(row.value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
function Metric({
  icon,
  label,
  value,
  detail
}: {
  icon: React.ReactNode;
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
