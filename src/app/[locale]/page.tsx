import {useTranslations} from 'next-intl';
import {setRequestLocale} from 'next-intl/server';

import {StorefrontShell} from '@/components/layout/storefront-shell';
import {
  MarketingHome,
  type ManagedHomepageSection
} from '@/features/storefront/components/marketing-home';

type HomePageProps = {params: Promise<{locale: string}>};

export default async function HomePage({params}: HomePageProps) {
  const {locale} = await params;
  setRequestLocale(locale);
  const sections = await loadHomepageSections();
  return <HomeContent sections={sections} />;
}

async function loadHomepageSections(): Promise<ManagedHomepageSection[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  const params = new URLSearchParams({
    select: 'id,section_type,content,configuration,sort_order,starts_at,ends_at',
    active: 'eq.true',
    deleted_at: 'is.null',
    order: 'sort_order.asc'
  });
  try {
    const response = await fetch(`${url}/rest/v1/homepage_sections?${params}`, {
      headers: {apikey: key, Authorization: `Bearer ${key}`},
      next: {revalidate: 60}
    });
    if (!response.ok) return [];
    const now = Date.now();
    const rows = (await response.json()) as ManagedHomepageSection[];
    return rows.filter(
      (section) =>
        (!section.starts_at || Date.parse(section.starts_at) <= now) &&
        (!section.ends_at || Date.parse(section.ends_at) > now)
    );
  } catch {
    return [];
  }
}

function HomeContent({sections}: {sections: ManagedHomepageSection[]}) {
  const t = useTranslations('A11y');
  return (
    <>
      <a className="skip-link" href="#main">
        {t('skip')}
      </a>
      <StorefrontShell>
        <MarketingHome managedSections={sections} />
      </StorefrontShell>
    </>
  );
}
