import {NextResponse} from 'next/server';
import {getAuthContext} from '@/features/auth/server/authorization';
import {assistantEscalationSchema, assistantRequestSchema} from '@/features/ai/schemas';
import {answerSupport, escalateConversation} from '@/features/ai/server/support-assistant';

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({error: 'auth_required'}, {status: 401});
  try {
    const body: unknown = await request.json();
    const input = assistantRequestSchema.parse(body);
    return NextResponse.json({data: await answerSupport({profileId: auth.user.id, ...input})});
  } catch (cause) {
    return NextResponse.json(
      {error: cause instanceof Error ? cause.message : 'assistant_failed'},
      {status: 400}
    );
  }
}

export async function PUT(request: Request) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({error: 'auth_required'}, {status: 401});
  try {
    const input = assistantEscalationSchema.parse(await request.json());
    return NextResponse.json({
      data: await escalateConversation({profileId: auth.user.id, ...input})
    });
  } catch (cause) {
    return NextResponse.json(
      {error: cause instanceof Error ? cause.message : 'assistant_escalation_failed'},
      {status: 400}
    );
  }
}
