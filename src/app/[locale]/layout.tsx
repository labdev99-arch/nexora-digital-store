import {hasLocale, NextIntlClientProvider} from 'next-intl';
import {getMessages, getTranslations, setRequestLocale} from 'next-intl/server';
import {Geist, IBM_Plex_Sans_Arabic} from 'next/font/google';
import {notFound} from 'next/navigation';
import type {Metadata, Viewport} from 'next';
import type {ReactNode} from 'react';

import {Providers} from '@/components/providers';
import {routing} from '@/i18n/routing';
import {PwaManager} from '@/features/pwa/components/pwa-manager';
import {ConsentManager} from '@/features/privacy/components/consent-manager';
import '../globals.css';

const geist = Geist({subsets: ['latin'], variable: '--font-latin', display: 'swap'});
const arabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arabic',
  display: 'swap'
});

type LayoutProps = {children: ReactNode; params: Promise<{locale: string}>};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({locale}));
}

export const viewport: Viewport = {
  colorScheme: 'dark light',
  themeColor: [
    {media: '(prefers-color-scheme: dark)', color: 'rgb(10, 10, 15)'},
    {media: '(prefers-color-scheme: light)', color: 'rgb(248, 248, 251)'}
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover'
};

export async function generateMetadata({params}: Omit<LayoutProps, 'children'>): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: 'Metadata'});
  return {
    applicationName: 'Nexora',
    title: {default: t('title'), template: `%s · ${t('title')}`},
    description: t('description'),
    metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
    manifest: '/manifest.webmanifest',
    icons: {
      icon: [
        {url: '/favicon.svg', type: 'image/svg+xml'},
        {url: '/favicon-32.png', sizes: '32x32', type: 'image/png'},
        {url: '/favicon-16.png', sizes: '16x16', type: 'image/png'}
      ],
      apple: [{url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png'}]
    },
    openGraph: {title: t('title'), description: t('description'), type: 'website'},
    twitter: {card: 'summary_large_image', title: t('title'), description: t('description')},
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: 'Nexora',
      startupImage: [
        {url: '/splash/splash-640x1136.png', media: '(device-width: 320px)'},
        {url: '/splash/splash-1170x2532.png', media: '(device-width: 390px)'},
        {url: '/splash/splash-1290x2796.png', media: '(device-width: 430px)'}
      ]
    }
  };
}

export default async function LocaleLayout({children, params}: LayoutProps) {
  const {locale} = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  const direction = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <html
      lang={locale}
      dir={direction}
      suppressHydrationWarning
      className={`${geist.variable} ${arabic.variable}`}
    >
      <body>
        <NextIntlClientProvider messages={messages}>
          <Providers>
            {children}
            <PwaManager />
            <ConsentManager />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
