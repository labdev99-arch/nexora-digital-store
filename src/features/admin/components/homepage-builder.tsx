'use client';

import {GripVertical, Monitor, Plus, Save, Smartphone, Trash2} from 'lucide-react';
import {Reorder} from 'framer-motion';
import {useTranslations} from 'next-intl';
import {useState, type FormEvent} from 'react';
import {toast} from 'sonner';

import {Button} from '@/components/ui/button';
import {Checkbox, Input, Textarea} from '@/components/ui/form-controls';
import {Badge, Card, CardContent, CardHeader, CardTitle} from '@/components/ui/surfaces';
import type {AdminRow} from '../server/admin-data';

const sectionTypes = [
  'hero',
  'banner',
  'product_carousel',
  'categories_grid',
  'testimonials',
  'faq'
] as const;

export function HomepageBuilder({initialSections}: {initialSections: AdminRow[]}) {
  const t = useTranslations('Admin.homepage');
  const [sections, setSections] = useState(initialSections);
  const [selected, setSelected] = useState<AdminRow | 'new' | null>(initialSections[0] ?? null);
  const [preview, setPreview] = useState<'desktop' | 'mobile'>('desktop');
  const [busy, setBusy] = useState(false);

  async function persistOrder(next: AdminRow[]) {
    setSections(next);
    await Promise.all(
      next.map((section, index) =>
        fetch(`/api/admin/resources/homepageSections/${section.id}`, {
          method: 'PATCH',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({sort_order: index * 10})
        })
      )
    );
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const payload = {
      section_type: form.get('section_type'),
      internal_name: form.get('internal_name'),
      content: form.get('content'),
      configuration: form.get('configuration'),
      active: form.get('active') === 'on',
      starts_at: form.get('starts_at') || null,
      ends_at: form.get('ends_at') || null,
      sort_order: selected === 'new' ? sections.length * 10 : selected.sort_order
    };
    setBusy(true);
    try {
      const creating = selected === 'new';
      const response = await fetch(
        creating
          ? '/api/admin/resources/homepageSections'
          : `/api/admin/resources/homepageSections/${selected.id}`,
        {
          method: creating ? 'POST' : 'PATCH',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(payload)
        }
      );
      const result = (await response.json()) as {row?: AdminRow; error?: string};
      if (!response.ok || !result.row) throw new Error(result.error ?? 'save_failed');
      setSections((current) =>
        creating
          ? [...current, result.row as AdminRow]
          : current.map((item) => (item.id === result.row?.id ? result.row : item))
      );
      setSelected(result.row);
      toast.success(t('saved'));
    } catch (error) {
      toast.error(t('saveError'), {
        description: error instanceof Error ? error.message : undefined
      });
    } finally {
      setBusy(false);
    }
  }

  async function remove(section: AdminRow) {
    if (!window.confirm(t('confirmDelete'))) return;
    const response = await fetch(`/api/admin/resources/homepageSections/${section.id}`, {
      method: 'DELETE'
    });
    if (!response.ok) return toast.error(t('saveError'));
    setSections((current) => current.filter((item) => item.id !== section.id));
    setSelected(null);
  }

  const selectedRow = selected === 'new' ? null : selected;
  return (
    <main className="account-page admin-homepage-builder">
      <header className="account-page-heading">
        <div>
          <span className="section-eyebrow">{t('eyebrow')}</span>
          <h1>{t('title')}</h1>
          <p>{t('description')}</p>
        </div>
        <Button variant="gradient" onClick={() => setSelected('new')}>
          <Plus />
          {t('addSection')}
        </Button>
      </header>
      <div className="homepage-builder-grid">
        <Card>
          <CardHeader>
            <CardTitle>{t('sections')}</CardTitle>
            <Badge tone="accent">{sections.length}</Badge>
          </CardHeader>
          <CardContent>
            <Reorder.Group
              axis="y"
              values={sections}
              onReorder={(next) => void persistOrder(next)}
              className="homepage-section-list"
            >
              {sections.map((section) => (
                <Reorder.Item
                  key={section.id}
                  value={section}
                  className={selectedRow?.id === section.id ? 'active' : undefined}
                >
                  <button type="button" onClick={() => setSelected(section)}>
                    <GripVertical />
                    <span>
                      <strong>{String(section.internal_name)}</strong>
                      <small>{t(`types.${String(section.section_type)}`)}</small>
                    </span>
                    <Badge tone={section.active ? 'success' : 'neutral'}>
                      {section.active ? t('active') : t('hidden')}
                    </Badge>
                  </button>
                </Reorder.Item>
              ))}
            </Reorder.Group>
          </CardContent>
        </Card>
        <section className="homepage-editor-column">
          <div className="homepage-preview-toolbar">
            <strong>{t('preview')}</strong>
            <div>
              <Button
                size="icon"
                variant={preview === 'desktop' ? 'default' : 'ghost'}
                onClick={() => setPreview('desktop')}
              >
                <Monitor />
              </Button>
              <Button
                size="icon"
                variant={preview === 'mobile' ? 'default' : 'ghost'}
                onClick={() => setPreview('mobile')}
              >
                <Smartphone />
              </Button>
            </div>
          </div>
          <div className="homepage-preview" data-device={preview}>
            <span>
              {selectedRow ? t(`types.${String(selectedRow.section_type)}`) : t('newSection')}
            </span>
            <h2>{preview === 'desktop' ? t('desktopPreview') : t('mobilePreview')}</h2>
            <p>{t('previewDescription')}</p>
          </div>
          {selected ? (
            <Card>
              <CardHeader>
                <CardTitle>
                  {selected === 'new' ? t('newSection') : String(selected.internal_name)}
                </CardTitle>
                {selectedRow ? (
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => void remove(selectedRow)}
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent>
                <form className="homepage-section-form" onSubmit={save}>
                  <label className="ui-field">
                    <span className="ui-label">{t('type')}</span>
                    <select
                      name="section_type"
                      defaultValue={String(selectedRow?.section_type ?? 'hero')}
                    >
                      {sectionTypes.map((type) => (
                        <option key={type} value={type}>
                          {t(`types.${type}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Input
                    name="internal_name"
                    label={t('internalName')}
                    required
                    defaultValue={String(selectedRow?.internal_name ?? '')}
                  />
                  <Textarea
                    name="content"
                    label={t('localizedContent')}
                    helper={t('localizedHelp')}
                    rows={10}
                    defaultValue={JSON.stringify(
                      selectedRow?.content ?? {en: {title: ''}, ar: {title: ''}},
                      null,
                      2
                    )}
                  />
                  <Textarea
                    name="configuration"
                    label={t('configuration')}
                    rows={5}
                    defaultValue={JSON.stringify(selectedRow?.configuration ?? {}, null, 2)}
                  />
                  <div className="homepage-schedule">
                    <Input name="starts_at" type="datetime-local" label={t('startsAt')} />
                    <Input name="ends_at" type="datetime-local" label={t('endsAt')} />
                  </div>
                  <Checkbox
                    name="active"
                    label={t('active')}
                    defaultChecked={selectedRow ? Boolean(selectedRow.active) : true}
                  />
                  <Button type="submit" variant="gradient" loading={busy}>
                    <Save />
                    {t('save')}
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : null}
        </section>
      </div>
    </main>
  );
}
