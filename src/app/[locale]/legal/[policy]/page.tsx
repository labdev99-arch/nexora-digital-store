import {getTranslations, setRequestLocale} from 'next-intl/server';
import {notFound} from 'next/navigation';

const policies = ['privacy', 'terms', 'refund'] as const;
type Policy = (typeof policies)[number];

export function generateStaticParams() {
  return policies.map((policy) => ({policy}));
}

export default async function LegalPage({
  params
}: {
  params: Promise<{locale: string; policy: string}>;
}) {
  const {locale, policy} = await params;
  if (!policies.includes(policy as Policy)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({locale, namespace: `Privacy.legal.${policy}`});
  return (
    <main className="legal-page">
      <article>
        <p className="legal-eyebrow">{t('eyebrow')}</p>
        <h1>{t('title')}</h1>
        <p className="legal-updated">{t('updated')}</p>
        {(['scope', 'data', 'payments', 'rights', 'contact'] as const).map((section) => (
          <section key={section}>
            <h2>{t(`${section}.title`)}</h2>
            <p>{t(`${section}.body`)}</p>
          </section>
        ))}
      </article>
    </main>
  );
}
