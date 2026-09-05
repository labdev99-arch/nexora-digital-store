const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const EXEMPT_PREFIXES = [
  '/api/cron/',
  '/api/payments/webhooks/',
  '/api/notifications/webhooks/',
  '/api/v1/',
  '/api/smm'
] as const;

export type CsrfDecision = {allowed: true} | {allowed: false; reason: string};

function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function verifyCsrfRequest(request: Request): CsrfDecision {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return {allowed: true};

  const pathname = new URL(request.url).pathname;
  if (EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return {allowed: true};

  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite === 'cross-site') return {allowed: false, reason: 'cross_site_request'};

  const origin = request.headers.get('origin');
  if (!origin) {
    // Browser form/fetch mutations always carry Origin or Fetch Metadata. Reject
    // ambiguous cookie-authenticated requests while keeping same-origin navigations safe.
    return fetchSite === 'same-origin' || fetchSite === 'same-site'
      ? {allowed: true}
      : {allowed: false, reason: 'missing_origin'};
  }

  const requestOrigin = new URL(request.url).origin;
  const configuredOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL ?? requestOrigin);
  const suppliedOrigin = normalizeOrigin(origin);
  if (
    !suppliedOrigin ||
    (suppliedOrigin !== requestOrigin && suppliedOrigin !== configuredOrigin)
  ) {
    return {allowed: false, reason: 'origin_mismatch'};
  }
  return {allowed: true};
}
