'use client';

import {
  Bitcoin,
  CheckCircle2,
  CreditCard,
  FileCheck2,
  Landmark,
  UploadCloud,
  WalletCards
} from 'lucide-react';
import {useLocale, useTranslations} from 'next-intl';
import {useState, useTransition} from 'react';
import {toast} from 'sonner';

import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/form-controls';
import {Badge, Card} from '@/components/ui/surfaces';
import {formatMinorUnits} from '@/lib/money';
import type {AppLocale} from '@/i18n/routing';
import type {PaymentMethodRow, PaymentRow} from '../types';

const icons = {
  stripe: CreditCard,
  whish: WalletCards,
  omt: WalletCards,
  crypto: Bitcoin,
  bank_transfer: Landmark,
  cash: FileCheck2
} as const;

function text(value: PaymentMethodRow['name'], locale: string): string {
  if (!value || Array.isArray(value) || typeof value !== 'object') return '';
  const result = value[locale] ?? value.en ?? value.ar;
  return typeof result === 'string' ? result : '';
}

function lines(value: PaymentMethodRow['instructions'], locale: string): string[] {
  if (!value || Array.isArray(value) || typeof value !== 'object') return [];
  const result = value[locale] ?? value.en ?? value.ar;
  return Array.isArray(result)
    ? result.filter((item): item is string => typeof item === 'string')
    : [];
}

