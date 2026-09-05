import {getTranslations, setRequestLocale} from 'next-intl/server';

import {NotificationPreferencesV2} from '@/features/notifications/components/notification-preferences';
import {requireUser} from '@/features/auth/server/authorization';
import {createClient} from '@/lib/supabase/server';

export default async function NotificationsPage({params}: {params: Promise<{locale: string}>}) {
  const {locale} = await params;
  setRequestLocale(locale);
  const context = await requireUser(locale);
  const t = await getTranslations('Account.notifications');
  const supabase = await createClient();
  const [{data: matrix}, {data: settings}, {data: connections}] = await Promise.all([
    supabase
      .from('notification_event_preferences')
      .select('event_key,channel,enabled')
      .eq('profile_id', context.user.id),
    supabase
      .from('notification_settings')
      .select('*')
      .eq('profile_id', context.user.id)
      .maybeSingle(),
    supabase
      .from('notification_channel_connections')
      .select('channel,status,display_hint')
      .eq('profile_id', context.user.id)
  ]);
  return (
    <div className="account-page">
      <header className="account-page-heading">
        <div>
          <p>{t('eyebrow')}</p>
          <h1>{t('title')}</h1>
          <span>{t('description')}</span>
        </div>
      </header>
      <NotificationPreferencesV2
        matrix={(matrix ?? []).map((row) => ({
          event_key: String(row.event_key),
          channel: String(
            row.channel
          ) as import('@/lib/supabase/database.types').NotificationChannel,
          enabled: Boolean(row.enabled)
        }))}
        settings={settings}
        connections={connections ?? []}
      />
    </div>
  );
}
