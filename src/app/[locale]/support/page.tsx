import {getTranslations, setRequestLocale} from 'next-intl/server';
import {StorefrontShell} from '@/components/layout/storefront-shell';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/surfaces';
import {Link} from '@/i18n/navigation';
import {NewTicketForm} from '@/features/support/components/support-console';
import {getSupportHome} from '@/features/support/server/queries';
export const dynamic = 'force-dynamic';
export default async function SupportPage({params}: {params: Promise<{locale: string}>}) {
  const {locale} = await params;
  setRequestLocale(locale);
  const [{tickets, categories}, t] = await Promise.all([
    getSupportHome(locale),
    getTranslations('Support')
  ]);
  return (
    <StorefrontShell>
      <main className="page-shell support-page">
        <header className="account-page-heading">
          <div>
            <p>{t('eyebrow')}</p>
            <h1>{t('title')}</h1>
            <span>{t('subtitle')}</span>
          </div>
          <Link className="button-like" href="/help">
            {t('knowledgeBase')}
          </Link>
        </header>
        <div className="support-layout">
          <NewTicketForm categories={categories} />
          <section>
            <h2>{t('yourTickets')}</h2>
            <div className="ticket-list">
              {tickets.length ? (
                tickets.map((ticket) => (
                  <Link key={String(ticket.id)} href={`/support/${ticket.id}`}>
                    <Card>
                      <CardHeader>
                        <span>{String(ticket.ticket_number)}</span>
                        <CardTitle>{String(ticket.subject)}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <span className="ticket-status">
                          {t(`statuses.${String(ticket.status)}`)}
                        </span>
                        <time>
                          {new Intl.DateTimeFormat(locale, {dateStyle: 'medium'}).format(
                            new Date(String(ticket.updated_at))
                          )}
                        </time>
                      </CardContent>
                    </Card>
                  </Link>
                ))
              ) : (
                <Card>
                  <CardContent>{t('empty')}</CardContent>
                </Card>
              )}
            </div>
          </section>
        </div>
      </main>
    </StorefrontShell>
  );
}
