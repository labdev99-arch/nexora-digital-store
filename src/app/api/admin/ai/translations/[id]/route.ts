import {NextResponse} from 'next/server';
import {getAuthContext} from '@/features/auth/server/authorization';
import {createAdminClient} from '@/lib/supabase/admin';
import {aiRest} from '@/features/ai/server/rest';
import type {Json} from '@/lib/supabase/database.types';

export async function PATCH(request: Request, {params}: {params: Promise<{id: string}>}) {
  const auth = await getAuthContext();
  if (!auth?.permissions.includes('ai.manage'))
    return NextResponse.json({error: 'forbidden'}, {status: 403});
  try {
    const {id} = await params;
    const body = (await request.json()) as {action?: string; reason?: string};
    const rows = await aiRest<
      Array<{
        id: string;
        entity_type: string;
        entity_id: string;
        target_locale_code: string;
        proposed_content: Record<string, unknown>;
        status: string;
      }>
    >(`ai_translation_jobs?select=*&id=eq.${id}&deleted_at=is.null&limit=1`);
    const job = rows[0];
    if (!job || job.status !== 'awaiting_approval') throw new Error('translation_not_reviewable');
    if (body.action === 'reject') {
      await aiRest(`ai_translation_jobs?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'rejected',
          reviewed_by: auth.user.id,
          review_reason: body.reason ?? null,
          reviewed_at: new Date().toISOString()
        })
      });
      return NextResponse.json({data: {status: 'rejected'}});
    }
    if (body.action !== 'approve') throw new Error('translation_action_invalid');
    const admin = createAdminClient();
    if (job.entity_type === 'product') {
      const {data: product, error} = await admin
        .from('products')
        .select('name,short_description,description,warranty_text,delivery_estimate')
        .eq('id', job.entity_id)
        .single();
      if (error || !product) throw new Error('translation_product_missing');
      const update: {
        name?: Json;
        short_description?: Json;
        description?: Json;
        warranty_text?: Json;
        delivery_estimate?: Json;
      } = {};
      for (const key of [
        'name',
        'short_description',
        'description',
        'warranty_text',
        'delivery_estimate'
      ] as const) {
        const proposed = job.proposed_content[key];
        if (typeof proposed === 'string')
          update[key] = {
            ...(product[key] as Record<string, Json | undefined>),
            [job.target_locale_code]: proposed
          };
      }
      const {error: updateError} = await admin
        .from('products')
        .update(update)
        .eq('id', job.entity_id);
      if (updateError) throw new Error('translation_apply_failed');
    } else {
      const subject = job.proposed_content.subject,
        bodyText = job.proposed_content.body;
      const {error} = await admin
        .from('notification_templates')
        .update({
          ...(typeof subject === 'string' ? {subject} : {}),
          ...(typeof bodyText === 'string' ? {body: bodyText} : {})
        })
        .eq('id', job.entity_id)
        .eq('locale_code', job.target_locale_code);
      if (error) throw new Error('translation_apply_failed');
    }
    await aiRest(`ai_translation_jobs?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'approved',
        reviewed_by: auth.user.id,
        review_reason: body.reason ?? null,
        reviewed_at: new Date().toISOString()
      })
    });
    return NextResponse.json({data: {status: 'approved'}});
  } catch (cause) {
    return NextResponse.json(
      {error: cause instanceof Error ? cause.message : 'translation_review_failed'},
      {status: 400}
    );
  }
}
