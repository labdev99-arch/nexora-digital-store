'use client';

import {CreditCard, ShieldCheck, WalletCards} from 'lucide-react';
import {useState, useTransition} from 'react';
import {useRouter} from '@/i18n/navigation';
import {toast} from 'sonner';

import {Button} from '@/components/ui/button';
import {Checkbox, Input, Textarea} from '@/components/ui/form-controls';

type Method = {code: string; name: string; flow: 'automatic' | 'proof'; sandbox: boolean};
type Labels = {
  title: string;
  description: string;
  email: string;
  country: string;
  notes: string;
  terms: string;
  payment: string;
  wallet: string;
  place: string;
  processing: string;
  error: string;
  accountRequired: string;
};

export function CheckoutConsole({
  locale,
  methods,
  signedIn,
  defaultEmail,
  defaultCountry,
  labels
}: {
  locale: string;
  methods: Method[];
  signedIn: boolean;
  defaultEmail: string;
  defaultCountry: string;
  labels: Labels;
}) {
  const router = useRouter();
  const [method, setMethod] = useState(signedIn ? 'wallet' : (methods[0]?.code ?? ''));
  const [email, setEmail] = useState(defaultEmail);
  const [country, setCountry] = useState(defaultCountry);
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();
  const submit = () =>
    startTransition(async () => {
      const response = await fetch(`/api/checkout?locale=${locale}`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
          paymentMethod: method,
          email: signedIn ? undefined : email,
          countryCode: country.toUpperCase(),
          notes,
          termsAccepted: terms,
          idempotencyKey,
          returnUrl: `${window.location.origin}/${locale}/account/orders`
        })
      });
      const payload = (await response.json()) as {order?: {id: string}; error?: string};
      if (!response.ok || !payload.order) {
        toast.error(payload.error ?? labels.error);
        return;
      }
      router.push(signedIn ? `/account/orders/${payload.order.id}` : `/orders/${payload.order.id}`);
    });
  return (
    <main className="commerce-page site-container">
      <header className="commerce-heading">
        <span>{labels.payment}</span>
        <h1>{labels.title}</h1>
        <p>{labels.description}</p>
      </header>
      <div className="checkout-layout">
        <section className="checkout-form">
          {!signedIn ? (
            <Input
              type="email"
              label={labels.email}
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          ) : null}
          <Input
            label={labels.country}
            required
            minLength={2}
            maxLength={2}
            value={country}
            onChange={(event) => setCountry(event.target.value)}
          />
          <Textarea
            label={labels.notes}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
          <Checkbox
            label={labels.terms}
            checked={terms}
            onCheckedChange={(value) => setTerms(value === true)}
          />
        </section>
        <aside className="payment-methods">
          <h2>{labels.payment}</h2>
          {signedIn ? (
            <button
              type="button"
              data-selected={method === 'wallet' || undefined}
              onClick={() => setMethod('wallet')}
            >
              <WalletCards aria-hidden="true" />
              <span>
                <strong>{labels.wallet}</strong>
              </span>
            </button>
          ) : (
            <p>{labels.accountRequired}</p>
          )}
          {methods.map((item) => (
            <button
              type="button"
              key={item.code}
              data-selected={method === item.code || undefined}
              onClick={() => setMethod(item.code)}
            >
              <CreditCard aria-hidden="true" />
              <span>
                <strong>{item.name}</strong>
                <small>
                  {item.flow}
                  {item.sandbox ? ' · sandbox' : ''}
                </small>
              </span>
            </button>
          ))}
          <Button
            variant="gradient"
            size="lg"
            loading={pending}
            disabled={!method || !terms || (!signedIn && !email)}
            onClick={submit}
          >
            <ShieldCheck aria-hidden="true" />
            {pending ? labels.processing : labels.place}
          </Button>
        </aside>
      </div>
    </main>
  );
}
