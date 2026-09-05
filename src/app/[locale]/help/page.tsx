import {Search} from 'lucide-react';
import {getTranslations, setRequestLocale} from 'next-intl/server';
import {StorefrontShell} from '@/components/layout/storefront-shell';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/surfaces';
import {Link} from '@/i18n/navigation';
import {getKnowledge} from '@/features/support/server/queries';
function local(value: unknown, locale: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const row = value as Record<string, unknown>;
  return String(row[locale] ?? row.en ?? '');
}
export default async function HelpPage({
  params,
  searchParams
}: {
  params: Promise<{locale: string}>;
  searchParams: Promise<{q?: string}>;
}) {
  const {locale} = await params;
  const {q = ''} = await searchParams;
  setRequestLocale(locale);
  const [data, t] = await Promise.all([getKnowledge(locale, q), getTranslations('Knowledge')]);
  return (
    <StorefrontShell>
      <main className="page-shell knowledge-page">
        <header>
          <p className="section-eyebrow">{t('eyebrow')}</p>
          <h1>{t('title')}</h1>
          <p>{t('subtitle')}</p>
          <form>
            <Search />
            <input name="q" defaultValue={q} placeholder={t('search')} aria-label={t('search')} />
          </form>
        </header>
        <section className="knowledge-categories">
          {data.categories.map((row) => (
            <Card key={String(row.id)}>
              <CardHeader>
                <CardTitle>{local(row.name, locale)}</CardTitle>
              </CardHeader>
              <CardContent>{local(row.description, locale)}</CardContent>
            </Card>
          ))}
        </section>
        {data.articles.length ? (
          <section>
            <h2>{t('articles')}</h2>
            <div className="knowledge-articles">
              {data.articles.map((row) => (
                <Link key={String(row.id)} href={`/help/${row.slug}`}>
                  <Card>
                    <CardHeader>
                      <CardTitle>{local(row.title, locale) || String(row.title)}</CardTitle>
                    </CardHeader>
                    <CardContent>{local(row.excerpt, locale) || String(row.excerpt)}</CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
        <section>
          <h2>{t('faq')}</h2>
          <Accordion type="single" collapsible>
            {data.faqs.map((row) => (
              <AccordionItem key={String(row.id)} value={String(row.id)}>
                <AccordionTrigger>{local(row.question, locale)}</AccordionTrigger>
                <AccordionContent>{local(row.answer, locale)}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      </main>
    </StorefrontShell>
  );
}