export function TopupConsole({
  methods,
  initialPayments,
  savedMethods,
  defaultCurrency
}: {
  methods: PaymentMethodRow[];
  initialPayments: PaymentRow[];
  savedMethods: Array<{id: string; brand: string | null; last4: string | null}>;
  defaultCurrency: string;
}) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations('Payments');
  const [selected, setSelected] = useState(methods[0]?.code ?? '');
  const [amount, setAmount] = useState(1000);
  const [currency, setCurrency] = useState(defaultCurrency);
  const [asset, setAsset] = useState<'USDT' | 'BTC' | 'ETH'>('USDT');
  const [network, setNetwork] = useState<'TRC20' | 'ERC20' | 'BEP20' | 'BITCOIN'>('TRC20');
  const [savedPaymentMethodId, setSavedPaymentMethodId] = useState('');
  const [payment, setPayment] = useState<PaymentRow | null>(null);
  const [proof, setProof] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();
  const method = methods.find((item) => item.code === selected) ?? null;
  const fee = method ? method.fee_fixed + Math.ceil((amount * method.fee_bps) / 10_000) : 0;

  const initiate = () =>
    startTransition(async () => {
      try {
        const response = await fetch('/api/payments/topups', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': crypto.randomUUID(),
            'x-locale': locale
          },
          body: JSON.stringify({
            methodCode: selected,
            amount,
            currencyCode: currency,
            returnUrl: `${location.origin}/${locale}/account/wallet/top-up`,
            savedPaymentMethodId:
              selected === 'stripe' ? savedPaymentMethodId || undefined : undefined,
            crypto: selected === 'crypto' ? {asset, network} : undefined
          })
        });
        const result = (await response.json()) as {payment?: PaymentRow; error?: string};
        if (!response.ok || !result.payment) throw new Error(result.error ?? 'failed');
        setPayment(result.payment);
        toast.success(t('success.initiated'));
      } catch {
        toast.error(t('errors.initiate'));
      }
    });

  const verify = () =>
    payment &&
    startTransition(async () => {
      const response = await fetch(`/api/payments/${payment.id}/verify`, {method: 'POST'});
      const result = (await response.json()) as {payment?: PaymentRow};
      if (response.ok && result.payment) {
        setPayment(result.payment);
        toast.success(t('success.credited'));
      } else toast.error(t('errors.verify'));
    });

  const upload = () =>
    payment &&
    proof &&
    startTransition(async () => {
      const form = new FormData();
      form.set('proof', proof);
      const response = await fetch(`/api/payments/${payment.id}/proof`, {
        method: 'POST',
        body: form
      });
      if (response.ok) {
        setPayment({...payment, status: 'under_review'});
        toast.success(t('success.proof'));
      } else toast.error(t('errors.proof'));
    });

  return (
    <div className="payment-topup-layout">
      <section className="payment-methods" aria-label={t('methodLabel')}>
        {methods.map((item) => {
          const Icon = icons[item.code as keyof typeof icons] ?? WalletCards;
          return (
            <button
              key={item.id}
              type="button"
              data-active={selected === item.code || undefined}
              onClick={() => {
                setSelected(item.code);
                setCurrency(item.allowed_currencies[0] ?? defaultCurrency);
                setPayment(null);
              }}
            >
              <span>
                <Icon aria-hidden="true" />
              </span>
              <strong>{text(item.name, locale)}</strong>
              <small>{text(item.description, locale)}</small>
              <Badge tone={item.sandbox_mode ? 'warning' : 'success'}>
                {t(item.sandbox_mode ? 'sandbox' : 'live')}
              </Badge>
            </button>
          );
        })}
      </section>
      <Card className="payment-checkout-card">
        <div className="payment-checkout-heading">
          <div>
            <span className="section-eyebrow">{t('secure')}</span>
            <h2>{method ? text(method.name, locale) : t('choose')}</h2>
          </div>
          {method ? (
            <Badge tone="accent">
              {method.flow === 'proof' ? t('proofFlow') : t('automaticFlow')}
            </Badge>
          ) : null}
        </div>
        {!payment && method ? (
          <>
            <div className="payment-amount-grid">
              <Input
                label={t('amount')}
                type="number"
                min={method.min_amount}
                max={method.max_amount}
                value={amount}
                onChange={(event) => setAmount(Number(event.target.value))}
              />
              <label>
                {t('currency')}
                <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
                  {method.allowed_currencies.map((code) => (
                    <option key={code}>{code}</option>
                  ))}
                </select>
              </label>
            </div>
            {selected === 'crypto' ? (
              <div className="payment-crypto-grid">
                <label>
                  {t('asset')}
                  <select
                    value={asset}
                    onChange={(event) => {
                      const next = event.target.value as typeof asset;
                      setAsset(next);
                      if (next === 'BTC') setNetwork('BITCOIN');
                      else if (next === 'ETH') setNetwork('ERC20');
                      else setNetwork('TRC20');
                    }}
                  >
                    <option>USDT</option>
                    <option>BTC</option>
                    <option>ETH</option>
                  </select>
                </label>
                <label>
                  {t('network')}
                  <select
                    value={network}
                    onChange={(event) => setNetwork(event.target.value as typeof network)}
                    disabled={asset !== 'USDT'}
                  >
                    <option>TRC20</option>
                    <option>ERC20</option>
                    <option>BEP20</option>
                    {asset !== 'USDT' ? <option>BITCOIN</option> : null}
                  </select>
                </label>
              </div>
            ) : null}
            {selected === 'stripe' && savedMethods.length ? (
              <label className="payment-saved-method">
                {t('savedCard')}
                <select
                  value={savedPaymentMethodId}
                  onChange={(event) => setSavedPaymentMethodId(event.target.value)}
                >
                  <option value="">{t('newCard')}</option>
                  {savedMethods.map((saved) => (
                    <option key={saved.id} value={saved.id}>
                      {saved.brand ?? t('card')} {saved.last4 ? `•••• ${saved.last4}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <dl className="payment-total">
              <div>
                <dt>{t('topupAmount')}</dt>
                <dd>{formatMinorUnits(amount, currency, locale)}</dd>
              </div>
              <div>
                <dt>{t('fee')}</dt>
                <dd>{formatMinorUnits(fee, currency, locale)}</dd>
              </div>
              <div>
                <dt>{t('total')}</dt>
                <dd>{formatMinorUnits(amount + fee, currency, locale)}</dd>
              </div>
            </dl>
            <ol className="payment-instructions">
              {lines(method.instructions, locale).map((line, index) => (
                <li key={line}>
                  <span>{index + 1}</span>
                  {line}
                </li>
              ))}
            </ol>
            <Button
              variant="gradient"
              size="lg"
              loading={pending}
              onClick={initiate}
              disabled={amount < method.min_amount || amount > method.max_amount}
            >
              {t('continue')}
            </Button>
          </>
        ) : null}
        {payment ? (
          <div className="payment-active">
            <div className="payment-status">
              <CheckCircle2 aria-hidden="true" />
              <div>
                <span>{t('reference')}</span>
                <strong>{payment.payment_reference ?? payment.provider_payment_id}</strong>
                <small>{t(`statuses.${payment.status}`)}</small>
              </div>
            </div>
            <dl className="payment-total">
              <div>
                <dt>{t('total')}</dt>
                <dd>{formatMinorUnits(payment.payable_amount, payment.currency_code, locale)}</dd>
              </div>
            </dl>
            {payment.status === 'awaiting_proof' ? (
              <div className="payment-proof-upload">
                <label>
                  <UploadCloud aria-hidden="true" />
                  <span>{proof?.name ?? t('proof.choose')}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={(event) => setProof(event.target.files?.[0] ?? null)}
                  />
                </label>
                <Button variant="gradient" loading={pending} disabled={!proof} onClick={upload}>
                  {t('proof.upload')}
                </Button>
              </div>
            ) : null}
            {['requires_action', 'awaiting_payment', 'authorized'].includes(payment.status) ? (
              <Button variant="gradient" loading={pending} onClick={verify}>
                {t('verify')}
              </Button>
            ) : null}
            {payment.status === 'paid' ? (
              <div className="payment-success">
                <CheckCircle2 aria-hidden="true" />
                {t('success.credited')}
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>
      <section className="payment-history">
        <h2>{t('history')}</h2>
        {initialPayments.length ? (
          initialPayments.map((item) => (
            <div key={item.id}>
              <span>
                <strong>{item.provider_code}</strong>
                <small>{item.payment_reference ?? item.id.slice(0, 8)}</small>
              </span>
              <span>
                <b>{formatMinorUnits(item.requested_amount, item.currency_code, locale)}</b>
                <Badge
                  tone={
                    item.status === 'paid'
                      ? 'success'
                      : item.status === 'failed'
                        ? 'danger'
                        : 'warning'
                  }
                >
                  {t(`statuses.${item.status}`)}
                </Badge>
              </span>
            </div>
          ))
        ) : (
          <p>{t('empty')}</p>
        )}
      </section>
    </div>
  );
}
