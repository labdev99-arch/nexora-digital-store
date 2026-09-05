'use client';

import {BellRing, Clock3, MessageCircle, Send, Smartphone} from 'lucide-react';
import {useLocale, useTranslations} from 'next-intl';
import {useState, useTransition} from 'react';
import {Button} from '@/components/ui/button';
import {Input, Switch} from '@/components/ui/form-controls';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/surfaces';
import type {NotificationChannel} from '@/lib/supabase/database.types';
import {notificationEvents, type NotificationEvent} from '../types';
import {
  confirmWhatsAppVerificationAction,
  createTelegramLinkAction,
  savePushSubscriptionAction,
  setGlobalUnsubscribeAction,
  startWhatsAppVerificationAction,
  updateEventPreferenceAction,
  updateQuietHoursAction
} from '../server/actions';

type MatrixRow = {event_key: string; channel: NotificationChannel; enabled: boolean};
const channels: NotificationChannel[] = ['in_app', 'email', 'push', 'whatsapp', 'telegram', 'sms'];
export function NotificationPreferencesV2({
  matrix,
  settings,
  connections
}: {
  matrix: MatrixRow[];
  settings: Record<string, unknown> | null;
  connections: Array<Record<string, unknown>>;
}) {
  const locale = useLocale() === 'ar' ? 'ar' : 'en';
  const t = useTranslations('Notifications.preferences');
  const [rows, setRows] = useState(matrix);
  const [pending, startTransition] = useTransition();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [verificationSent, setVerificationSent] = useState(false);
  const [result, setResult] = useState('');
  const enabled = (event: NotificationEvent, channel: NotificationChannel) =>
    rows.find((r) => r.event_key === event && r.channel === channel)?.enabled ??
    channel === 'in_app';
  const toggle = (event: NotificationEvent, channel: NotificationChannel, value: boolean) => {
    setRows((current) => [
      ...current.filter((r) => !(r.event_key === event && r.channel === channel)),
      {event_key: event, channel, enabled: value}
    ]);
    startTransition(async () => {
      const response = await updateEventPreferenceAction({
        eventKey: event,
        channel,
        enabled: value,
        locale
      });
      if (!response.ok) setResult(t('saveFailed'));
    });
  };
  const linked = (channel: string) =>
    connections.some((row) => row.channel === channel && row.status === 'verified');
  const enablePush = () =>
    startTransition(async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setResult(t('pushUnsupported'));
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
        setResult(t('saveFailed'));
        return;
      }
      const response = await savePushSubscriptionAction({
        endpoint: json.endpoint,
        keys: json.keys,
        locale
      });
      setResult(response.ok ? t('pushEnabled') : t('saveFailed'));
    });
  return (
    <div className="notification-preferences-v2" aria-busy={pending}>
      <Card>
        <CardHeader>
          <span className="account-card-icon">
            <BellRing />
          </span>
          <CardTitle>{t('matrixTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="notification-matrix" role="table">
            <div className="notification-matrix-head" role="row">
              <strong role="columnheader">{t('event')}</strong>
              {channels.map((channel) => (
                <strong role="columnheader" key={channel}>
                  {t(`channels.${channel}`)}
                </strong>
              ))}
            </div>
            {notificationEvents.map((event) => (
              <div className="notification-matrix-row" role="row" key={event}>
                <span role="cell">{t(`events.${event.replace('.', '_')}`)}</span>
                {channels.map((channel) => (
                  <span role="cell" key={channel}>
                    <Switch
                      label={`${t(`events.${event.replace('.', '_')}`)} — ${t(`channels.${channel}`)}`}
                      checked={enabled(event, channel)}
                      onCheckedChange={(value) => toggle(event, channel, value)}
                    />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <div className="notification-settings-grid">
        <Card>
          <CardHeader>
            <span className="account-card-icon">
              <Clock3 />
            </span>
            <CardTitle>{t('quietTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              action={(form) =>
                startTransition(async () => {
                  const response = await updateQuietHoursAction({
                    enabled: form.get('enabled') === 'on',
                    start: String(form.get('start')),
                    end: String(form.get('end')),
                    timezone: String(form.get('timezone')),
                    locale
                  });
                  setResult(response.ok ? t('saved') : t('saveFailed'));
                })
              }
            >
              <Switch
                name="enabled"
                label={t('quietEnabled')}
                defaultChecked={Boolean(settings?.quiet_hours_enabled)}
              />
              <Input
                name="start"
                type="time"
                label={t('quietStart')}
                defaultValue={String(settings?.quiet_start ?? '22:00').slice(0, 5)}
              />
              <Input
                name="end"
                type="time"
                label={t('quietEnd')}
                defaultValue={String(settings?.quiet_end ?? '08:00').slice(0, 5)}
              />
              <Input
                name="timezone"
                label={t('timezone')}
                defaultValue={String(
                  settings?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
                )}
              />
              <Button type="submit" loading={pending}>
                {t('save')}
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <span className="account-card-icon">
              <MessageCircle />
            </span>
            <CardTitle>{t('connectionsTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="connection-stack">
            <div>
              <strong>{t('whatsapp')}</strong>
              <span>{linked('whatsapp') ? t('linked') : t('notLinked')}</span>
            </div>
            {!linked('whatsapp') ? (
              <>
                <Input
                  label={t('phone')}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+961..."
                />
                <Button
                  variant="outline"
                  loading={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const response = await startWhatsAppVerificationAction({phone, locale});
                      setVerificationSent(response.ok);
                      setResult(response.ok ? t('codeSent') : t('saveFailed'));
                    })
                  }
                >
                  <Smartphone />
                  {t('sendCode')}
                </Button>
                {verificationSent ? (
                  <>
                    <Input
                      label={t('code')}
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      inputMode="numeric"
                    />
                    <Button
                      loading={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const response = await confirmWhatsAppVerificationAction({
                            phone,
                            code,
                            locale
                          });
                          setResult(response.ok ? t('linked') : t('invalidCode'));
                        })
                      }
                    >
                      {t('verify')}
                    </Button>
                  </>
                ) : null}
              </>
            ) : null}
            <div>
              <strong>{t('telegram')}</strong>
              <span>{linked('telegram') ? t('linked') : t('notLinked')}</span>
            </div>
            {!linked('telegram') ? (
              <Button
                variant="outline"
                loading={pending}
                onClick={() =>
                  startTransition(async () => {
                    const response = await createTelegramLinkAction(locale);
                    if (response.ok && response.data)
                      window.open(response.data.url, '_blank', 'noopener,noreferrer');
                    else setResult(t('saveFailed'));
                  })
                }
              >
                <Send />
                {t('linkTelegram')}
              </Button>
            ) : null}
            <Button variant="outline" onClick={enablePush}>
              <BellRing />
              {t('enablePush')}
            </Button>
            <Button
              variant="ghost"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const unsubscribe = !Boolean(settings?.global_unsubscribed_at);
                  const response = await setGlobalUnsubscribeAction(locale, unsubscribe);
                  setResult(
                    response.ok ? t(unsubscribe ? 'unsubscribed' : 'resubscribed') : t('saveFailed')
                  );
                })
              }
            >
              {t(settings?.global_unsubscribed_at ? 'resubscribe' : 'unsubscribe')}
            </Button>
          </CardContent>
        </Card>
      </div>
      {result ? (
        <p className="form-result" role="status">
          {result}
        </p>
      ) : null}
    </div>
  );
}
