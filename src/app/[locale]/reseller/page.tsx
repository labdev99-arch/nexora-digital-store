import {setRequestLocale} from 'next-intl/server';

import {StorefrontShell} from '@/components/layout/storefront-shell';
import {requirePermission} from '@/features/auth/server/authorization';
import {ResellerDashboard} from '@/features/reseller/components/reseller-dashboard';
import {resellerDashboard} from '@/features/reseller/server/reseller-service';

export const dynamic = 'force-dynamic';

export default async function ResellerPage({params}: {params: Promise<{locale: string}>}) {
  const {locale} = await params;
  setRequestLocale(locale);
  const identity = await requirePermission(locale, 'reseller.access');
  const data = await resellerDashboard(identity);
  return (
    <StorefrontShell>
      <ResellerDashboard data={data} />
    </StorefrontShell>
  );
}
