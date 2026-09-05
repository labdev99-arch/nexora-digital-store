'use client';

import {Bell, CheckCheck, ExternalLink} from 'lucide-react';
import {useLocale, useTranslations} from 'next-intl';
import {useEffect, useState, useTransition} from 'react';
import {Button} from '@/components/ui/button';
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/overlays';
import {Link} from '@/i18n/navigation';
import {createClient} from '@/lib/supabase/client';
import type {InAppNotificationRow} from '@/lib/supabase/database.types';
import {markAllNotificationsReadAction, markNotificationReadAction} from '../server/actions';

export function NotificationCenter() {
  const t = useTranslations('Notifications.bell');
  const locale = useLocale();
  const [rows, setRows] = useState<InAppNotificationRow[]>([]);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js');
    const supabase = createClient();
    let profile = '';
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void supabase.auth.getUser().then(({data}) => {
      if (!active) return;
      profile = data.user?.id ?? '';
      if (!profile) return;
      void supabase
        .from('in_app_notifications')
        .select('*')
        .eq('profile_id', profile)
        .is('archived_at', null)
        .order('created_at', {ascending: false})
        .limit(12)
        .then(({data: items}) => {
          if (active) setRows(items ?? []);
        });
      channel = supabase
        .channel(`notifications:${profile}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'in_app_notifications',
            filter: `profile_id=eq.${profile}`
          },
          (payload) =>
            setRows((current) => [payload.new as InAppNotificationRow, ...current].slice(0, 12))
        )
        .subscribe();
    });
    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);
  const unread = rows.filter((row) => !row.read_at).length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={t('label')} className="notification-bell">
          <Bell />
          {unread ? <span>{unread > 9 ? '9+' : unread}</span> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align={locale === 'ar' ? 'start' : 'end'} className="notification-popover">
        <header>
          <strong>{t('title')}</strong>
          <Button
            variant="ghost"
            size="sm"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                await markAllNotificationsReadAction();
                setRows((current) =>
                  current.map((row) => ({...row, read_at: new Date().toISOString()}))
                );
              })
            }
          >
            <CheckCheck />
            {t('readAll')}
          </Button>
        </header>
        <div>
          {rows.length ? (
            rows.map((row) => (
              <article key={row.id} data-unread={!row.read_at}>
                <div>
                  <strong>{row.title}</strong>
                  <p>{row.body}</p>
                  <time>
                    {new Intl.RelativeTimeFormat(locale, {numeric: 'auto'}).format(
                      Math.round((new Date(row.created_at).getTime() - Date.now()) / 60000),
                      'minute'
                    )}
                  </time>
                </div>
                {row.action_url ? (
                  <Link
                    href={row.action_url}
                    onClick={() =>
                      startTransition(async () => {
                        await markNotificationReadAction(row.id);
                        setRows((current) =>
                          current.map((item) =>
                            item.id === row.id ? {...item, read_at: new Date().toISOString()} : item
                          )
                        );
                      })
                    }
                  >
                    <ExternalLink />
                    <span className="sr-only">{t('open')}</span>
                  </Link>
                ) : null}
              </article>
            ))
          ) : (
            <p className="notification-empty">{t('empty')}</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
