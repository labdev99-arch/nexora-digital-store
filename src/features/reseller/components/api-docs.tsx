'use client';

import {BookOpen, CheckCircle2, Copy, ShieldCheck, Terminal} from 'lucide-react';
import {useLocale, useTranslations} from 'next-intl';
import {useMemo, useState} from 'react';

import {Button} from '@/components/ui/button';
import {Badge, Card, CardContent, CardHeader, CardTitle} from '@/components/ui/surfaces';

const endpoints = [
  {method: 'GET', path: '/api/v1/products', key: 'products'},
  {method: 'GET', path: '/api/v1/prices', key: 'prices'},
  {method: 'GET', path: '/api/v1/stock', key: 'stock'},
  {method: 'POST', path: '/api/v1/orders', key: 'orders'},
  {method: 'GET', path: '/api/v1/balance', key: 'balance'},
  {method: 'POST', path: '/api/v1/webhooks', key: 'webhooks'}
] as const;
type Language = 'curl' | 'javascript' | 'php' | 'python';

export function ApiDocs() {
  const t = useTranslations('ApiDocs');
  const locale = useLocale();
  const [selected, setSelected] = useState<(typeof endpoints)[number]>(endpoints[0]);
  const [language, setLanguage] = useState<Language>('curl');
  const [copied, setCopied] = useState(false);
  const base =
    typeof window === 'undefined'
      ? 'https://nexora-digital-store.vercel.app'
      : window.location.origin;
  const samples = useMemo(() => {
    const url = `${base}${selected.path}`;
    return {
      curl: `curl -X ${selected.method} '${url}' \\\n+  -H 'X-Nexora-Key: nx_test_…' \\\n+  -H 'X-Nexora-Timestamp: 2026-08-15T12:00:00.000Z' \\\n+  -H 'X-Nexora-Nonce: unique-request-001' \\\n+  -H 'X-Nexora-Signature: <hmac-sha256>'`,
      javascript: `const response = await fetch('${url}', {\n  method: '${selected.method}',\n  headers: signedHeaders\n});\nconst result = await response.json();`,
      php: `$response = $client->request('${selected.method}', '${url}', [\n  'headers' => $signedHeaders\n]);`,
      python: `response = requests.${selected.method.toLowerCase()}(\n    '${url}',\n    headers=signed_headers\n)\nresult = response.json()`
    };
  }, [base, selected]);
  const code = samples[language];
  return (
    <main className="api-docs-page">
      <header className="api-docs-hero">
        <Badge tone="accent">
          <BookOpen />
          {t('version')}
        </Badge>
        <h1>{t('title')}</h1>
        <p>{t('description')}</p>
        <div>
          <Button asChild variant="gradient">
            <a href="/api/openapi.json">{t('downloadSpec')}</a>
          </Button>
          <Button asChild variant="outline">
            <a href={`/${locale}/reseller`}>{t('dashboard')}</a>
          </Button>
        </div>
      </header>
      <section className="api-docs-security">
        <Card>
          <CardHeader>
            <ShieldCheck />
            <CardTitle>{t('authentication')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{t('authenticationDescription')}</p>
            <ol>
              <li>{t('signStep1')}</li>
              <li>{t('signStep2')}</li>
              <li>{t('signStep3')}</li>
            </ol>
            <code>{t('canonical')}</code>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CheckCircle2 />
            <CardTitle>{t('reliability')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{t('reliabilityDescription')}</p>
            <ul>
              <li>{t('idempotency')}</li>
              <li>{t('replay')}</li>
              <li>{t('rateLimits')}</li>
              <li>{t('sandbox')}</li>
            </ul>
          </CardContent>
        </Card>
      </section>
      <section className="api-explorer">
        <nav aria-label={t('endpoints')}>
          <h2>{t('endpoints')}</h2>
          {endpoints.map((endpoint) => (
            <button
              key={endpoint.path}
              type="button"
              data-active={endpoint.path === selected.path}
              onClick={() => setSelected(endpoint)}
            >
              <Badge tone={endpoint.method === 'POST' ? 'warning' : 'info'}>
                {endpoint.method}
              </Badge>
              <span>{t(`endpoint.${endpoint.key}`)}</span>
              <code>{endpoint.path}</code>
            </button>
          ))}
        </nav>
        <Card>
          <CardHeader>
            <Terminal />
            <div>
              <CardTitle>{t(`endpoint.${selected.key}`)}</CardTitle>
              <code>
                {selected.method} {selected.path}
              </code>
            </div>
          </CardHeader>
          <CardContent>
            <p>{t(`endpointDescription.${selected.key}`)}</p>
            <div className="api-language-tabs">
              {(['curl', 'javascript', 'php', 'python'] as const).map((item) => (
                <button
                  type="button"
                  key={item}
                  data-active={language === item}
                  onClick={() => setLanguage(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            <pre>
              <code>{code}</code>
            </pre>
            <Button
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(code);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              }}
            >
              <Copy />
              {copied ? t('copied') : t('copy')}
            </Button>
          </CardContent>
        </Card>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>{t('smmTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p>{t('smmDescription')}</p>
          <code>POST /api/smm · action=services|add|status|balance</code>
        </CardContent>
      </Card>
    </main>
  );
}
