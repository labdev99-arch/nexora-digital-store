import {NextResponse} from 'next/server';
import {getAuthContext} from '@/features/auth/server/authorization';
import {insightQuerySchema} from '@/features/ai/schemas';
import {answerAnalyticsQuestion} from '@/features/ai/server/insights';
export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth?.permissions.includes('ai.manage'))
    return NextResponse.json({error: 'forbidden'}, {status: 403});
  try {
    const input = insightQuerySchema.parse(await request.json());
    return NextResponse.json({
      data: await answerAnalyticsQuestion({profileId: auth.user.id, ...input})
    });
  } catch (cause) {
    return NextResponse.json(
      {error: cause instanceof Error ? cause.message : 'insight_failed'},
      {status: 400}
    );
  }
}
