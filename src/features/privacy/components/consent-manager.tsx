'use client';

import Script from 'next/script';
import {useEffect, useState} from 'react';
import {useTranslations} from 'next-intl';

import {Button} from '@/components/ui/button';

type Consent = {analytics: boolean; marketing: boolean};

const STORAGE_KEY = 'nexora-consent-v1';

export function ConsentManager() {
  const t = useTranslations('Privacy.consent');
  const [consent, setConsent] = useState<Consent | null>(null);
  const [customizing, setCustomizing] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setConsent(JSON.parse(saved) as Consent);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  async function save(next: Consent) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setConsent(next);
    window.dispatchEvent(new CustomEvent('nexora:consent', {detail: next}));
    await fetch('/api/privacy/consent', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({...next, policyVersion: '2026-08-22'}),
      keepalive: true
    }).catch(() => undefined);
  }

  return (
    <>
      {consent?.analytics && process.env.NEXT_PUBLIC_GA4_ID ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA4_ID}`}
            strategy="afterInteractive"
          />
          <Script id="nexora-ga4" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${process.env.NEXT_PUBLIC_GA4_ID}',{anonymize_ip:true});`}
          </Script>
        </>
      ) : null}

      {!consent ? (
        <aside className="consent-banner" aria-label={t('title')}>
          <div>
            <strong>{t('title')}</strong>
            <p>{t('description')}</p>
          </div>
          {customizing ? (
            <div className="consent-options">
              <label>
                <input type="checkbox" checked disabled /> {t('necessary')}
              </label>
              <label>
                <input id="consent-analytics" type="checkbox" /> {t('analytics')}
              </label>
              <label>
                <input id="consent-marketing" type="checkbox" /> {t('marketing')}
              </label>
              <Button
                size="sm"
                onClick={() =>
                  void save({
                    analytics: Boolean(
                      (document.getElementById('consent-analytics') as HTMLInputElement)?.checked
                    ),
                    marketing: Boolean(
                      (document.getElementById('consent-marketing') as HTMLInputElement)?.checked
                    )
                  })
                }
              >
                {t('save')}
              </Button>
            </div>
          ) : (
            <div className="consent-actions">
              <Button
                size="sm"
                variant="gradient"
                onClick={() => void save({analytics: true, marketing: true})}
              >
                {t('accept')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void save({analytics: false, marketing: false})}
              >
                {t('reject')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCustomizing(true)}>
                {t('customize')}
              </Button>
            </div>
          )}
        </aside>
      ) : null}
    </>
  );
}
