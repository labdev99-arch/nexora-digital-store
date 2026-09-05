import 'server-only';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {requirePermission, requireUser} from '@/features/auth/server/authorization';

export async function getSupportHome(locale: string) {
  const context = await requireUser(locale);
  const supabase = await createClient();
  const [{data: tickets}, {data: categories}] = await Promise.all([
    supabase
      .from('support_tickets')
      .select('*')
      .eq('profile_id', context.user.id)
      .is('deleted_at', null)
      .order('created_at', {ascending: false}),
    supabase
      .from('support_ticket_categories')
      .select('*')
      .eq('active', true)
      .is('deleted_at', null)
      .order('sort_order')
  ]);
  return {tickets: tickets ?? [], categories: categories ?? []};
}
export async function getTicket(locale: string, id: string, staff = false) {
  const context = staff
    ? await requirePermission(locale, 'support.manage')
    : await requireUser(locale);
  const supabase = await createClient();
  let query = supabase.from('support_tickets').select('*').eq('id', id).is('deleted_at', null);
  if (!staff) query = query.eq('profile_id', context.user.id);
  const {data: ticket} = await query.maybeSingle();
  if (!ticket) return null;
  const [{data: messages}, {data: attachments}, {data: cannedReplies}] = await Promise.all([
    supabase
      .from('support_ticket_messages')
      .select('*')
      .eq('ticket_id', id)
      .is('deleted_at', null)
      .order('created_at'),
    supabase
      .from('support_ticket_attachments')
      .select('*')
      .eq('ticket_id', id)
      .is('deleted_at', null)
      .order('created_at'),
    staff
      ? supabase
          .from('support_canned_replies')
          .select('*')
          .eq('active', true)
          .is('deleted_at', null)
          .order('title')
      : Promise.resolve({data: []})
  ]);
  return {
    ticket,
    messages: messages ?? [],
    attachments: attachments ?? [],
    cannedReplies: cannedReplies ?? [],
    staff
  };
}
export async function getKnowledge(locale: string, query = '') {
  const admin = createAdminClient();
  const [{data: categories}, {data: faqs}, {data: articles}] = await Promise.all([
    admin
      .from('knowledge_categories')
      .select('*')
      .eq('active', true)
      .is('deleted_at', null)
      .order('sort_order'),
    admin
      .from('knowledge_faqs')
      .select('*')
      .eq('active', true)
      .is('deleted_at', null)
      .order('sort_order'),
    query
      ? admin.rpc('search_knowledge', {p_query: query, p_locale: locale, p_limit: 30})
      : admin
          .from('knowledge_articles')
          .select('*')
          .eq('status', 'published')
          .is('deleted_at', null)
          .order('published_at', {ascending: false})
          .limit(30)
  ]);
  return {
    categories: (categories ?? []) as unknown as Array<Record<string, unknown>>,
    faqs: (faqs ?? []) as unknown as Array<Record<string, unknown>>,
    articles: (articles ?? []) as unknown as Array<Record<string, unknown>>
  };
}
export async function getAdminSupportQueue(locale: string) {
  await requirePermission(locale, 'support.manage');
  const admin = createAdminClient();
  const {data} = await admin
    .from('support_tickets')
    .select('*')
    .is('deleted_at', null)
    .in('status', ['open', 'in_progress', 'waiting_customer'])
    .order('priority', {ascending: false})
    .order('sla_due_at')
    .limit(100);
  return data ?? [];
}
