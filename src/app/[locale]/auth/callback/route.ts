import {NextResponse, type NextRequest} from 'next/server';

import {createClient} from '@/lib/supabase/server';
import {guestCartCookie, mergeGuestCart} from '@/features/commerce/server/cart-service';
import {readReferralCookie, referralCookieName} from '@/features/growth/server/referral-cookie';

const otpTypes = ['email', 'recovery', 'invite', 'email_change', 'signup', 'magiclink'] as const;
type OtpType = (typeof otpTypes)[number];

function isOtpType(value: string | null): value is OtpType {
  return otpTypes.some((type) => type === value);
}

function safeNext(value: string | null): string {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/account';
}

export async function GET(request: NextRequest, {params}: {params: Promise<{locale: string}>}) {
  const {locale: requestedLocale} = await params;
  const locale = requestedLocale === 'ar' ? 'ar' : 'en';
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const next = safeNext(url.searchParams.get('next'));
  const supabase = await createClient();

  if (code) {
    const {error} = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {data: sessionUser} = await supabase.auth.getUser();
      await mergeGuestCart(
        sessionUser.user?.id ?? '',
        request.cookies.get(guestCartCookie)?.value ?? null
      );
      const userAgent = request.headers.get('user-agent') ?? '';
      await supabase.rpc('touch_user_session', {
        p_device_name: userAgent.includes('Mobile') ? 'mobile' : 'desktop',
        p_user_agent: userAgent
      });
      const referral = readReferralCookie(request.cookies.get(referralCookieName)?.value);
      if (referral) {
        await supabase.rpc('claim_referral_attribution', {p_click_id: referral.clickId});
      }
      const response = NextResponse.redirect(new URL(`/${locale}${next}`, url.origin));
      response.cookies.delete(guestCartCookie);
      response.cookies.delete(referralCookieName);
      return response;
    }
  } else if (tokenHash && isOtpType(type)) {
    const {error} = await supabase.auth.verifyOtp({token_hash: tokenHash, type});
    if (!error) {
      const {data: sessionUser} = await supabase.auth.getUser();
      await mergeGuestCart(
        sessionUser.user?.id ?? '',
        request.cookies.get(guestCartCookie)?.value ?? null
      );
      const userAgent = request.headers.get('user-agent') ?? '';
      await supabase.rpc('touch_user_session', {
        p_device_name: userAgent.includes('Mobile') ? 'mobile' : 'desktop',
        p_user_agent: userAgent
      });
      const referral = readReferralCookie(request.cookies.get(referralCookieName)?.value);
      if (referral) {
        await supabase.rpc('claim_referral_attribution', {p_click_id: referral.clickId});
      }
      const response = NextResponse.redirect(new URL(`/${locale}${next}`, url.origin));
      response.cookies.delete(guestCartCookie);
      response.cookies.delete(referralCookieName);
      return response;
    }
  }

  return NextResponse.redirect(
    new URL(`/${locale}/auth/sign-in?error=callback_failed`, url.origin)
  );
}
