import {NextResponse} from 'next/server';

import {processNotificationBatch} from '@/features/notifications/server/service';

export async function POST(request: Request) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`
  )
    return NextResponse.json({error: 'unauthorized'}, {status: 401});
  return NextResponse.json(await processNotificationBatch());
}

export const GET = POST;
