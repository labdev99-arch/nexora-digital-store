'use client';

import {CheckCircle2, Clock3, PackageCheck, RefreshCw, ServerCrash, Upload} from 'lucide-react';
import {useLocale, useTranslations} from 'next-intl';
import {useRouter} from 'next/navigation';
import {useState, useTransition} from 'react';
import {toast} from 'sonner';

import {Button} from '@/components/ui/button';
import {CountdownTimer} from '@/components/ui/advanced';
import {Badge, Card, EmptyState} from '@/components/ui/surfaces';
import type {
  FulfillmentJobDbRow,
  ManualFulfillmentTaskDbRow,
  SupplierDbRow
} from '@/lib/supabase/database.types';
import {formatMinorUnits} from '@/lib/money';

type VariantStock = {
  id: string;
  sku: string;
  name: unknown;
  stock: {available: number; assigned: number};
};
type Reliability = {
  id: string;
  reliability_bps: number;
  tracked_cost_amount: number;
  currency_code: string;
};
type Performance = {
  profile_id: string;
  completed_tasks: number;
  sla_breaches: number;
  average_completion_seconds: number;
};

export function FulfillmentConsole({
  jobs,
  deadLetterCount,
  tasks,
  suppliers,
  variants,
  reliability,
  performance
}: {
  jobs: FulfillmentJobDbRow[];
  deadLetterCount: number;
  tasks: ManualFulfillmentTaskDbRow[];
  suppliers: SupplierDbRow[];
  variants: VariantStock[];
  reliability: Reliability[];
  performance: Performance[];
}) {
  const t = useTranslations('FulfillmentAdmin');
  const queued = jobs.filter((job) =>
    ['pending', 'retrying', 'running'].includes(job.status)
  ).length;
  return (
    <div className="fulfillment-console">
      <section className="fulfillment-stats" aria-label={t('statusSummary')}>
        <Card>
          <Clock3 />
          <span>{t('queuedJobs')}</span>
          <strong>{queued}</strong>
        </Card>
        <Card>
          <PackageCheck />
          <span>{t('manualQueue')}</span>
          <strong>
            {tasks.filter((task) => !['completed', 'cancelled'].includes(task.status)).length}
          </strong>
        </Card>
        <Card>
          <ServerCrash />
          <span>{t('deadLetters')}</span>
          <strong>{deadLetterCount}</strong>
        </Card>
        <Card>
          <CheckCircle2 />
          <span>{t('healthySuppliers')}</span>
          <strong>
            {suppliers.filter((supplier) => supplier.health_status === 'healthy').length}
          </strong>
        </Card>
      </section>
      <div className="fulfillment-grid">
        <StockImporter variants={variants} />
        <SupplierHealth suppliers={suppliers} reliability={reliability} />
      </div>
      <ManualQueue tasks={tasks} performance={performance} />
      <JobTable jobs={jobs} />
    </div>
  );
}

function StockImporter({variants}: {variants: VariantStock[]}) {
  const t = useTranslations('FulfillmentAdmin');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [variantId, setVariantId] = useState(variants[0]?.id ?? '');
  const submit = (form: HTMLFormElement) =>
    startTransition(async () => {
      const body = new FormData(form);
      body.set('variantId', variantId);
      const response = await fetch('/api/admin/fulfillment/stock/import', {method: 'POST', body});
      const result = (await response.json()) as {imported?: number; error?: string};
      if (!response.ok) {
        toast.error(result.error ?? t('importFailed'));
        return;
      }
      toast.success(t('imported', {count: result.imported ?? 0}));
      form.reset();
      router.refresh();
    });
  return (
    <Card className="fulfillment-panel">
      <div className="fulfillment-panel-heading">
        <div>
          <span className="section-eyebrow">{t('inventoryEyebrow')}</span>
          <h2>{t('inventoryTitle')}</h2>
        </div>
        <Upload />
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(event.currentTarget);
        }}
      >
        <label>
          {t('variant')}
          <select value={variantId} onChange={(event) => setVariantId(event.target.value)} required>
            {variants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.sku} · {variant.stock.available} {t('available')}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('csvFile')}
          <input name="file" type="file" accept=".csv,text/csv" required />
        </label>
        <p>{t('csvHelp')}</p>
        <Button type="submit" variant="gradient" loading={pending} disabled={!variantId}>
          <Upload />
          {t('importCodes')}
        </Button>
      </form>
    </Card>
  );
}

