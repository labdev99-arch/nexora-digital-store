import {createHash, randomUUID} from 'node:crypto';
import {NextResponse} from 'next/server';
import {z} from 'zod';

import {getAuthContext} from '@/features/auth/server/authorization';
import {createAdminClient} from '@/lib/supabase/admin';

const schema = z.object({
  analytics: z.boolean(),
  marketing: z.boolean(),
  policyVersion: z.string().min(1).max(32).default('2026-08-22')
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({error: 'invalid_input'}, {status: 400});
  const identity = await getAuthContext();
  const cookie = request.headers.get('cookie')?.match(/(?:^|; )nexora_consent_id=([^;]+)/)?.[1];
  const anonymousId = cookie ?? randomUUID();
  const salt = process.env.CONSENT_HASH_SALT ?? process.env.REFERRAL_HASH_SALT;
  if (!salt) return NextResponse.json({error: 'consent_not_configured'}, {status: 503});
  const hash = (value: string) => createHash('sha256').update(`${salt}:${value}`).digest('hex');
  const admin = createAdminClient();
  const {error} = await admin.from('privacy_consents').insert({
    profile_id: identity?.user.id ?? null,
    anonymous_id_hash: identity ? null : hash(anonymousId),
    policy_version: parsed.data.policyVersion,
    necessary: true,
    analytics: parsed.data.analytics,
    marketing: parsed.data.marketing,
    source: 'web',
    user_agent_hash: hash(request.headers.get('user-agent') ?? 'unknown')
  });
  if (error) return NextResponse.json({error: 'save_failed'}, {status: 500});

  const response = NextResponse.json({saved: true});
  response.cookies.set('nexora_consent_id', anonymousId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 365 * 24 * 60 * 60
  });
  return response;
}
