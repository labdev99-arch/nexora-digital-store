'use client';

import {AlertTriangle, Check, FileSearch, Save, X} from 'lucide-react';
import {useLocale, useTranslations} from 'next-intl';
import Image from 'next/image';
import {useState, useTransition} from 'react';
import {toast} from 'sonner';

import {Button} from '@/components/ui/button';
import {Badge, Card, EmptyState} from '@/components/ui/surfaces';
import {formatMinorUnits} from '@/lib/money';
import {reviewPaymentProofAction, updatePaymentMethodAction} from '../server/actions';
import type {PaymentMethodRow} from '../types';

type QueueData = Awaited<
  ReturnType<typeof import('../server/queries').getPaymentVerificationQueue>
>[number];

export function AdminPaymentQueue({items}: {items: QueueData[]}) {
  const t = useTranslations('PaymentAdmin');
  if (!items.length)
    return <EmptyState title={t('empty.title')} description={t('empty.description')} />;
  return (
    <div className="payment-review-list">
      {items.map((item) => (
        <PaymentReview key={item.queue.id} item={item} />
      ))}
    </div>
  );
}

function PaymentReview({item}: {item: QueueData}) {
  const locale = useLocale() as 'ar' | 'en';
  const t = useTranslations('PaymentAdmin');
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();
  const review = (approve: boolean) =>
    startTransition(async () => {
      const result = await reviewPaymentProofAction(locale, {
        queueId: item.queue.id,
        approve,
        reason
      });
      if (result.ok) toast.success(t(approve ? 'approved' : 'rejected'));
      else toast.error(t('failed'));
    });
  if (!item.payment || !item.proof) return null;
  return (
    <Card className="payment-review-card">
      <div className="payment-proof-preview">
        {item.proof.mime_type === 'application/pdf' ? (
          <a href={item.proofUrl ?? '#'} target="_blank" rel="noreferrer">
            <FileSearch />
            {t('openPdf')}
          </a>
        ) : item.proofUrl ? (
          <Image src={item.proofUrl} alt={t('proofAlt')} fill unoptimized />
        ) : null}
      </div>
      <div className="payment-review-detail">
        <div className="payment-review-heading">
          <div>
            <span className="section-eyebrow">{item.payment.provider_code}</span>
            <h2>{item.payment.payment_reference}</h2>
          </div>
          <Badge tone="warning">{t('needsReview')}</Badge>
        </div>
        <dl>
          <div>
            <dt>{t('expected')}</dt>
            <dd>
              {formatMinorUnits(item.payment.payable_amount, item.payment.currency_code, locale)}
            </dd>
          </div>
          <div>
            <dt>{t('ocrAmount')}</dt>
            <dd>
              {item.check?.extracted_amount
                ? formatMinorUnits(item.check.extracted_amount, item.payment.currency_code, locale)
                : t('notDetected')}
            </dd>
          </div>
          <div>
            <dt>{t('ocrReference')}</dt>
            <dd>{item.check?.extracted_reference ?? t('notDetected')}</dd>
          </div>
          <div>
            <dt>{t('ocrDate')}</dt>
            <dd>{item.check?.extracted_date ?? t('notDetected')}</dd>
          </div>
        </dl>
        {item.check?.flags.length ? (
          <div className="payment-review-flags">
            <AlertTriangle />
            {item.check.flags.map((flag) => (
              <Badge tone="danger" key={flag}>
                {t(`flags.${flag}`)}
              </Badge>
            ))}
          </div>
        ) : (
          <Badge tone="success">
            <Check />
            {t('ocrClear')}
          </Badge>
        )}
        <label>
          {t('reason')}
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t('reasonPlaceholder')}
          />
        </label>
        <div className="payment-review-actions">
          <Button
            variant="destructive"
            disabled={reason.trim().length < 3}
            loading={pending}
            onClick={() => review(false)}
          >
            <X />
            {t('reject')}
          </Button>
          <Button
            variant="gradient"
            disabled={reason.trim().length < 3}
            loading={pending}
            onClick={() => review(true)}
          >
            <Check />
            {t('approve')}
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function PaymentMethodsAdmin({methods}: {methods: PaymentMethodRow[]}) {
  return (
    <div className="payment-method-admin-grid">
      {methods.map((method) => (
        <MethodEditor key={method.id} method={method} />
      ))}
    </div>
  );
}

function MethodEditor({method}: {method: PaymentMethodRow}) {
  const locale = useLocale() as 'ar' | 'en';
  const t = useTranslations('PaymentAdmin');
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState({
    enabled: method.enabled,
    sandboxMode: method.sandbox_mode,
    minAmount: method.min_amount,
    maxAmount: method.max_amount,
    feeFixed: method.fee_fixed,
    feeBps: method.fee_bps,
    currencies: method.allowed_currencies.join(','),
    countries: method.allowed_countries.join(','),
    tiers: method.allowed_tiers.join(',')
  });
  const save = () =>
    startTransition(async () => {
      const instructions = Object.fromEntries(
        Object.entries(
          method.instructions &&
            typeof method.instructions === 'object' &&
            !Array.isArray(method.instructions)
            ? method.instructions
            : {}
        ).filter(
          (entry): entry is [string, string[]] =>
            Array.isArray(entry[1]) && entry[1].every((value) => typeof value === 'string')
        )
      );
      const result = await updatePaymentMethodAction(locale, {
        id: method.id,
        enabled: state.enabled,
        sandboxMode: state.sandboxMode,
        minAmount: state.minAmount,
        maxAmount: state.maxAmount,
        feeFixed: state.feeFixed,
        feeBps: state.feeBps,
        allowedCurrencies: state.currencies
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
        allowedCountries: state.countries
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
        allowedTiers: state.tiers
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
        instructions
      });
      if (result.ok) toast.success(t('saved'));
      else toast.error(t('failed'));
    });
  return (
    <Card className="payment-method-admin">
      <div>
        <div>
          <span className="section-eyebrow">{method.driver}</span>
          <h2>{method.code}</h2>
        </div>
        <Badge tone={state.enabled ? 'success' : 'danger'}>
          {t(state.enabled ? 'enabled' : 'disabled')}
        </Badge>
      </div>
      <div className="payment-method-toggles">
        <label>
          <input
            type="checkbox"
            checked={state.enabled}
            onChange={(e) => setState({...state, enabled: e.target.checked})}
          />
          {t('enabled')}
        </label>
        <label>
          <input
            type="checkbox"
            checked={state.sandboxMode}
            onChange={(e) => setState({...state, sandboxMode: e.target.checked})}
          />
          {t('sandbox')}
        </label>
      </div>
      <div className="payment-method-fields">
        <label>
          {t('min')}
          <input
            type="number"
            value={state.minAmount}
            onChange={(e) => setState({...state, minAmount: Number(e.target.value)})}
          />
        </label>
        <label>
          {t('max')}
          <input
            type="number"
            value={state.maxAmount}
            onChange={(e) => setState({...state, maxAmount: Number(e.target.value)})}
          />
        </label>
        <label>
          {t('fixedFee')}
          <input
            type="number"
            value={state.feeFixed}
            onChange={(e) => setState({...state, feeFixed: Number(e.target.value)})}
          />
        </label>
        <label>
          {t('percentFee')}
          <input
            type="number"
            value={state.feeBps}
            onChange={(e) => setState({...state, feeBps: Number(e.target.value)})}
          />
        </label>
        <label>
          {t('currencies')}
          <input
            value={state.currencies}
            onChange={(e) => setState({...state, currencies: e.target.value.toUpperCase()})}
          />
        </label>
        <label>
          {t('countries')}
          <input
            value={state.countries}
            onChange={(e) => setState({...state, countries: e.target.value.toUpperCase()})}
          />
        </label>
        <label>
          {t('tiers')}
          <input
            value={state.tiers}
            onChange={(e) => setState({...state, tiers: e.target.value})}
          />
        </label>
      </div>
      <Button variant="gradient" loading={pending} onClick={save}>
        <Save />
        {t('save')}
      </Button>
    </Card>
  );
}
