'use client';

import {Bot, ExternalLink, Headphones, LoaderCircle, Send, ShieldCheck, X} from 'lucide-react';
import {useLocale, useTranslations} from 'next-intl';
import {useRef, useState} from 'react';
import {Button} from '@/components/ui/button';
import {Link} from '@/i18n/navigation';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Array<{title: string; url: string; type: string}>;
};

export function SupportAssistant() {
  const locale = useLocale() as 'ar' | 'en';
  const t = useTranslations('AI.assistant');
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [conversationId, setConversationId] = useState<string>();
  const [messages, setMessages] = useState<Message[]>([]),
    [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  async function send() {
    const value = input.current?.value.trim();
    if (!value || busy) return;
    if (input.current) input.current.value = '';
    setMessages((items) => [...items, {id: crypto.randomUUID(), role: 'user', content: value}]);
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/ai/support', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({locale, message: value, conversationId})
      });
      const payload = (await response.json()) as {
        data?: {
          conversationId: string;
          answer: string;
          citations: Array<{title: string; url: string; type: string}>;
        };
        error?: string;
      };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? 'failed');
      setConversationId(payload.data.conversationId);
      setMessages((items) => [
        ...items,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: payload.data!.answer,
          citations: payload.data!.citations
        }
      ]);
    } catch {
      setError(t('error'));
    } finally {
      setBusy(false);
    }
  }
  async function escalate() {
    if (!conversationId || busy) return;
    setBusy(true);
    try {
      const response = await fetch('/api/ai/support', {
        method: 'PUT',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({locale, conversationId})
      });
      const payload = (await response.json()) as {data?: {ticketId: string}};
      if (!response.ok || !payload.data) throw new Error('failed');
      setMessages((items) => [
        ...items,
        {id: crypto.randomUUID(), role: 'assistant', content: t('escalated')}
      ]);
    } catch {
      setError(t('error'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="assistant-root">
      {open ? (
        <section
          className="assistant-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="assistant-title"
        >
          <header>
            <span>
              <Bot aria-hidden="true" />
              <span>
                <strong id="assistant-title">{t('title')}</strong>
                <small>
                  <ShieldCheck aria-hidden="true" />
                  {t('private')}
                </small>
              </span>
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              aria-label={t('close')}
            >
              <X />
            </Button>
          </header>
          <div className="assistant-messages" aria-live="polite">
            {messages.length === 0 ? (
              <div className="assistant-welcome">
                <Bot aria-hidden="true" />
                <strong>{t('welcomeTitle')}</strong>
                <p>{t('welcomeBody')}</p>
              </div>
            ) : (
              messages.map((message) => (
                <article className={`assistant-message ${message.role}`} key={message.id}>
                  <p>{message.content}</p>
                  {message.citations?.length ? (
                    <div className="assistant-citations">
                      <span>{t('sources')}</span>
                      {message.citations.map((citation) => (
                        <Link href={citation.url} key={`${message.id}-${citation.url}`}>
                          <ExternalLink aria-hidden="true" />
                          {citation.title}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))
            )}
            {busy ? (
              <div className="assistant-thinking">
                <LoaderCircle aria-hidden="true" />
                {t('thinking')}
              </div>
            ) : null}
            {error ? <p className="assistant-error">{error}</p> : null}
          </div>
          <footer>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              <label className="sr-only" htmlFor="assistant-input">
                {t('placeholder')}
              </label>
              <input
                ref={input}
                id="assistant-input"
                placeholder={t('placeholder')}
                maxLength={4000}
              />
              <Button variant="gradient" size="icon" disabled={busy} aria-label={t('send')}>
                <Send />
              </Button>
            </form>
            {conversationId ? (
              <button type="button" onClick={() => void escalate()} disabled={busy}>
                <Headphones aria-hidden="true" />
                {t('human')}
              </button>
            ) : null}
            <small>{t('disclaimer')}</small>
          </footer>
        </section>
      ) : null}
      <Button
        className="assistant-launcher"
        variant="gradient"
        size="lg"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={t('open')}
      >
        <Bot aria-hidden="true" />
        <span>{t('button')}</span>
      </Button>
    </div>
  );
}
