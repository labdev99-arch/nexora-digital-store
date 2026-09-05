import {NextResponse} from 'next/server';
import {createAdminClient} from '@/lib/supabase/admin';

const copy = {
  en: {
    subject: 'Your Nexora cart is waiting',
    title: 'Still deciding?',
    body: 'Your digital products are still saved. Return before availability changes.',
    cta: 'Return to cart'
  },
  ar: {
    subject: 'سلتك في نكسورا بانتظارك',
    title: 'ما زلت تفكر؟',
    body: 'منتجاتك الرقمية ما زالت محفوظة. عُد قبل تغير التوفر.',
    cta: 'العودة إلى السلة'
  }
} as const;
async function sendEmail(to: string, locale: 'en' | 'ar', cartId: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error('recovery_email_not_configured');
  const text = copy[locale];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {authorization: `Bearer ${apiKey}`, 'content-type': 'application/json'},
    body: JSON.stringify({
      from,
      to,
      subject: text.subject,
      html: `<div dir="${locale === 'ar' ? 'rtl' : 'ltr'}" style="font-family:Arial,sans-serif;padding:32px"><h1>${text.title}</h1><p>${text.body}</p><a href="${appUrl}/${locale}/cart?recovery=${cartId}">${text.cta}</a></div>`
    })
  });
  if (!response.ok) throw new Error('recovery_email_failed');
}
export async function POST(request: Request) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`
  )
    return NextResponse.json({error: 'unauthorized'}, {status: 401});
  const admin = createAdminClient();
  await admin.rpc('enqueue_abandoned_cart_jobs');
  const {data: jobs} = await admin
    .from('cart_recovery_jobs')
    .select('*')
    .in('status', ['pending', 'failed'])
    .lte('run_at', new Date().toISOString())
    .order('run_at')
    .limit(50);
  let sent = 0;
  for (const job of jobs ?? []) {
    await admin
      .from('cart_recovery_jobs')
      .update({status: 'processing', attempts: Number(job.attempts) + 1})
      .eq('id', String(job.id));
    try {
      const {data: cart} = await admin
        .from('carts')
        .select('*')
        .eq('id', String(job.cart_id))
        .single();
      if (!cart?.profile_id) throw new Error('recovery_no_profile');
      const {data: user} = await admin.auth.admin.getUserById(cart.profile_id);
      if (!user.user?.email) throw new Error('recovery_no_email');
      await sendEmail(user.user.email, cart.locale_code === 'ar' ? 'ar' : 'en', cart.id);
      await admin
        .from('cart_recovery_jobs')
        .update({status: 'sent', sent_at: new Date().toISOString(), last_error: null})
        .eq('id', String(job.id));
      sent++;
    } catch (cause) {
      await admin
        .from('cart_recovery_jobs')
        .update({
          status: 'failed',
          last_error: cause instanceof Error ? cause.message.slice(0, 250) : 'unknown'
        })
        .eq('id', String(job.id));
    }
  }
  return NextResponse.json({processed: jobs?.length ?? 0, sent});
}
