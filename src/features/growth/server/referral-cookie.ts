import 'server-only';

import {createHmac, timingSafeEqual} from 'node:crypto';

export const referralCookieName = 'nxr_referral';
export const deviceCookieName = 'nxr_device';

type ReferralCookiePayload = {clickId: string; expiresAt: number};

function secret(): string {
  const value =
    process.env.REFERRAL_COOKIE_SECRET ??
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error('REFERRAL_COOKIE_SECRET is not configured.');
  return value;
}

function signature(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function createReferralCookie(clickId: string, days = 90): string {
  const payload: ReferralCookiePayload = {
    clickId,
    expiresAt: Date.now() + days * 24 * 60 * 60 * 1000
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${signature(encoded)}`;
}

export function readReferralCookie(value: string | null | undefined): ReferralCookiePayload | null {
  if (!value) return null;
  const [encoded, supplied] = value.split('.');
  if (!encoded || !supplied) return null;
  const expected = signature(encoded);
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  if (
    expectedBytes.length !== suppliedBytes.length ||
    !timingSafeEqual(expectedBytes, suppliedBytes)
  )
    return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    ) as Partial<ReferralCookiePayload>;
    if (
      typeof parsed.clickId !== 'string' ||
      typeof parsed.expiresAt !== 'number' ||
      parsed.expiresAt <= Date.now()
    )
      return null;
    return {clickId: parsed.clickId, expiresAt: parsed.expiresAt};
  } catch {
    return null;
  }
}
