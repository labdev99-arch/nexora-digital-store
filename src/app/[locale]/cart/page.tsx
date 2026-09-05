import {getTranslations, setRequestLocale} from 'next-intl/server';
import {StorefrontShell} from '@/components/layout/storefront-shell';
import {CartConsole} from '@/features/commerce/components/cart-console';

export default async function CartPage({params}: {params: Promise<{locale: string}>}) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations({locale, namespace: 'Commerce.cart'});
  return (
    <StorefrontShell>
      <CartConsole
        locale={locale}
        labels={{
          title: t('title'),
          description: t('description'),
          empty: t('empty'),
          browse: t('browse'),
          quantity: t('quantity'),
          remove: t('remove'),
          subtotal: t('subtotal'),
          coupon: t('coupon'),
          apply: t('apply'),
          checkout: t('checkout'),
          updated: t('updated'),
          error: t('error'),
          upsells: t('upsells'),
          add: t('add')
        }}
      />
    </StorefrontShell>
  );
}
