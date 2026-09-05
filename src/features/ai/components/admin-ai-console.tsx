'use client';

import {
  AlertTriangle,
  BrainCircuit,
  Check,
  Languages,
  LoaderCircle,
  Search,
  ShieldAlert,
  X
} from 'lucide-react';
import {useTranslations} from 'next-intl';
import {useState} from 'react';
import {Button} from '@/components/ui/button';

type Risk = {
  id: string;
  subject_type: string;
  subject_id: string;
  score: number;
  decision: string;
  explanations: string[];
  created_at: string;
};
type Translation = {
  id: string;
  entity_type: string;
  target_locale_code: string;
  proposed_content: Record<string, unknown>;
  status: string;
};
type Insight = {
  id: string;
  severity: string;
  metric_key: string | null;
  title: Record<string, string>;
  body: Record<string, string>;
  generated_at: string;
};
export function AdminAiConsole({
  locale,
  risks,
  translations,
  insights
}: {
  locale: 'ar' | 'en';
  risks: Risk[];
  translations: Translation[];
  insights: Insight[];
}) {
  const t = useTranslations('AI.admin');
  const [question, setQuestion] = useState(''),
    [answer, setAnswer] = useState(''),
    [busy, setBusy] = useState(false);
  const [translationRows, setTranslationRows] = useState(translations);
  const [riskRows, setRiskRows] = useState(risks);
  async function ask() {
    if (question.trim().length < 3 || busy) return;
    setBusy(true);
    try {
      const response = await fetch('/api/admin/ai/insights', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({locale, question})
      });
      const payload = (await response.json()) as {data?: {answer: string}};
      setAnswer(payload.data?.answer ?? t('queryError'));
    } catch {
      setAnswer(t('queryError'));
    } finally {
      setBusy(false);
    }
  }
  async function review(id: string, action: 'approve' | 'reject') {
    const response = await fetch(`/api/admin/ai/translations/${id}`, {
      method: 'PATCH',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({action})
    });
    if (response.ok) setTranslationRows((rows) => rows.filter((row) => row.id !== id));
  }
  async function reviewRisk(id: string, action: 'clear' | 'confirm') {
    const reason = window.prompt(t('riskReason'));
    if (!reason) return;
    const response = await fetch(`/api/admin/ai/risk/${id}`, {
      method: 'PATCH',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({action, reason})
    });
    if (response.ok) setRiskRows((rows) => rows.filter((row) => row.id !== id));
  }
  return (
    <div className="admin-ai-console">
      <section className="admin-ai-query">
        <div>
          <BrainCircuit />
          <span>
            <strong>{t('queryTitle')}</strong>
            <small>{t('queryDescription')}</small>
          </span>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void ask();
          }}
        >
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={t('queryPlaceholder')}
            maxLength={1000}
          />
          <Button variant="gradient" disabled={busy}>
            {busy ? <LoaderCircle className="animate-spin" /> : <Search />}
            {t('ask')}
          </Button>
        </form>
        {answer ? <p>{answer}</p> : null}
      </section>
      <div className="admin-ai-grid">
        <section>
          <header>
            <ShieldAlert />
            <h2>{t('riskTitle')}</h2>
            <span>{riskRows.length}</span>
          </header>
          {riskRows.length ? (
            riskRows.map((risk) => (
              <article key={risk.id}>
                <span className={`risk-score risk-${risk.decision}`}>{risk.score}</span>
                <div>
                  <strong>{t(`decision.${risk.decision}`)}</strong>
                  <small>
                    {risk.subject_type} · {risk.subject_id.slice(0, 8)}
                  </small>
                  <p>{risk.explanations.join(' · ')}</p>
                  <span className="translation-actions">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void reviewRisk(risk.id, 'clear')}
                    >
                      {t('clear')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void reviewRisk(risk.id, 'confirm')}
                    >
                      {t('confirm')}
                    </Button>
                  </span>
                </div>
              </article>
            ))
          ) : (
            <p className="admin-ai-empty">{t('riskEmpty')}</p>
          )}
        </section>
        <section>
          <header>
            <Languages />
            <h2>{t('translationTitle')}</h2>
            <span>{translationRows.length}</span>
          </header>
          {translationRows.length ? (
            translationRows.map((row) => (
              <article key={row.id}>
                <div>
                  <strong>{row.entity_type}</strong>
                  <small>{t('target', {locale: row.target_locale_code})}</small>
                  <pre>{JSON.stringify(row.proposed_content, null, 2)}</pre>
                </div>
                <span className="translation-actions">
                  <Button
                    size="icon"
                    variant="secondary"
                    onClick={() => void review(row.id, 'approve')}
                    aria-label={t('approve')}
                  >
                    <Check />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => void review(row.id, 'reject')}
                    aria-label={t('reject')}
                  >
                    <X />
                  </Button>
                </span>
              </article>
            ))
          ) : (
            <p className="admin-ai-empty">{t('translationEmpty')}</p>
          )}
        </section>
      </div>
      <section className="admin-ai-insights">
        <header>
          <AlertTriangle />
          <h2>{t('alertsTitle')}</h2>
        </header>
        {insights.length ? (
          insights.map((insight) => (
            <article key={insight.id} data-severity={insight.severity}>
              <strong>{insight.title[locale] ?? insight.title.en}</strong>
              <p>{insight.body[locale] ?? insight.body.en}</p>
              <small>
                {new Intl.DateTimeFormat(locale, {dateStyle: 'medium', timeStyle: 'short'}).format(
                  new Date(insight.generated_at)
                )}
              </small>
            </article>
          ))
        ) : (
          <p className="admin-ai-empty">{t('alertsEmpty')}</p>
        )}
      </section>
    </div>
  );
}
