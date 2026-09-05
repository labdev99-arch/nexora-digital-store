import 'server-only';

import {clientAddress} from './rate-limit';

export async function verifyTurnstile(token: string | undefined, request?: Request) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return {success: true, skipped: true} as const;
  if (!token) return {success: false, error: 'turnstile_required'} as const;

  const body = new URLSearchParams({secret, response: token});
  if (request) body.set('remoteip', clientAddress(request));
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000)
    });
    const result = (await response.json()) as {success?: boolean};
    return result.success
      ? ({success: true, skipped: false} as const)
      : ({success: false, error: 'turnstile_failed'} as const);
  } catch {
    return {success: false, error: 'turnstile_unavailable'} as const;
  }
}
