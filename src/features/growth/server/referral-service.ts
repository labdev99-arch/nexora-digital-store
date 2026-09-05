import 'server-only';

import {createHash, randomBytes} from 'node:crypto';

import {queryValue, trustedRest} from '@/features/reseller/server/trusted-rest';

type AffiliateAccountRow = {
  id: string;
  profile_id: string;
  referral_code: string;
  parent_affiliate_id: string | null;
  status: string;
};
type AffiliateLinkRow = {
  id: string;
  affiliate_account_id: string;
  destination_path: string;
  slug: string;
  active: boolean;
};
type SettingRow = {value: unknown};

export type CapturedReferral = {
  clickId: string;
  destinationPath: string;
  cookieDays: number;
  attributionModel: 'first_touch' | 'last_touch';
};

function hash(value: string): string {
  const salt =
    process.env.REFERRAL_HASH_SALT ??
    process.env.REFERRAL_COOKIE_SECRET ??
    process.env.SUPABASE_SECRET_KEY ??
    '';
  if (!salt) throw new Error('REFERRAL_HASH_SALT is not configured.');
  return createHash('sha256').update(`${salt}:${value}`).digest('hex');
}

async function setting<T>(key: string, fallback: T): Promise<T> {
  const rows = await trustedRest<SettingRow[]>(
    `growth_settings?select=value&key=eq.${queryValue(key)}&limit=1`
  );
  return (rows[0]?.value as T | undefined) ?? fallback;
}

export async function captureReferralVisit(input: {
  code: string;
  landingPath: string;
  visitorToken?: string;
  deviceToken: string;
  ip: string;
  userAgent: string;
  utm: Record<string, string>;
}): Promise<CapturedReferral | null> {
  const normalizedCode = input.code.trim();
  const links = await trustedRest<AffiliateLinkRow[]>(
    `affiliate_links?select=id,affiliate_account_id,destination_path,slug,active&slug=eq.${queryValue(normalizedCode)}&active=eq.true&deleted_at=is.null&limit=1`
  );
  const link = links[0] ?? null;
  let account: AffiliateAccountRow | null = null;
  if (link) {
    const rows = await trustedRest<AffiliateAccountRow[]>(
      `affiliate_accounts?select=id,profile_id,referral_code,parent_affiliate_id,status&id=eq.${queryValue(link.affiliate_account_id)}&status=eq.active&deleted_at=is.null&limit=1`
    );
    account = rows[0] ?? null;
  } else {
    const rows = await trustedRest<AffiliateAccountRow[]>(
      `affiliate_accounts?select=id,profile_id,referral_code,parent_affiliate_id,status&referral_code=eq.${queryValue(normalizedCode.toUpperCase())}&status=eq.active&deleted_at=is.null&limit=1`
    );
    account = rows[0] ?? null;
  }
  if (!account) return null;
  const visitorToken = input.visitorToken ?? randomBytes(24).toString('base64url');
  const inserted = await trustedRest<Array<{id: string}>>('referral_clicks?select=id', {
    method: 'POST',
    headers: {Prefer: 'return=representation'},
    body: JSON.stringify({
      affiliate_account_id: account.id,
      affiliate_link_id: link?.id ?? null,
      visitor_token_hash: hash(visitorToken),
      device_hash: hash(input.deviceToken),
      ip_hash: input.ip ? hash(input.ip) : null,
      user_agent_hash: input.userAgent ? hash(input.userAgent) : null,
      landing_path: input.landingPath,
      utm: input.utm
    })
  });
  const [cookieDays, attributionModel] = await Promise.all([
    setting<number>('referral.cookie_days', 90),
    setting<'first_touch' | 'last_touch'>('referral.attribution_model', 'last_touch')
  ]);
  return {
    clickId: inserted[0]?.id ?? '',
    destinationPath: link?.destination_path ?? '/',
    cookieDays: Math.min(Math.max(cookieDays, 1), 365),
    attributionModel
  };
}
