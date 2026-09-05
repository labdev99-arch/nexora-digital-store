import {randomBytes} from 'node:crypto';

import {NextResponse, type NextRequest} from 'next/server';

import {
  createReferralCookie,
  deviceCookieName,
  readReferralCookie,
  referralCookieName
} from '@/features/growth/server/referral-cookie';
import {captureReferralVisit} from '@/features/growth/server/referral-service';

export async function GET(
  request: NextRequest,
  {params}: {params: Promise<{locale: string; code: string}>}
) {
  const {locale: requestedLocale, code} = await params;
  const locale = requestedLocale === 'ar' ? 'ar' : 'en';
  const deviceToken =
    request.cookies.get(deviceCookieName)?.value ?? randomBytes(24).toString('base64url');
  const utm = Object.fromEntries(
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
      .map((key) => [key, request.nextUrl.searchParams.get(key)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
  );
  const captured = await captureReferralVisit({
    code,
    landingPath: request.nextUrl.pathname,
    deviceToken,
    ip:
      request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      '',
    userAgent: request.headers.get('user-agent') ?? '',
    utm
  }).catch(() => null);
  const destination = captured?.destinationPath ?? '/';
  const localizedDestination = destination.startsWith(`/${locale}`)
    ? destination
    : `/${locale}${destination === '/' ? '' : destination}`;
  const response = NextResponse.redirect(new URL(localizedDestination, request.url));
  response.cookies.set(deviceCookieName, deviceToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 365 * 24 * 60 * 60,
    path: '/'
  });
  if (captured?.clickId) {
    const existing = readReferralCookie(request.cookies.get(referralCookieName)?.value);
    if (!existing || captured.attributionModel === 'last_touch') {
      response.cookies.set(
        referralCookieName,
        createReferralCookie(captured.clickId, captured.cookieDays),
        {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          maxAge: captured.cookieDays * 24 * 60 * 60,
          path: '/'
        }
      );
    }
  }
  return response;
}
