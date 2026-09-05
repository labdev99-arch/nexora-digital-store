'use client';
import {Clock3, MessageSquarePlus, Paperclip, RefreshCw, Send, Star} from 'lucide-react';
import {useLocale, useTranslations} from 'next-intl';
import {useEffect, useRef, useState, useTransition} from 'react';
import {Button} from '@/components/ui/button';
import {Input, Textarea} from '@/components/ui/form-controls';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/surfaces';
import {createClient} from '@/lib/supabase/client';
import type {SupportTicketMessageRow} from '@/lib/supabase/database.types';
import {
  createTicketAction,
  postTicketMessageAction,
  rateTicketAction,
  reopenTicketAction
} from '../server/actions';

function local(value: unknown, locale: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const row = value as Record<string, unknown>;
  return String(row[locale] ?? row.en ?? '');
}
export function NewTicketForm({categories}: {categories: Array<Record<string, unknown>>}) {
  const locale = useLocale() === 'ar' ? 'ar' : 'en';
  const t = useTranslations('Support');
  const [pending, startTransition] = useTransition();
  return (
    <Card>
      <CardHeader>
        <MessageSquarePlus />
        <CardTitle>{t('newTicket')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          action={(form) =>
            startTransition(async () => {
              await createTicketAction({
                categoryCode: String(form.get('category')),
                subject: String(form.get('subject')),
                description: String(form.get('description')),
                locale
              });
            })
          }
        >
          <label>
            {t('category')}
            <select name="category">
              {categories.map((row) => (
                <option key={String(row.id)} value={String(row.code)}>
                  {local(row.name, locale)}
                </option>
              ))}
            </select>
          </label>
          <Input name="subject" label={t('subject')} required />
          <Textarea name="description" label={t('description')} required />
          <Button type="submit" loading={pending}>
            {t('create')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
export function TicketConversation({
  ticket,
  initialMessages,
  attachments = [],
  cannedReplies = [],
  staff
}: {
  ticket: Record<string, unknown>;
  initialMessages: SupportTicketMessageRow[];
  attachments?: Array<Record<string, unknown>>;
  cannedReplies?: Array<Record<string, unknown>>;
  staff: boolean;
}) {
  const locale = useLocale() === 'ar' ? 'ar' : 'en';
  const t = useTranslations('Support');
  const [messages, setMessages] = useState(initialMessages);
  const [realtimeStatus, setRealtimeStatus] = useState('connecting');
  const [reply, setReply] = useState('');
  const [pending, startTransition] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const id = String(ticket.id);
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`ticket:${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'support_ticket_messages',
          filter: `ticket_id=eq.${id}`
        },
        (payload) =>
          setMessages((current) =>
            current.some((row) => row.id === payload.new.id)
              ? current
              : [...current, payload.new as SupportTicketMessageRow]
          )
      )
      .subscribe((status) => setRealtimeStatus(status.toLowerCase()));
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id]);
  return (
    <div className="ticket-conversation" data-realtime-status={realtimeStatus}>
      <Card>
        <CardHeader>
          <div>
            <span>{String(ticket.ticket_number)}</span>
            <CardTitle>{String(ticket.subject)}</CardTitle>
          </div>
          <span className="ticket-status">{t(`statuses.${String(ticket.status)}`)}</span>
        </CardHeader>
        <CardContent>
          <div className="ticket-sla">
            <Clock3 />
            {t('sla')}{' '}
            <time>
              {new Intl.DateTimeFormat(locale, {dateStyle: 'medium', timeStyle: 'short'}).format(
                new Date(String(ticket.sla_due_at))
              )}
            </time>
          </div>
          <div className="ticket-message-list" aria-live="polite">
            {messages.map((message) => (
              <article key={message.id} data-author={message.author_type} data-kind={message.kind}>
                <strong>
                  {message.author_type === 'customer'
                    ? t('you')
                    : message.kind === 'internal_note'
                      ? t('internalNote')
                      : t('supportTeam')}
                </strong>
                <p>{message.body}</p>
                <time>
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                  }).format(new Date(message.created_at))}
                </time>
              </article>
            ))}
          </div>
          {attachments.length ? (
            <div className="ticket-attachment-list">
              <strong>{t('attachments')}</strong>
              {attachments.map((attachment) => (
                <a
                  key={String(attachment.id)}
                  href={`/api/support/attachments/${String(attachment.id)}`}
                >
                  <Paperclip />
                  {String(attachment.file_name)}
                </a>
              ))}
            </div>
          ) : null}
          {ticket.status !== 'closed' ? (
            <form
              ref={form}
              action={(formData) =>
                startTransition(async () => {
                  const body = String(formData.get('body'));
                  const internal = staff && formData.get('internal') === 'on';
                  const temporaryId = `optimistic-${crypto.randomUUID()}`;
                  setMessages((current) => [
                    ...current,
                    {
                      id: temporaryId,
                      ticket_id: id,
                      author_id: null,
                      author_type: staff ? 'staff' : 'customer',
                      kind: internal ? 'internal_note' : 'message',
                      body,
                      metadata: {},
                      edited_at: null,
                      deleted_at: null,
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString()
                    }
                  ]);
                  const response = await postTicketMessageAction({
                    ticketId: id,
                    body,
                    internal,
                    locale
                  });
                  setMessages((current) => current.filter((message) => message.id !== temporaryId));
                  if (response.ok) {
                    form.current?.reset();
                    setReply('');
                  }
                })
              }
            >
              {staff && cannedReplies.length ? (
                <label>
                  {t('cannedReply')}
                  <select
                    defaultValue=""
                    onChange={(event) => {
                      const selected = cannedReplies.find(
                        (item) => String(item.id) === event.target.value
                      );
                      setReply(local(selected?.body, locale));
                    }}
                  >
                    <option value="">{t('chooseCannedReply')}</option>
                    {cannedReplies.map((item) => (
                      <option key={String(item.id)} value={String(item.id)}>
                        {local(item.title, locale)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <Textarea
                name="body"
                label={t('reply')}
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                required
              />
              {staff ? (
                <label className="inline-check">
                  <input type="checkbox" name="internal" />
                  {t('internalNote')}
                </label>
              ) : null}
              <div>
                <Button type="submit" loading={pending}>
                  <Send />
                  {t('send')}
                </Button>
                <label className="button-like">
                  <Paperclip />
                  {t('attachment')}
                  <input
                    type="file"
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      const body = new FormData();
                      body.set('file', file);
                      void fetch(`/api/support/tickets/${id}/attachments`, {method: 'POST', body});
                    }}
                  />
                </label>
              </div>
            </form>
          ) : (
            <Button
              variant="outline"
              onClick={() =>
                startTransition(async () => void (await reopenTicketAction(id, locale)))
              }
            >
              <RefreshCw />
              {t('reopen')}
            </Button>
          )}
        </CardContent>
      </Card>
      {['resolved', 'closed'].includes(String(ticket.status)) && !ticket.satisfaction_rating ? (
        <Card>
          <CardHeader>
            <Star />
            <CardTitle>{t('rateSupport')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rating-actions">
              {[1, 2, 3, 4, 5].map((rating) => (
                <Button
                  key={rating}
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    startTransition(
                      async () => void (await rateTicketAction({ticketId: id, rating, locale}))
                    )
                  }
                >
                  {rating}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
