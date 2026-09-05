import {notFound} from 'next/navigation';
import {getTranslations, setRequestLocale} from 'next-intl/server';
import {StorefrontShell} from '@/components/layout/storefront-shell';
import {createAdminClient} from '@/lib/supabase/admin';
function local(value: unknown, locale: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const row = value as Record<string, unknown>;
  return String(row[locale] ?? row.en ?? '');
}
export default async function ArticlePage({
  params
}: {
  params: Promise<{locale: string; slug: string}>;
}) {
  const {locale, slug} = await params;
  setRequestLocale(locale);
  const admin = createAdminClient();
  const {data} = await admin
    .from('knowledge_articles')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .is('deleted_at', null)
    .maybeSingle();
  if (!data) notFound();
  const t = await getTranslations('Knowledge');
  return (
    <StorefrontShell>
      <main className="page-shell knowledge-article">
        <p className="section-eyebrow">{t('article')}</p>
        <h1>{local(data.title, locale)}</h1>
        <p>{local(data.excerpt, locale)}</p>
        <article>{local(data.body, locale)}</article>
      </main>
    </StorefrontShell>
  );
}
