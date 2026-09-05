import {NextResponse} from 'next/server';
import {processAiBatch} from '@/features/ai/server/worker';
export async function POST(request: Request) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`
  )
    return NextResponse.json({error: 'unauthorized'}, {status: 401});
  return NextResponse.json(await processAiBatch());
}
export const GET = POST;
