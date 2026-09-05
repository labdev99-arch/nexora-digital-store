'use client';

import {Eye, Mail, Plus, Save, Variable} from 'lucide-react';
import {useTranslations} from 'next-intl';
import {useMemo, useState, type FormEvent} from 'react';
import {toast} from 'sonner';

import {Button} from '@/components/ui/button';
import {Checkbox, Input, Textarea} from '@/components/ui/form-controls';
import {Badge, Card, CardContent, CardHeader, CardTitle} from '@/components/ui/surfaces';
import type {AdminRow} from '../server/admin-data';

function variablesOf(row: AdminRow | null): string[] {
  return Array.isArray(row?.variables)
    ? row.variables.filter((value): value is string => typeof value === 'string')
    : [];
}

function previewText(source: string, variables: string[]): string {
  return variables.reduce(
    (text, variable) => text.replaceAll(`{{${variable}}}`, `[${variable}]`),
    source
  );
}

export function TemplateEditor({
  initialTemplates,
  locales
}: {
  initialTemplates: AdminRow[];
  locales: Array<{code: string; native_name: string}>;
}) {
  const t = useTranslations('Admin.templates');
  const [templates, setTemplates] = useState(initialTemplates);
  const [selected, setSelected] = useState<AdminRow | 'new' | null>(initialTemplates[0] ?? 'new');
  const [busy, setBusy] = useState(false);
  const row = selected === 'new' ? null : selected;
  const variables = variablesOf(row);
  const [draftBody, setDraftBody] = useState(String(row?.body ?? ''));
  const [draftSubject, setDraftSubject] = useState(String(row?.subject ?? ''));
  const preview = useMemo(
    () => ({
      subject: previewText(draftSubject, variables),
      body: previewText(draftBody, variables)
    }),
    [draftBody, draftSubject, variables]
  );

  function choose(next: AdminRow | 'new') {
    setSelected(next);
    const nextRow = next === 'new' ? null : next;
    setDraftBody(String(nextRow?.body ?? ''));
    setDraftSubject(String(nextRow?.subject ?? ''));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      template_key: form.get('template_key'),
      channel: form.get('channel'),
      locale_code: form.get('locale_code'),
      subject: draftSubject || null,
      body: draftBody,
      variables: form.get('variables'),
      active: form.get('active') === 'on',
      version: row ? Number(row.version ?? 1) + 1 : 1
    };
    setBusy(true);
    try {
      const response = await fetch(
        row
          ? `/api/admin/resources/notificationTemplates/${row.id}`
          : '/api/admin/resources/notificationTemplates',
        {
          method: row ? 'PATCH' : 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(payload)
        }
      );
      const result = (await response.json()) as {row?: AdminRow; error?: string};
      if (!response.ok || !result.row) throw new Error(result.error ?? 'save_failed');
      setTemplates((current) =>
        row
          ? current.map((item) => (item.id === result.row?.id ? result.row : item))
          : [...current, result.row as AdminRow]
      );
      choose(result.row);
      toast.success(t('saved'));
    } catch (error) {
      toast.error(t('saveError'), {
        description: error instanceof Error ? error.message : undefined
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="account-page admin-template-page">
      <header className="account-page-heading">
        <div>
          <span className="section-eyebrow">{t('eyebrow')}</span>
          <h1>{t('title')}</h1>
          <p>{t('description')}</p>
        </div>
        <Button variant="gradient" onClick={() => choose('new')}>
          <Plus />
          {t('newTemplate')}
        </Button>
      </header>
      <div className="template-editor-grid">
        <Card>
          <CardHeader>
            <CardTitle>{t('templates')}</CardTitle>
            <Badge tone="accent">{templates.length}</Badge>
          </CardHeader>
          <CardContent className="template-list">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                className={row?.id === template.id ? 'active' : undefined}
                onClick={() => choose(template)}
              >
                <Mail />
                <span>
                  <strong>{String(template.template_key)}</strong>
                  <small>
                    {String(template.channel)} · {String(template.locale_code)}
                  </small>
                </span>
                <Badge tone={template.active ? 'success' : 'neutral'}>
                  v{String(template.version)}
                </Badge>
              </button>
            ))}
          </CardContent>
        </Card>
        <section>
          <Card>
            <CardHeader>
              <CardTitle>{row ? String(row.template_key) : t('newTemplate')}</CardTitle>
              <Variable />
            </CardHeader>
            <CardContent>
              <form className="template-form" onSubmit={save}>
                <div className="template-form-row">
                  <Input
                    name="template_key"
                    label={t('templateKey')}
                    required
                    defaultValue={String(row?.template_key ?? '')}
                  />
                  <label className="ui-field">
                    <span className="ui-label">{t('channel')}</span>
                    <select name="channel" defaultValue={String(row?.channel ?? 'email')}>
                      {['email', 'whatsapp', 'telegram', 'push', 'in_app'].map((channel) => (
                        <option key={channel}>{channel}</option>
                      ))}
                    </select>
                  </label>
                  <label className="ui-field">
                    <span className="ui-label">{t('locale')}</span>
                    <select
                      name="locale_code"
                      defaultValue={String(row?.locale_code ?? locales[0]?.code ?? 'en')}
                    >
                      {locales.map((locale) => (
                        <option key={locale.code} value={locale.code}>
                          {locale.native_name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <Input
                  label={t('subject')}
                  value={draftSubject}
                  onChange={(event) => setDraftSubject(event.target.value)}
                />
                <Textarea
                  label={t('body')}
                  required
                  rows={12}
                  value={draftBody}
                  onChange={(event) => setDraftBody(event.target.value)}
                />
                <Textarea
                  name="variables"
                  label={t('variables')}
                  helper={t('variablesHelp')}
                  rows={3}
                  defaultValue={JSON.stringify(
                    row?.variables ?? ['customer_name', 'order_number'],
                    null,
                    2
                  )}
                />
                <Checkbox
                  name="active"
                  label={t('active')}
                  defaultChecked={row ? Boolean(row.active) : true}
                />
                <Button type="submit" variant="gradient" loading={busy}>
                  <Save />
                  {t('save')}
                </Button>
              </form>
            </CardContent>
          </Card>
          <Card className="template-preview">
            <CardHeader>
              <CardTitle>
                <Eye />
                {t('preview')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span>{preview.subject || t('noSubject')}</span>
              <div>{preview.body || t('noBody')}</div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
