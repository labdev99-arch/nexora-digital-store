import {getTranslations, setRequestLocale} from 'next-intl/server';
import {AdminSupportQueue} from '@/features/support/components/admin-support-queue';
import {getAdminSupportQueue} from '@/features/support/server/queries';
export const dynamic = 'force-dynamic';
export default async function AdminSupportPage({params}: {params: Promise<{locale: string}>}) {
  const {locale} = await params;
  setRequestLocale(locale);
  const [tickets, t] = await Promise.all([
    getAdminSupportQueue(locale),
    getTranslations('Support.admin')
  ]);
  return (
    <div className="admin-page">
      <header className="admin-page-heading">
        <div>
          <p>{t('eyebrow')}</p>
          <h1>{t('title')}</h1>
          <span>{t('subtitle')}</span>
        </div>
        <strong>{t('openCount', {count: tickets.length})}</strong>
      </header>
      <AdminSupportQueue
        initialTickets={tickets.map((ticket) => ({...ticket, id: String(ticket.id)}))}
        locale={locale}
      />
    </div>
  );
}
