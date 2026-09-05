import {createServerClient} from '@supabase/ssr';
import createIntlMiddleware from 'next-intl/middleware';
import {NextRequest, NextResponse} from 'next/server';

import {routing} from './i18n/routing';
import {resolveLocalePreference} from './i18n/locale-detection';
import {requiresMfaChallenge} from './features/auth/server/mfa';
import type {Database, UserRole} from './lib/supabase/database.types';
import {verifyCsrfRequest} from './lib/security/csrf';
import {clientAddress, enforceRateLimit} from './lib/security/rate-limit';

const handleIntl = createIntlMiddleware(routing);
const protectedPrefixes = ['/account', '/admin', '/reseller'] as const;
const localePattern = new RegExp(`^/(${routing.locales.join('|')})(?=/|$)`);

export function resolveRequestLocale(request: NextRequest) {
  return resolveLocalePreference(
    request.cookies.get('NEXT_LOCALE')?.value,
    request.headers.get('accept-language')
  );
}

function routeWithoutLocale(pathname: string): string {
  return pathname.replace(localePattern, '') || '/';
}

function isProtected(pathname: string): boolean {
  return protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function hasRequiredRole(pathname: string, roles: readonly UserRole[]): boolean {
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return roles.includes('admin') || roles.includes('owner');
  }
  if (pathname === '/reseller' || pathname.startsWith('/reseller/')) {
    return roles.includes('reseller') || roles.includes('admin') || roles.includes('owner');
  }
  return true;
}

export default async function middleware(request: NextRequest) {
  const pathnameWithLocale = request.nextUrl.pathname;
  const isApi = pathnameWithLocale.startsWith('/api/');
  const nonce = btoa(crypto.randomUUID());
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  const securedRequest = new NextRequest(request, {headers: requestHeaders});
  let response = isApi
    ? NextResponse.next({request: {headers: requestHeaders}})
    : handleIntl(securedRequest);

  if (isApi) {
    const csrf = verifyCsrfRequest(request);
    if (!csrf.allowed) {
      return withSecurityHeaders(
        NextResponse.json({error: {code: 'csrf_rejected', message: csrf.reason}}, {status: 403}),
        nonce
      );
    }

    const path = pathnameWithLocale;
    const category = path.startsWith('/api/payments/')
      ? 'payment'
      : path.startsWith('/api/v1/') || path.startsWith('/api/smm')
        ? 'public-api'
        : path.includes('/auth/')
          ? 'auth'
          : 'api';
    const budgets = {
      auth: [10, 60],
      payment: [30, 60],
      'public-api': [120, 60],
      api: [180, 60]
    } as const;
    const [limit, windowSeconds] = budgets[category];
    const rate = await enforceRateLimit(
      `${category}:${clientAddress(request)}:${request.method}`,
      limit,
      windowSeconds
    );
    response.headers.set('RateLimit-Limit', String(rate.limit));
    response.headers.set('RateLimit-Remaining', String(rate.remaining));
    response.headers.set('RateLimit-Reset', String(Math.ceil(rate.resetAt / 1000)));
    if (!rate.allowed) {
      return withSecurityHeaders(
        NextResponse.json(
          {error: {code: 'rate_limit_exceeded', message: 'Too many requests'}},
          {status: 429, headers: {'Retry-After': String(windowSeconds)}}
        ),
        nonce
      );
    }
    return withSecurityHeaders(response, nonce);
  }

  const pathname = routeWithoutLocale(request.nextUrl.pathname);
  if (!isProtected(pathname)) return withSecurityHeaders(response, nonce);

  const localeMatch = request.nextUrl.pathname.match(localePattern);
  const locale = localeMatch?.[1] ?? resolveRequestLocale(request);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return withSecurityHeaders(
      NextResponse.redirect(new URL(`/${locale}/auth/sign-in`, request.url)),
      nonce
    );
  }

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => {
        cookies.forEach(({name, value}) => request.cookies.set(name, value));
        response = handleIntl(request);
        cookies.forEach(({name, value, options}) => response.cookies.set(name, value, options));
      }
    }
  });
  const {
    data: {user}
  } = await supabase.auth.getUser();
  if (!user) {
    const signIn = new URL(`/${locale}/auth/sign-in`, request.url);
    signIn.searchParams.set('returnTo', request.nextUrl.pathname);
    return withSecurityHeaders(NextResponse.redirect(signIn), nonce);
  }

  const {data: assurance} = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (requiresMfaChallenge(assurance)) {
    return withSecurityHeaders(
      NextResponse.redirect(new URL(`/${locale}/auth/mfa`, request.url)),
      nonce
    );
  }

  if (pathname.startsWith('/admin') || pathname.startsWith('/reseller')) {
    const {data} = await supabase
      .from('profile_roles')
      .select('role, expires_at')
      .eq('profile_id', user.id);
    const now = Date.now();
    const roles = (data ?? [])
      .filter((row) => !row.expires_at || new Date(row.expires_at).getTime() > now)
      .map((row) => row.role);
    if (!hasRequiredRole(pathname, roles)) {
      return withSecurityHeaders(
        NextResponse.redirect(new URL(`/${locale}/account?denied=1`, request.url)),
        nonce
      );
    }
  }
  return withSecurityHeaders(response, nonce);
}

function withSecurityHeaders(response: NextResponse, nonce: string): NextResponse {
  const development = process.env.NODE_ENV !== 'production';
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(development ? ["'unsafe-eval'"] : []),
    'https:'
  ].join(' ');
  const policy = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.upstash.io https://challenges.cloudflare.com https://*.sentry.io",
    "frame-src 'self' https://challenges.cloudflare.com https://js.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests'
  ].join('; ');
  response.headers.set('Content-Security-Policy', policy);
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  response.headers.set('Origin-Agent-Cluster', '?1');
  response.headers.set('X-DNS-Prefetch-Control', 'off');
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  response.headers.set('x-nonce', nonce);
  return response;
}

export const config = {
  matcher: ['/((?!_next|_vercel|.*\\..*).*)']
};
