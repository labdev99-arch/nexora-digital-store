import {NextResponse} from 'next/server';

import {logEvent} from '@/lib/logging/logger';
import {createAdminClient} from '@/lib/supabase/admin';

export async function GET(request: Request) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({error: 'unauthorized'}, {status: 401});
  }
  const admin = createAdminClient();
  const {data, error} = await admin.rpc('run_data_retention');
  if (error) {
    logEvent('error', 'retention.failed', {code: error.code, message: error.message});
    return NextResponse.json({error: 'retention_failed'}, {status: 500});
  }
  logEvent('info', 'retention.completed', {counts: data});
  return NextResponse.json({ok: true, counts: data});
}
