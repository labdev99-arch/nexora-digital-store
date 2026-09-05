'use client';

import {useEffect, useState} from 'react';

import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/surfaces';
import {Link} from '@/i18n/navigation';
import {createClient} from '@/lib/supabase/client';

type Ticket = Record<string, unknown> & {id: string};

export function AdminSupportQueue({
  initialTickets,
  locale
}: {
  initialTickets: Ticket[];
  locale: string;
}) {
  const [tickets, setTickets] = useState(initialTickets);
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('admin-support-queue')
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'support_tickets'},
        (payload) => {
          const row = (payload.new ?? payload.old) as Ticket;
          setTickets((current) => {
            const without = current.filter((ticket) => ticket.id !== row.id);
            return ['open', 'in_progress', 'waiting_customer'].includes(String(row.status))
              ? [row, ...without]
              : without;
          });
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="admin-ticket-queue" aria-live="polite">
      {tickets.map((ticket) => (
        <Link key={ticket.id} href={`/admin/support/${ticket.id}`}>
          <Card>
            <CardHeader>
              <span>{String(ticket.ticket_number)}</span>
              <CardTitle>{String(ticket.subject)}</CardTitle>
            </CardHeader>
            <CardContent>
              <span className="ticket-status">{String(ticket.status)}</span>
              <span>{String(ticket.priority)}</span>
              <time>
                {new Intl.DateTimeFormat(locale, {
                  dateStyle: 'medium',
                  timeStyle: 'short'
                }).format(new Date(String(ticket.sla_due_at)))}
              </time>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
