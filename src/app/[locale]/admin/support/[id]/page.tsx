import {notFound} from 'next/navigation';
import {setRequestLocale} from 'next-intl/server';
import {TicketConversation} from '@/features/support/components/support-console';
import {getTicket} from '@/features/support/server/queries';
export const dynamic = 'force-dynamic';
export default async function StaffTicketPage({
  params
}: {
  params: Promise<{locale: string; id: string}>;
}) {
  const {locale, id} = await params;
  setRequestLocale(locale);
  const data = await getTicket(locale, id, true);
  if (!data) notFound();
  return (
    <div className="admin-page">
      <TicketConversation
        ticket={data.ticket}
        initialMessages={data.messages}
        attachments={data.attachments}
        cannedReplies={data.cannedReplies}
        staff
      />
    </div>
  );
}