function SupplierHealth({
  suppliers,
  reliability
}: {
  suppliers: SupplierDbRow[];
  reliability: Reliability[];
}) {
  const t = useTranslations('FulfillmentAdmin');
  const locale = useLocale() as 'ar' | 'en';
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const saveSupplier = (form: HTMLFormElement) =>
    startTransition(async () => {
      const data = new FormData(form);
      const driver = String(data.get('driver'));
      const response = await fetch('/api/admin/fulfillment/suppliers', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
          code: data.get('code'),
          name: data.get('name'),
          driver,
          endpoint: data.get('endpoint'),
          apiKey: data.get('apiKey') || null,
          currencyCode: data.get('currencyCode'),
          marginBps: Number(data.get('marginBps')),
          priority: Number(data.get('priority')),
          enabled: true,
          sandboxMode: driver === 'mock'
        })
      });
      if (!response.ok) {
        toast.error(t('supplierSaveFailed'));
        return;
      }
      toast.success(t('supplierSaved'));
      form.reset();
      router.refresh();
    });
  return (
    <Card className="fulfillment-panel">
      <div className="fulfillment-panel-heading">
        <div>
          <span className="section-eyebrow">{t('routingEyebrow')}</span>
          <h2>{t('suppliersTitle')}</h2>
        </div>
        <RefreshCw />
      </div>
      <div className="supplier-health-list">
        {suppliers.map((supplier) => {
          const score =
            reliability.find((item) => item.id === supplier.id)?.reliability_bps ?? 10000;
          return (
            <div key={supplier.id}>
              <div>
                <strong>{supplier.name}</strong>
                <small>
                  {supplier.driver} · {t('priority', {value: supplier.priority})}
                </small>
              </div>
              <div>
                <Badge
                  tone={
                    supplier.health_status === 'healthy'
                      ? 'success'
                      : supplier.health_status === 'open'
                        ? 'danger'
                        : 'warning'
                  }
                >
                  {t(`health.${supplier.health_status}`)}
                </Badge>
                <b>{(score / 100).toFixed(1)}%</b>
                <small>
                  {formatMinorUnits(
                    reliability.find((item) => item.id === supplier.id)?.tracked_cost_amount ?? 0,
                    supplier.currency_code,
                    locale
                  )}
                </small>
              </div>
            </div>
          );
        })}
        {!suppliers.length ? (
          <EmptyState title={t('noSuppliers')} description={t('noSuppliersDescription')} />
        ) : null}
      </div>
      <details className="supplier-config-details">
        <summary>{t('configureSupplier')}</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            saveSupplier(event.currentTarget);
          }}
        >
          <label>
            {t('supplierCode')}
            <input name="code" pattern="[a-z][a-z0-9_-]{2,47}" required />
          </label>
          <label>
            {t('supplierName')}
            <input name="name" required />
          </label>
          <label>
            {t('driver')}
            <select name="driver">
              <option value="mock">{t('drivers.mock')}</option>
              <option value="smm_panel">{t('drivers.smm')}</option>
              <option value="reseller_api">{t('drivers.reseller')}</option>
            </select>
          </label>
          <label>
            {t('endpoint')}
            <input name="endpoint" placeholder="mock://instant" required />
          </label>
          <label>
            {t('apiKey')}
            <input name="apiKey" type="password" autoComplete="new-password" />
          </label>
          <label>
            {t('currency')}
            <input name="currencyCode" defaultValue="USD" pattern="[A-Z]{3}" required />
          </label>
          <label>
            {t('marginBps')}
            <input
              name="marginBps"
              type="number"
              defaultValue="0"
              min="-10000"
              max="100000"
              required
            />
          </label>
          <label>
            {t('supplierPriority')}
            <input name="priority" type="number" defaultValue="100" min="0" max="1000" required />
          </label>
          <Button variant="gradient" loading={pending}>
            {t('saveSupplier')}
          </Button>
        </form>
      </details>
    </Card>
  );
}

