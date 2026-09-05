import {NextResponse} from 'next/server';

import {logEvent} from '@/lib/logging/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startedAt = performance.now();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let database: 'ok' | 'degraded' = 'degraded';

  if (url && key) {
    try {
      const response = await fetch(`${url}/rest/v1/locales?select=code&limit=1`, {
        headers: {apikey: key, authorization: `Bearer ${key}`},
        cache: 'no-store',
        signal: AbortSignal.timeout(3_000)
      });
      database = response.ok ? 'ok' : 'degraded';
    } catch {
      database = 'degraded';
    }
  }

  const status = database === 'ok' ? 'ok' : 'degraded';
  const body = {
    status,
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? 'development',
    region: process.env.VERCEL_REGION ?? 'local',
    checks: {application: 'ok', database},
    latencyMs: Math.round(performance.now() - startedAt),
    timestamp: new Date().toISOString()
  };
  if (status !== 'ok') logEvent('warn', 'health.degraded', body);
  return NextResponse.json(body, {
    status: status === 'ok' ? 200 : 503,
    headers: {'Cache-Control': 'no-store'}
  });
}
