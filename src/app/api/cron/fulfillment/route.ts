import {timingSafeEqual} from 'node:crypto';

import {NextResponse} from 'next/server';

import {runFulfillmentWorker} from '@/features/fulfillment/server/fulfillment-worker';

export const runtime = 'nodejs';
export const maxDuration = 60;

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({error: 'unauthorized'}, {status: 401});
  try {
    return NextResponse.json(await runFulfillmentWorker(12));
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'fulfillment_worker_failed',
        message: error instanceof Error ? error.message : 'unknown'
      })
    );
    return NextResponse.json({error: 'worker_failed'}, {status: 500});
  }
}