function ManualQueue({
  tasks,
  performance
}: {
  tasks: ManualFulfillmentTaskDbRow[];
  performance: Performance[];
}) {
  const t = useTranslations('FulfillmentAdmin');
  const router = useRouter();
  const [working, setWorking] = useState<string | null>(null);
  const claim = async (id: string) => {
    setWorking(id);
    const response = await fetch(`/api/admin/fulfillment/tasks/${id}/claim`, {method: 'POST'});
    setWorking(null);
    if (!response.ok) return toast.error(t('claimFailed'));
    toast.success(t('claimed'));
    router.refresh();
  };
  const deliver = async (id: string, form: HTMLFormElement) => {
    setWorking(id);
    const data = new FormData(form);
    const response = await fetch(`/api/admin/fulfillment/tasks/${id}/deliver`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        kind: data.get('kind'),
        payload: data.get('payload'),
        displayHint: data.get('displayHint'),
        quantity: Number(data.get('quantity'))
      })
    });
    setWorking(null);
    if (!response.ok) return toast.error(t('deliveryFailed'));
    toast.success(t('delivered'));
    router.refresh();
  };
  const active = tasks.filter((task) => !['completed', 'cancelled'].includes(task.status));
  return (
    <Card className="fulfillment-panel fulfillment-manual-panel">
      <div className="fulfillment-panel-heading">
        <div>
          <span className="section-eyebrow">{t('operationsEyebrow')}</span>
          <h2>{t('manualTitle')}</h2>
        </div>
        <Badge tone="info">{active.length}</Badge>
      </div>
      {performance.length ? (
        <div className="fulfiller-performance">
          {performance.map((member) => (
            <div key={member.profile_id}>
              <strong>{member.profile_id.slice(0, 8)}</strong>
              <span>{t('completedTasks', {count: member.completed_tasks})}</span>
              <small>
                {t('slaBreaches', {count: member.sla_breaches})} ·{' '}
                {t('averageSeconds', {value: Math.round(member.average_completion_seconds)})}
              </small>
            </div>
          ))}
        </div>
      ) : null}
      {!active.length ? (
        <EmptyState title={t('manualEmpty')} description={t('manualEmptyDescription')} />
      ) : (
        <div className="manual-task-list">
          {active.map((task) => (
            <article key={task.id}>
              <div>
                <Badge
                  tone={
                    task.priority === 'vip' || task.priority === 'urgent' ? 'warning' : 'neutral'
                  }
                >
                  {t(`priorityLabels.${task.priority}`)}
                </Badge>
                <strong>{task.order_id.slice(0, 8)}</strong>
                <small>{t('slaCountdown')}</small>
                <CountdownTimer target={new Date(task.sla_due_at)} compact />
              </div>
              {task.status === 'queued' || task.status === 'sla_breached' ? (
                <Button size="sm" loading={working === task.id} onClick={() => claim(task.id)}>
                  {t('claim')}
                </Button>
              ) : (
                <div className="manual-task-actions">
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void deliver(task.id, event.currentTarget);
                    }}
                  >
                    <select name="kind" aria-label={t('deliveryKind')}>
                      <option value="code">{t('kinds.code')}</option>
                      <option value="text">{t('kinds.text')}</option>
                      <option value="link">{t('kinds.link')}</option>
                    </select>
                    <input name="payload" required placeholder={t('payload')} />
                    <input name="displayHint" placeholder={t('displayHint')} />
                    <input
                      name="quantity"
                      type="number"
                      min="1"
                      defaultValue="1"
                      aria-label={t('quantity')}
                    />
                    <Button size="sm" variant="gradient" loading={working === task.id}>
                      {t('deliver')}
                    </Button>
                  </form>
                  <InternalNoteForm taskId={task.id} onSaved={() => router.refresh()} />
                  <ManualFileDelivery taskId={task.id} onSaved={() => router.refresh()} />
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </Card>
  );
}

function InternalNoteForm({taskId, onSaved}: {taskId: string; onSaved: () => void}) {
  const t = useTranslations('FulfillmentAdmin');
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="manual-note-form"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const body = String(new FormData(form).get('body') ?? '');
        startTransition(async () => {
          const response = await fetch(`/api/admin/fulfillment/tasks/${taskId}/notes`, {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify({body})
          });
          if (!response.ok) {
            toast.error(t('noteFailed'));
            return;
          }
          toast.success(t('noteSaved'));
          form.reset();
          onSaved();
        });
      }}
    >
      <input name="body" required placeholder={t('internalNote')} />
      <Button size="sm" variant="outline" loading={pending}>
        {t('addNote')}
      </Button>
    </form>
  );
}

function ManualFileDelivery({taskId, onSaved}: {taskId: string; onSaved: () => void}) {
  const t = useTranslations('FulfillmentAdmin');
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="manual-file-form"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        startTransition(async () => {
          const response = await fetch(`/api/admin/fulfillment/tasks/${taskId}/deliver-file`, {
            method: 'POST',
            body: new FormData(form)
          });
          if (!response.ok) {
            toast.error(t('fileDeliveryFailed'));
            return;
          }
          toast.success(t('delivered'));
          form.reset();
          onSaved();
        });
      }}
    >
      <input name="file" type="file" required aria-label={t('deliveryFile')} />
      <input name="quantity" type="number" min="1" defaultValue="1" aria-label={t('quantity')} />
      <Button size="sm" variant="outline" loading={pending}>
        {t('deliverFile')}
      </Button>
    </form>
  );
}

function JobTable({jobs}: {jobs: FulfillmentJobDbRow[]}) {
  const t = useTranslations('FulfillmentAdmin');
  return (
    <Card className="fulfillment-panel">
      <div className="fulfillment-panel-heading">
        <div>
          <span className="section-eyebrow">{t('queueEyebrow')}</span>
          <h2>{t('jobsTitle')}</h2>
        </div>
      </div>
      <div className="fulfillment-table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('job')}</th>
              <th>{t('status')}</th>
              <th>{t('attempts')}</th>
              <th>{t('nextRun')}</th>
              <th>{t('lastError')}</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td>
                  <strong>{job.kind}</strong>
                  <small>{job.aggregate_id.slice(0, 8)}</small>
                </td>
                <td>
                  <Badge
                    tone={
                      job.status === 'completed'
                        ? 'success'
                        : job.status === 'dead_letter'
                          ? 'danger'
                          : job.status === 'running'
                            ? 'info'
                            : 'warning'
                    }
                  >
                    {t(`jobStatus.${job.status}`)}
                  </Badge>
                </td>
                <td>
                  {job.attempt_count}/{job.max_attempts}
                </td>
                <td>
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'short',
                    timeStyle: 'short'
                  }).format(new Date(job.run_at))}
                </td>
                <td>{job.last_error_safe ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
