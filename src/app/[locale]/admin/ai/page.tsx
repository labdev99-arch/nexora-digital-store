import {getTranslations, setRequestLocale} from 'next-intl/server';
import {requirePermission} from '@/features/auth/server/authorization';
import {AdminAiConsole} from '@/features/ai/components/admin-ai-console';
import {aiRest} from '@/features/ai/server/rest';
export default async function AdminAiPage({params}: {params: Promise<{locale: 'ar' | 'en'}>}) {
  const {locale} = await params;
  setRequestLocale(locale);
  await requirePermission(locale, 'ai.manage');
  const t = await getTranslations({locale, namespace: 'AI.admin'});
  const [risks, translations, insights] = await Promise.all([
    aiRest<
      Array<{
        id: string;
        subject_type: string;
        subject_id: string;
        score: number;
        decision: string;
        explanations: string[];
        created_at: string;
      }>
    >(
      'ai_risk_assessments?select=id,subject_type,subject_id,score,decision,explanations,created_at&status=in.(pending,reviewing)&deleted_at=is.null&order=score.desc&limit=50'
    ),
    aiRest<
      Array<{
        id: string;
        entity_type: string;
        target_locale_code: string;
        proposed_content: Record<string, unknown>;
        status: string;
      }>
    >(
      'ai_translation_jobs?select=id,entity_type,target_locale_code,proposed_content,status&status=eq.awaiting_approval&deleted_at=is.null&order=created_at.asc&limit=50'
    ),
    aiRest<
      Array<{
        id: string;
        severity: string;
        metric_key: string | null;
        title: Record<string, string>;
        body: Record<string, string>;
        generated_at: string;
      }>
    >(
      'ai_insights?select=id,severity,metric_key,title,body,generated_at&kind=eq.anomaly&status=eq.active&deleted_at=is.null&order=generated_at.desc&limit=30'
    )
  ]);
  return (
    <main className="admin-page">
      <header className="admin-page-heading">
        <span>{t('eyebrow')}</span>
        <h1>{t('title')}</h1>
        <p>{t('description')}</p>
      </header>
      <AdminAiConsole
        locale={locale}
        risks={risks}
        translations={translations}
        insights={insights}
      />
    </main>
  );
}
