'use server';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {requirePermission} from '@/features/auth/server/authorization';
import {createClient} from '@/lib/supabase/server';
import {createTicketSchema, ticketMessageSchema, ticketRatingSchema} from '../schemas';

export async function createTicketAction(raw: unknown) {
  const parsed = createTicketSchema.safeParse(raw);
  if (!parsed.success) return {ok: false, error: 'invalid_ticket'} as const;
  await requirePermission(parsed.data.locale, 'account.update');
  const supabase = await createClient();
  const {data, error} = await supabase.rpc('create_support_ticket', {
    p_category_code: parsed.data.categoryCode,
    p_subject: parsed.data.subject,
    p_description: parsed.data.description,
    p_order_id: parsed.data.orderId ?? null
  });
  if (error || !data) return {ok: false, error: error?.message ?? 'ticket_create_failed'} as const;
  redirect(`/${parsed.data.locale}/support/${data.id}`);
}
export async function postTicketMessageAction(raw: unknown) {
  const parsed = ticketMessageSchema.safeParse(raw);
  if (!parsed.success) return {ok: false, error: 'invalid_message'} as const;
  await requirePermission(
    parsed.data.locale,
    parsed.data.internal ? 'support.manage' : 'account.update'
  );
  const supabase = await createClient();
  const {error} = await supabase.rpc('post_support_message', {
    p_ticket_id: parsed.data.ticketId,
    p_body: parsed.data.body,
    p_internal: parsed.data.internal
  });
  if (error) return {ok: false, error: error.message} as const;
  revalidatePath(`/${parsed.data.locale}/support/${parsed.data.ticketId}`);
  return {ok: true} as const;
}
export async function reopenTicketAction(ticketId: string, locale: 'en' | 'ar') {
  await requirePermission(locale, 'account.update');
  const supabase = await createClient();
  const {error} = await supabase.rpc('reopen_support_ticket', {p_ticket_id: ticketId});
  if (error) return {ok: false, error: error.message} as const;
  revalidatePath(`/${locale}/support/${ticketId}`);
  return {ok: true} as const;
}
export async function rateTicketAction(raw: unknown) {
  const parsed = ticketRatingSchema.safeParse(raw);
  if (!parsed.success) return {ok: false, error: 'invalid_rating'} as const;
  await requirePermission(parsed.data.locale, 'account.update');
  const supabase = await createClient();
  const {error} = await supabase.rpc('rate_support_ticket', {
    p_ticket_id: parsed.data.ticketId,
    p_rating: parsed.data.rating,
    p_comment: parsed.data.comment ?? null
  });
  if (error) return {ok: false, error: error.message} as const;
  revalidatePath(`/${parsed.data.locale}/support/${parsed.data.ticketId}`);
  return {ok: true} as const;
}
