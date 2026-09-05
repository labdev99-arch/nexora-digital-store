import {WifiOff} from 'lucide-react';
import {getTranslations, setRequestLocale} from 'next-intl/server';
import {Button} from '@/components/ui/button';
import {Link} from '@/i18n/navigation';
export default async function OfflinePage({params}: {params: Promise<{locale: 'ar' | 'en'}>}) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations({locale, namespace: 'PWA'});
  return (
    <main className="offline-page">
      <div>
        <span>
          <WifiOff />
        </span>
        <h1>{t('offlineTitle')}</h1>
        <p>{t('offlineDescription')}</p>
        <Button asChild variant="gradient">
          <Link href="/">{t('backHome')}</Link>
        </Button>
      </div>
    </main>
  );
}
