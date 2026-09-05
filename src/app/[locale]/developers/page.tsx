import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {StorefrontShell} from '@/components/layout/storefront-shell';
import {ApiDocs} from '@/features/reseller/components/api-docs';

export async function generateMetadata({
  params
}: {
  params: Promise<{locale: string}>;
}): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: 'ApiDocs'});
  return {title: t('metaTitle'), description: t('metaDescription')};
}

export default async function DevelopersPage({params}: {params: Promise<{locale: string}>}) {
  const {locale} = await params;
  setRequestLocale(locale);
  return (
    <StorefrontShell>
      <ApiDocs />
    </StorefrontShell>
  );
}
