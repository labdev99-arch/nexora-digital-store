import {notFound} from 'next/navigation';
import {setRequestLocale} from 'next-intl/server';
import {StorefrontShell} from '@/components/layout/storefront-shell';
import {TicketConversation} from '@/features/support/components/support-console';
import {getTicket} from '@/features/support/server/queries';
export const dynamic = 'force-dynamic';
export default async function TicketPage({
  params
}: {
  params: Promise<{locale: string; id: string}>;
}) {
  const {locale, id} = await params;
  setRequestLocale(locale);
  const data = await getTicket(locale, id);
  if (!data) notFound();
  return (
    <StorefrontShell>
      <main className="page-shell support-page">
        <TicketConversation
          ticket={data.ticket}
          initialMessages={data.messages}
          attachments={data.attachments}
          staff={false}
        />
      </main>
    </StorefrontShell>
  );
}
