import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getAuthContext} from '@/features/auth/server/authorization';
import {createAdminClient} from '@/lib/supabase/admin';
import {aiRest} from '@/features/ai/server/rest';
const reviewSchema = z.object({
  action: z.enum(['clear', 'confirm']),
  reason: z.string().trim().min(3).max(1000)
});
export async function PATCH(request: Request, {params}: {params: Promise<{id: string}>}) {
  const auth = await getAuthContext();
  if (!auth?.permissions.includes('ai.manage'))
    return NextResponse.json({error: 'forbidden'}, {status: 403});
  try {
    const {id} = await params,
      input = reviewSchema.parse(await request.json());
    const rows = await aiRest<
        Array<{id: string; subject_type: string; subject_id: string; status: string}>
      >(
        `ai_risk_assessments?select=id,subject_type,subject_id,status&id=eq.${id}&deleted_at=is.null&limit=1`
      ),
      assessment = rows[0];
    if (!assessment || !['pending', 'reviewing'].includes(assessment.status))
      throw new Error('risk_not_reviewable');
    await aiRest(`ai_risk_assessments?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: input.action === 'clear' ? 'cleared' : 'confirmed',
        reviewed_by: auth.user.id,
        review_reason: input.reason,
        reviewed_at: new Date().toISOString()
      })
    });
    if (input.action === 'clear' && assessment.subject_type === 'order') {
      const admin = createAdminClient();
      const {data: order} = await admin
        .from('orders')
        .select('status')
        .eq('id', assessment.subject_id)
        .maybeSingle();
      if (order?.status === 'on_hold')
        await admin.rpc('transition_order_status', {
          p_order_id: assessment.subject_id,
          p_to: 'processing',
          p_actor_id: auth.user.id,
          p_actor_type: 'staff',
          p_source: 'ai_risk_review',
          p_reason: input.reason,
          p_public_message: {},
          p_metadata: {assessment_id: id}
        });
    }
    return NextResponse.json({data: {status: input.action === 'clear' ? 'cleared' : 'confirmed'}});
  } catch (cause) {
    return NextResponse.json(
      {error: cause instanceof Error ? cause.message : 'risk_review_failed'},
      {status: 400}
    );
  }
}
