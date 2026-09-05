'use client';
import {Download, WifiOff, X} from 'lucide-react';
import {useTranslations} from 'next-intl';
import {useEffect, useState} from 'react';
import {Button} from '@/components/ui/button';
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{outcome: 'accepted' | 'dismissed'}>;
}
export function PwaManager() {
  const t = useTranslations('PWA');
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null),
    [offline, setOffline] = useState(false),
    [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if ('serviceWorker' in navigator)
      navigator.serviceWorker.register('/sw.js', {scope: '/'}).catch(() => undefined);
    const before = (event: Event) => {
        event.preventDefault();
        setPrompt(event as InstallPromptEvent);
      },
      online = () => setOffline(false),
      offlineHandler = () => setOffline(true);
    setOffline(!navigator.onLine);
    window.addEventListener('beforeinstallprompt', before);
    window.addEventListener('online', online);
    window.addEventListener('offline', offlineHandler);
    return () => {
      window.removeEventListener('beforeinstallprompt', before);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offlineHandler);
    };
  }, []);
  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    setPrompt(null);
  }
  return (
    <>
      {offline ? (
        <div className="pwa-offline-banner" role="status">
          <WifiOff />
          {t('offline')}
        </div>
      ) : null}
      {prompt && !dismissed ? (
        <aside className="pwa-install-prompt">
          <span>
            <Download />
            <span>
              <strong>{t('installTitle')}</strong>
              <small>{t('installDescription')}</small>
            </span>
          </span>
          <Button size="sm" variant="gradient" onClick={() => void install()}>
            {t('install')}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setDismissed(true)}
            aria-label={t('dismiss')}
          >
            <X />
          </Button>
        </aside>
      ) : null}
    </>
  );
}
export async function queueOfflineAction(url: string, body: unknown, idempotencyKey: string) {
  if (!('serviceWorker' in navigator)) throw new Error('service_worker_unavailable');
  const registration = await navigator.serviceWorker.ready;
  registration.active?.postMessage({
    type: 'QUEUE_ACTION',
    item: {
      id: idempotencyKey,
      url,
      method: 'POST',
      headers: {'content-type': 'application/json', 'idempotency-key': idempotencyKey},
      body: JSON.stringify(body),
      createdAt: new Date().toISOString()
    }
  });
}
