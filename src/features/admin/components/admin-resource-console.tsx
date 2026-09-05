'use client';

import {
  Archive,
  Download,
  FileSpreadsheet,
  Filter,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Upload
} from 'lucide-react';
import {useTranslations} from 'next-intl';
import {useRef, useState, type FormEvent} from 'react';
import {toast} from 'sonner';

import {Button} from '@/components/ui/button';
import {Checkbox, Input, Textarea} from '@/components/ui/form-controls';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownTrigger
} from '@/components/ui/overlays';
import {Badge, Pagination} from '@/components/ui/surfaces';
import type {AdminResourceDefinition} from '../resource-registry';
import type {AdminRow} from '../server/admin-data';

type DataPage = {rows: AdminRow[]; count: number; page: number; pages: number};

function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function AdminResourceConsole({
  resource,
  initialData,
  canImportExport
}: {
  resource: AdminResourceDefinition;
  initialData: DataPage;
  canImportExport: boolean;
}) {
  const t = useTranslations('Admin.resources');
  const [data, setData] = useState(initialData);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<AdminRow | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load(page = data.page, search = query) {
    setBusy(true);
    try {
      const response = await fetch(
        `/api/admin/resources/${resource.key}?page=${page}&q=${encodeURIComponent(search)}`
      );
      const result = (await response.json()) as DataPage & {error?: string};
      if (!response.ok) throw new Error(result.error ?? 'load_failed');
      setData(result);
      setSelected(new Set());
    } catch (error) {
      toast.error(t('errors.load'), {
        description: error instanceof Error ? error.message : undefined
      });
    } finally {
      setBusy(false);
    }
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {};
    for (const field of resource.fields) {
      const value = form.get(field.key);
      if (field.type === 'boolean') payload[field.key] = value === 'on';
      else if (value !== null) payload[field.key] = value;
    }
    setBusy(true);
    try {
      const creating = editing === 'new';
      const response = await fetch(
        creating
          ? `/api/admin/resources/${resource.key}`
          : `/api/admin/resources/${resource.key}/${editing.id}`,
        {
          method: creating ? 'POST' : 'PATCH',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(payload)
        }
      );
      const result = (await response.json()) as {error?: string};
      if (!response.ok) throw new Error(result.error ?? 'save_failed');
      toast.success(t('saved'));
      setEditing(null);
      await load();
    } catch (error) {
      toast.error(t('errors.save'), {
        description: error instanceof Error ? error.message : undefined
      });
    } finally {
      setBusy(false);
    }
  }

  async function remove(ids: string[]) {
    if (!window.confirm(t('confirmDelete', {count: ids.length}))) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/resources/${resource.key}/bulk`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action: 'delete', ids})
      });
      const result = (await response.json()) as {error?: string};
      if (!response.ok) throw new Error(result.error ?? 'delete_failed');
      toast.success(t('deleted'));
      await load();
    } catch (error) {
      toast.error(t('errors.delete'), {
        description: error instanceof Error ? error.message : undefined
      });
    } finally {
      setBusy(false);
    }
  }

  async function importFile(file: File) {
    const form = new FormData();
    form.set('file', file);
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/resources/${resource.key}/import`, {
        method: 'POST',
        body: form
      });
      const result = (await response.json()) as {
        imported?: number;
        rejected?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? 'import_failed');
      toast.success(
        t('importResult', {imported: result.imported ?? 0, rejected: result.rejected ?? 0})
      );
      await load();
    } catch (error) {
      toast.error(t('errors.import'), {
        description: error instanceof Error ? error.message : undefined
      });
    } finally {
      setBusy(false);
    }
  }

  async function saveFilter() {
    const name = window.prompt(t('filterName'))?.trim();
    if (!name) return;
    const response = await fetch('/api/admin/filters', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({resource: resource.key, name, filters: {q: query}, sort: {}})
    });
    if (response.ok) toast.success(t('filterSaved'));
    else toast.error(t('errors.filter'));
  }

  const allSelected = data.rows.length > 0 && data.rows.every((row) => selected.has(row.id));
  return (
    <main className="account-page admin-resource-page">
      <header className="account-page-heading">
        <div>
          <span className="section-eyebrow">{t(`groups.${resource.group}`)}</span>
          <h1>{t(`names.${resource.key}`)}</h1>
          <p>{t('resourceDescription', {count: data.count})}</p>
        </div>
        <div className="admin-resource-actions">
          {resource.canCreate ? (
            <Button variant="gradient" onClick={() => setEditing('new')}>
              <Plus />
              {t('create')}
            </Button>
          ) : null}
          <Dropdown>
            <DropdownTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreHorizontal />
              </Button>
            </DropdownTrigger>
            <DropdownContent align="end">
              {canImportExport ? (
                <>
                  <DropdownItem
                    onSelect={() =>
                      window.open(
                        `/api/admin/resources/${resource.key}/export?format=csv&q=${encodeURIComponent(query)}`
                      )
                    }
                  >
                    <Download />
                    {t('exportCsv')}
                  </DropdownItem>
                  <DropdownItem
                    onSelect={() =>
                      window.open(
                        `/api/admin/resources/${resource.key}/export?format=xls&q=${encodeURIComponent(query)}`
                      )
                    }
                  >
                    <FileSpreadsheet />
                    {t('exportExcel')}
                  </DropdownItem>
                  {resource.canCreate ? (
                    <DropdownItem onSelect={() => fileRef.current?.click()}>
                      <Upload />
                      {t('import')}
                    </DropdownItem>
                  ) : null}
                </>
              ) : null}
              <DropdownItem onSelect={() => void saveFilter()}>
                <Save />
                {t('saveFilter')}
              </DropdownItem>
            </DropdownContent>
          </Dropdown>
          <input
            ref={fileRef}
            className="sr-only"
            type="file"
            accept=".csv,.xls,text/csv,application/vnd.ms-excel"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importFile(file);
              event.currentTarget.value = '';
            }}
          />
        </div>
      </header>
      <section className="admin-data-toolbar">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void load(1);
          }}
        >
          <Search />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('search')}
          />
          <Button size="sm" type="submit" disabled={busy}>
            <Filter />
            {t('filter')}
          </Button>
        </form>
        <div>
          {selected.size > 0 ? (
            <>
              <span>{t('selected', {count: selected.size})}</span>
              {resource.canDelete ? (
                <Button variant="destructive" size="sm" onClick={() => void remove([...selected])}>
                  <Archive />
                  {t('archive')}
                </Button>
              ) : null}
            </>
          ) : (
            <span>{t('rows', {count: data.count})}</span>
          )}
          <Button variant="ghost" size="icon" onClick={() => void load()} disabled={busy}>
            <RefreshCw />
          </Button>
        </div>
      </section>
      <div className="admin-data-table-wrap">
        <table className="admin-data-table">
          <thead>
            <tr>
              <th>
                <Checkbox
                  label={t('selectAll')}
                  checked={allSelected}
                  onCheckedChange={(checked) =>
                    setSelected(checked ? new Set(data.rows.map((row) => row.id)) : new Set())
                  }
                />
              </th>
              {resource.listColumns.map((column) => (
                <th key={column}>{t.has(`fields.${column}`) ? t(`fields.${column}`) : column}</th>
              ))}
              {resource.canUpdate ? <th>{t('actions')}</th> : null}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Checkbox
                    label={t('selectRow')}
                    checked={selected.has(row.id)}
                    onCheckedChange={(checked) =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (checked) next.add(row.id);
                        else next.delete(row.id);
                        return next;
                      })
                    }
                  />
                </td>
                {resource.listColumns.map((column) => (
                  <td key={column}>
                    {column === 'status' || column === 'active' || column === 'enabled' ? (
                      <Badge
                        tone={
                          ['active', 'paid', 'completed', 'delivered', true].includes(
                            row[column] as string | boolean
                          )
                            ? 'success'
                            : 'neutral'
                        }
                      >
                        {display(row[column])}
                      </Badge>
                    ) : (
                      <span title={display(row[column])}>{display(row[column])}</span>
                    )}
                  </td>
                ))}
                {resource.canUpdate ? (
                  <td>
                    <Button variant="ghost" size="icon" onClick={() => setEditing(row)}>
                      <Pencil />
                    </Button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        {data.rows.length === 0 ? <div className="admin-table-empty">{t('empty')}</div> : null}
      </div>
      <Pagination page={data.page} pages={data.pages} onPageChange={(page) => void load(page)} />
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="admin-resource-dialog">
          <DialogHeader>
            <DialogTitle>
              {editing === 'new'
                ? t('createResource', {resource: t(`names.${resource.key}`)})
                : t('editResource', {resource: t(`names.${resource.key}`)})}
            </DialogTitle>
            <DialogDescription>{t('formDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitForm} className="admin-resource-form">
            {resource.fields.map((field) => (
              <AdminFieldControl
                key={field.key}
                field={field}
                value={editing && editing !== 'new' ? editing[field.key] : undefined}
                label={t.has(`fields.${field.label}`) ? t(`fields.${field.label}`) : field.label}
              />
            ))}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                {t('cancel')}
              </Button>
              <Button type="submit" variant="gradient" loading={busy}>
                {t('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function AdminFieldControl({
  field,
  value,
  label
}: {
  field: AdminResourceDefinition['fields'][number];
  value: unknown;
  label: string;
}) {
  if (field.type === 'boolean')
    return <Checkbox name={field.key} label={label} defaultChecked={Boolean(value)} />;
  if (field.type === 'json')
    return (
      <Textarea
        name={field.key}
        label={label}
        required={field.required}
        defaultValue={value === undefined ? '' : JSON.stringify(value, null, 2)}
        rows={5}
      />
    );
  if (field.type === 'select')
    return (
      <label className="ui-field">
        <span className="ui-label">{label}</span>
        <select
          name={field.key}
          defaultValue={display(value) === '—' ? '' : display(value)}
          required={field.required}
        >
          <option value="" />
          {field.options?.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </label>
    );
  return (
    <Input
      name={field.key}
      label={label}
      required={field.required}
      type={
        field.type === 'number' ? 'number' : field.type === 'datetime' ? 'datetime-local' : 'text'
      }
      defaultValue={value === null || value === undefined ? '' : display(value)}
    />
  );
}
