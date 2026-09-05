'use client';
import {Check, Copy, Download, MessageCircle, RotateCcw, XCircle} from 'lucide-react';
import {useEffect, useState, useTransition} from 'react';
import {toast} from 'sonner';
import {ReviewForm} from '@/features/reviews/components/reviews';
import {Button} from '@/components/ui/button';
import {Input, Textarea} from '@/components/ui/form-controls';
import {PriceDisplay} from '@/components/ui/advanced';
import {createClient} from '@/lib/supabase/client';
import type {CurrencyCode} from '@/lib/money';
import type {Json, OrderStatus} from '@/lib/supabase/database.types';

type Detail = {
  order: {
    id: string;
    order_number: string;
    status: OrderStatus;
    currency_code: string;
    total_amount: number;
    created_at: string;
  };
  items: Array<{
    id: string;
    product_name: Json;
    variant_name: Json;
    quantity: number;
    total_amount: number;
  }>;
  events: Array<{id: string; to_status: OrderStatus; created_at: string; reason: string | null}>;
  deliveries: Array<{
    id: string;
    kind: string;
    display_hint: string | null;
    revealed_at: string | null;
  }>;
  messages: Array<{id: string; body: string; author_type: string; created_at: string}>;
  payment: {
    id: string;
    status: string;
    payment_reference: string | null;
    payable_amount: number;
    client_action: Json;
    method: {code: string; flow: 'automatic' | 'proof'; instructions: Json} | null;
  } | null;
};
type Labels = {
  status: string;
  total: string;
  items: string;
  timeline: string;
  deliveries: string;
  reveal: string;
  copy: string;
  download: string;
  cancel: string;
  refund: string;
  reorder: string;
  reason: string;
  send: string;
  message: string;
  invoice: string;
  receipt: string;
  emptyDeliveries: string;
  success: string;
  error: string;
  paymentPending: string;
  paymentReference: string;
  proof: string;
  uploadProof: string;
  proofUploaded: string;
  statusLabels: Record<OrderStatus, string>;
};
function localized(value: Json, locale: string) {
  return value && !Array.isArray(value) && typeof value === 'object'
    ? String(value[locale] ?? value.en ?? '')
    : '';
}
function localizedLines(value: Json, locale: string): string[] {
  const candidate =
    value && !Array.isArray(value) && typeof value === 'object' ? value[locale] : value;
  return Array.isArray(candidate) ? candidate.map(String) : [];
}
export function OrderDetail({
  initial,
  locale,
  labels,
  canMutate = true
}: {
  initial: Detail;
  locale: string;
  labels: Labels;
  canMutate?: boolean;
}) {
  const [detail, setDetail] = useState(initial);
  const [message, setMessage] = useState('');
  const [reason, setReason] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`order-${detail.order.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'order_events',
          filter: `order_id=eq.${detail.order.id}`
        },
        (payload) => {
          const event = payload.new as Detail['events'][number];
          setDetail((current) => ({
            ...current,
            order: {...current.order, status: event.to_status},
            events: [...current.events, event]
          }));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'order_messages',
          filter: `order_id=eq.${detail.order.id}`
        },
        (payload) =>
          setDetail((current) => ({
            ...current,
            messages: [...current.messages, payload.new as Detail['messages'][number]]
          }))
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [detail.order.id]);
  const action = (body: Record<string, unknown>) =>
    startTransition(async () => {
      const response = await fetch(`/api/orders/${detail.order.id}`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify(body)
      });
      if (response.ok) {
        toast.success(labels.success);
        window.location.reload();
      } else toast.error(labels.error);
    });
  const reveal = (id: string) =>
    startTransition(async () => {
      const response = await fetch(`/api/orders/deliveries/${id}`, {method: 'POST'});
      const payload = (await response.json()) as {kind?: string; value?: string};
      if (payload.kind === 'file' && payload.value)
        window.open(payload.value, '_blank', 'noopener,noreferrer');
      else if (payload.value) {
        await navigator.clipboard.writeText(payload.value);
        toast.success(labels.copy);
      }
    });
  const uploadProof = () =>
    startTransition(async () => {
      if (!proof || !detail.payment) return;
      const body = new FormData();
      body.set('file', proof);
      const response = await fetch(`/api/payments/${detail.payment.id}/proof`, {
        method: 'POST',
        body
      });
      if (response.ok) toast.success(labels.proofUploaded);
      else toast.error(labels.error);
    });
  return (
    <main className="order-detail">
      <header>
        <div>
          <span>{detail.order.order_number}</span>
          <h1>
            {labels.status}: {labels.statusLabels[detail.order.status]}
          </h1>
        </div>
        <PriceDisplay
          amount={detail.order.total_amount}
          currency={detail.order.currency_code as CurrencyCode}
          size="lg"
        />
      </header>
      <div className="order-document-links">
        <a href={`/${locale}/${canMutate ? 'account/' : ''}orders/${detail.order.id}/invoice.pdf`}>
          {labels.invoice}
        </a>
        <a href={`/${locale}/${canMutate ? 'account/' : ''}orders/${detail.order.id}/receipt.pdf`}>
          {labels.receipt}
        </a>
      </div>
      {detail.payment && detail.order.status === 'awaiting_payment' ? (
        <section className="order-payment-panel">
          <h2>{labels.paymentPending}</h2>
          {detail.payment.payment_reference ? (
            <p>
              {labels.paymentReference}: <code>{detail.payment.payment_reference}</code>
            </p>
          ) : null}
          {detail.payment.method ? (
            <ol>
              {localizedLines(detail.payment.method.instructions, locale).map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ol>
          ) : null}
          {canMutate && detail.payment.method?.flow === 'proof' ? (
            <div className="proof-upload-row">
              <Input
                type="file"
                label={labels.proof}
                accept="image/png,image/jpeg,image/webp,application/pdf"
                onChange={(event) => setProof(event.target.files?.[0] ?? null)}
              />
              <Button disabled={!proof || pending} loading={pending} onClick={uploadProof}>
                {labels.uploadProof}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}
      <section>
        <h2>{labels.items}</h2>
        {detail.items.map((item) => (
          <article className="order-line" key={item.id}>
            <div>
              <strong>{localized(item.product_name, locale)}</strong>
              <span>
                {localized(item.variant_name, locale)} · ×{item.quantity}
              </span>
            </div>
            <PriceDisplay
              amount={item.total_amount}
              currency={detail.order.currency_code as CurrencyCode}
            />
            {canMutate && ['delivered', 'completed'].includes(detail.order.status) ? (
              <ReviewForm orderItemId={item.id} />
            ) : null}
          </article>
        ))}
      </section>
      <section>
        <h2>{labels.timeline}</h2>
        <ol className="order-timeline">
          {detail.events.map((event) => (
            <li key={event.id}>
              <Check aria-hidden="true" />
              <div>
                <strong>{labels.statusLabels[event.to_status]}</strong>
                <span>
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                  }).format(new Date(event.created_at))}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section>
        <h2>{labels.deliveries}</h2>
        {detail.deliveries.length ? (
          detail.deliveries.map((item) => (
            <article className="delivery-card" key={item.id}>
              <code>{item.display_hint ?? '•••• •••• ••••'}</code>
              <Button disabled={pending} onClick={() => reveal(item.id)}>
                {item.kind === 'file' ? <Download /> : <Copy />}
                {labels.reveal}
              </Button>
            </article>
          ))
        ) : (
          <p>{labels.emptyDeliveries}</p>
        )}
      </section>
      {canMutate ? (
        <>
          <section className="order-actions">
            <Input
              label={labels.reason}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => action({action: 'cancel'})}
            >
              <XCircle />
              {labels.cancel}
            </Button>
            <Button
              disabled={pending || reason.length < 3}
              onClick={() => action({action: 'refund', reason})}
            >
              <RotateCcw />
              {labels.refund}
            </Button>
            <Button disabled={pending} onClick={() => action({action: 'reorder'})}>
              <RotateCcw />
              {labels.reorder}
            </Button>
          </section>
          <section>
            <h2>{labels.message}</h2>
            <div className="order-chat">
              {detail.messages.map((item) => (
                <p key={item.id} data-author={item.author_type}>
                  {item.body}
                </p>
              ))}
            </div>
            <Textarea
              label={labels.message}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
            <Button
              disabled={pending || !message.trim()}
              onClick={() => action({action: 'message', body: message})}
            >
              <MessageCircle />
              {labels.send}
            </Button>
          </section>
        </>
      ) : null}
    </main>
  );
}
