import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getAuthContext} from '@/features/auth/server/authorization';
import {createAdminClient} from '@/lib/supabase/admin';
import {aiRest} from '@/features/ai/server/rest';
const requestSchema = z
  .object({
    entityType: z.enum(['product', 'notification_template']),
    entityId: z.uuid(),
    sourceLocale: z.string().min(2).max(10),
    targetLocale: z.string().min(2).max(10).optional()
  })
  .refine((value) => !value.targetLocale || value.sourceLocale !== value.targetLocale);
function localized(value: unknown, locale: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const record = value as Record<string, unknown>;
  const candidate = record[locale] ?? record.en;
  return typeof candidate === 'string' ? candidate : '';
}
export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth?.permissions.includes('ai.manage'))
    return NextResponse.json({error: 'forbidden'}, {status: 403});
  try {
    const input = requestSchema.parse(await request.json()),
      admin = createAdminClient();
    let content: Record<string, string> = {};
    if (input.entityType === 'product') {
      const {data, error} = await admin
        .from('products')
        .select('name,short_description,description,warranty_text,delivery_estimate')
        .eq('id', input.entityId)
        .single();
      if (error || !data) throw new Error('translation_source_missing');
      for (const key of [
        'name',
        'short_description',
        'description',
        'warranty_text',
        'delivery_estimate'
      ] as const)
        content[key] = localized(data[key], input.sourceLocale);
    } else {
      const {data, error} = await admin
        .from('notification_templates')
        .select('subject,body')
        .eq('id', input.entityId)
        .eq('locale_code', input.sourceLocale)
        .single();
      if (error || !data) throw new Error('translation_source_missing');
      content = {
        subject: typeof data.subject === 'string' ? data.subject : '',
        body: typeof data.body === 'string' ? data.body : ''
      };
    }
    const targetLocales = input.targetLocale
      ? [input.targetLocale]
      : ((
          await admin
            .from('locales')
            .select('code')
            .eq('enabled', true)
            .neq('code', input.sourceLocale)
        ).data?.map((locale) => locale.code) ?? []);
    if (!targetLocales.length) throw new Error('translation_targets_missing');
    const requests = targetLocales.map((targetLocale) => ({
      id: crypto.randomUUID(),
      entity_type: input.entityType,
      entity_id: input.entityId,
      source_locale_code: input.sourceLocale,
      target_locale_code: targetLocale,
      source_content: content,
      requested_by: auth.user.id
    }));
    await aiRest('ai_translation_jobs', {
      method: 'POST',
      body: JSON.stringify(requests)
    });
    await aiRest('ai_jobs', {
      method: 'POST',
      body: JSON.stringify(
        requests.map((translation) => ({
          kind: 'translation.generate',
          aggregate_type: 'translation',
          aggregate_id: translation.id,
          priority: 120,
          idempotency_key: `translation:${translation.id}`
        }))
      )
    });
    return NextResponse.json(
      {data: {id: requests[0]!.id, ids: requests.map((item) => item.id), status: 'pending'}},
      {status: 201}
    );
  } catch (cause) {
    return NextResponse.json(
      {error: cause instanceof Error ? cause.message : 'translation_request_failed'},
      {status: 400}
    );
  }
}
