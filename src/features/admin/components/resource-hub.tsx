import {ArrowUpRight, Boxes} from 'lucide-react';
import {getTranslations} from 'next-intl/server';

import type {Permission} from '@/features/auth/server/permissions';
import {Link} from '@/i18n/navigation';
import {adminResourceKeys, adminResources} from '../resource-registry';

export async function AdminResourceHub({permissions}: {permissions: readonly Permission[]}) {
  const t = await getTranslations('Admin.resources');
  const visible = adminResourceKeys.filter((key) =>
    permissions.includes(adminResources[key].permission)
  );
  return (
    <main className="account-page admin-resource-hub">
      <header className="account-page-heading">
        <div>
          <span className="section-eyebrow">{t('eyebrow')}</span>
          <h1>{t('title')}</h1>
          <p>{t('description')}</p>
        </div>
      </header>
      <section className="admin-resource-grid">
        {visible.map((key) => (
          <Link key={key} href={`/admin/resources/${key}`}>
            <span>
              <Boxes />
            </span>
            <div>
              <strong>{t(`names.${key}`)}</strong>
              <small>{t(`groups.${adminResources[key].group}`)}</small>
            </div>
            <ArrowUpRight />
          </Link>
        ))}
      </section>
    </main>
  );
}
