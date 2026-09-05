'use client';

import {useState} from 'react';
import {useTranslations} from 'next-intl';

import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/surfaces';

export function PrivacyControls() {
  const t = useTranslations('Privacy.account');
  const [status, setStatus] = useState<string>();

  async function requestDeletion() {
    if (!window.confirm(t('deleteConfirm'))) return;
    const response = await fetch('/api/account/delete', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({reason: 'user_requested'})
    });
    const payload = (await response.json()) as {error?: string};
    setStatus(response.ok ? t('deleteScheduled') : t(`errors.${payload.error ?? 'failed'}`));
  }

  return (
    <div className="privacy-control-grid">
      <Card>
        <h2>{t('exportTitle')}</h2>
        <p>{t('exportDescription')}</p>
        <Button
          variant="outline"
          onClick={() => window.location.assign('/api/account/data-export')}
        >
          {t('exportAction')}
        </Button>
      </Card>
      <Card>
        <h2>{t('deleteTitle')}</h2>
        <p>{t('deleteDescription')}</p>
        <Button variant="destructive" onClick={() => void requestDeletion()}>
          {t('deleteAction')}
        </Button>
      </Card>
      {status ? <p role="status">{status}</p> : null}
    </div>
  );
}
