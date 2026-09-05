import {getTranslations, setRequestLocale} from 'next-intl/server';
import {StorefrontShell} from '@/components/layout/storefront-shell';
import {getAuthContext} from '@/features/auth/server/authorization';
import {CheckoutConsole} from '@/features/commerce/components/checkout-console';
import {asLocalizedText} from '@/features/catalog/types';
import {createAdminClient} from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export default async function CheckoutPage({params}: {params: Promise<{locale: string}>}) {
  const {locale} = await params;
  setRequestLocale(locale);
  const [t, auth] = await Promise.all([
    getTranslations({locale, namespace: 'Commerce.checkout'}),
    getAuthContext()
  ]);
  const admin = createAdminClient();
  const {data: rows} = await admin
    .from('payment_methods')
    .select('*')
    .eq('enabled', true)
    .is('deleted_at', null)
    .order('sort_order');
  const {data: profile} = auth
    ? await admin.from('profiles').select('country_code').eq('id', auth.user.id).maybeSingle()
    : {data: null};
  const methods = (rows ?? [])
    .filter((row) => auth || row.flow === 'automatic')
    .map((row) => ({
      code: row.code,
      name: asLocalizedText(row.name)[locale] ?? asLocalizedText(row.name).en ?? row.code,
      flow: row.flow,
      sandbox: row.sandbox_mode
    }));
  return (
    <StorefrontShell>
      <CheckoutConsole
        locale={locale}
        methods={methods}
        signedIn={Boolean(auth)}
        defaultEmail={auth?.user.email ?? ''}
        defaultCountry={profile?.country_code ?? 'LB'}
        labels={{
          title: t('title'),
          description: t('description'),
          email: t('email'),
          country: t('country'),
          notes: t('notes'),
          terms: t('terms'),
          payment: t('payment'),
          wallet: t('wallet'),
          place: t('place'),
          processing: t('processing'),
          error: t('error'),
          accountRequired: t('accountRequired')
        }}
      />
    </StorefrontShell>
  );
}
