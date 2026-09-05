import 'server-only';

import {createAdminClient} from '@/lib/supabase/admin';
import {aiRest} from './rest';

type SubjectType = 'order' | 'topup';
export type RiskResult = {
  score: number;
  decision: 'allow' | 'review' | 'hold' | 'block';
  features: Record<string, number | boolean | string | null>;
  explanations: string[];
};

export async function scoreRisk(subjectType: SubjectType, subjectId: string): Promise<RiskResult> {
  const admin = createAdminClient();
  let score = 0;
  const explanations: string[] = [];
  const features: RiskResult['features'] = {};
  if (subjectType === 'order') {
    const {data: subject, error} = await admin
      .from('orders')
      .select('id,profile_id,total_amount,currency_code,country_code,status,created_at')
      .eq('id', subjectId)
      .single();
    if (error || !subject) throw new Error('risk_order_not_found');
    const hourAgo = new Date(new Date(subject.created_at).getTime() - 3600000).toISOString();
    const dayAgo = new Date(new Date(subject.created_at).getTime() - 86400000).toISOString();
    const [velocity, profile, attribution, sessions] = await Promise.all([
      admin
        .from('orders')
        .select('id', {count: 'exact', head: true})
        .eq('profile_id', subject.profile_id!)
        .gte('created_at', hourAgo),
      admin.from('profiles').select('country_code').eq('id', subject.profile_id!).maybeSingle(),
      admin
        .from('referral_attributions')
        .select('fraud_score,fraud_status')
        .eq('referred_profile_id', subject.profile_id!)
        .maybeSingle(),
      admin
        .from('user_sessions')
        .select('country_code,ip_hash')
        .eq('profile_id', subject.profile_id!)
        .gte('last_seen_at', dayAgo)
        .limit(10)
    ]);
    const velocityCount = velocity.count ?? 0;
    features.velocity_1h = velocityCount;
    if (velocityCount >= 5) {
      score += 25;
      explanations.push('high_order_velocity');
    }
    features.amount_minor = subject.total_amount;
    if (subject.total_amount >= 100000) {
      score += 20;
      explanations.push('high_amount');
    }
    const profileMismatch = Boolean(
      profile.data?.country_code &&
      subject.country_code &&
      profile.data.country_code !== subject.country_code
    );
    features.geo_profile_mismatch = profileMismatch;
    if (profileMismatch) {
      score += 15;
      explanations.push('geo_profile_mismatch');
    }
    const sessionCountries = new Set(
      (sessions.data ?? []).map((row) => row.country_code).filter(Boolean)
    );
    const geoVelocity = sessionCountries.size >= 3;
    features.geo_velocity = geoVelocity;
    if (geoVelocity) {
      score += 15;
      explanations.push('geo_velocity');
    }
    const referralScore = Number(attribution.data?.fraud_score ?? 0);
    features.referral_fraud_score = referralScore;
    if (referralScore >= 50) {
      score += Math.min(25, Math.round(referralScore / 4));
      explanations.push('referral_loop_or_cluster');
    }
    const result = decision(score, features, explanations);
    await persist(subjectType, subjectId, subject.profile_id, result);
    if (result.decision === 'hold' && subject.status === 'paid')
      await admin.rpc('transition_order_status', {
        p_order_id: subjectId,
        p_to: 'on_hold',
        p_actor_id: null,
        p_actor_type: 'system',
        p_source: 'ai_risk',
        p_reason: 'risk_review',
        p_public_message: {
          en: 'Your order is undergoing a routine security review.',
          ar: 'طلبك قيد مراجعة أمنية اعتيادية.'
        },
        p_metadata: {risk_score: result.score}
      });
    return result;
  }
  const {data: payment, error} = await admin
    .from('payments')
    .select('id,profile_id,payable_amount,currency_code,status,created_at')
    .eq('id', subjectId)
    .single();
  if (error || !payment) throw new Error('risk_topup_not_found');
  if (!payment.profile_id) throw new Error('risk_topup_profile_missing');
  const hourAgo = new Date(new Date(payment.created_at).getTime() - 3600000).toISOString();
  const [velocity, proofs] = await Promise.all([
    admin
      .from('payments')
      .select('id', {count: 'exact', head: true})
      .eq('profile_id', payment.profile_id)
      .gte('created_at', hourAgo),
    admin.from('payment_proofs').select('id').eq('payment_id', subjectId)
  ]);
  const velocityCount = velocity.count ?? 0;
  features.velocity_1h = velocityCount;
  if (velocityCount >= 4) {
    score += 25;
    explanations.push('high_topup_velocity');
  }
  features.amount_minor = payment.payable_amount;
  if (payment.payable_amount >= 100000) {
    score += 20;
    explanations.push('high_amount');
  }
  const proofIds = (proofs.data ?? []).map((proof) => proof.id);
  const {data: checks} = proofIds.length
    ? await admin
        .from('payment_proof_checks')
        .select('flags,confidence_bps')
        .in('proof_id', proofIds)
    : {data: []};
  const flags = (checks ?? []).flatMap((check) => check.flags ?? []);
  const duplicate = flags.includes('possible_duplicate');
  features.proof_reuse = duplicate;
  if (duplicate) {
    score += 45;
    explanations.push('proof_reuse');
  }
  const mismatch = flags.some((flag) => flag.endsWith('_mismatch'));
  features.proof_mismatch = mismatch;
  if (mismatch) {
    score += 25;
    explanations.push('proof_mismatch');
  }
  const result = decision(score, features, explanations);
  await persist(subjectType, subjectId, payment.profile_id, result);
  if (result.decision === 'hold')
    await admin
      .from('payments')
      .update({status: 'under_review'})
      .eq('id', subjectId)
      .in('status', ['awaiting_proof', 'under_review']);
  return result;
}

function decision(
  raw: number,
  features: RiskResult['features'],
  explanations: string[]
): RiskResult {
  const score = Math.min(100, raw);
  return {
    score,
    decision: score >= 90 ? 'block' : score >= 70 ? 'hold' : score >= 40 ? 'review' : 'allow',
    features,
    explanations: explanations.length ? explanations : ['no_material_risk_signals']
  };
}
async function persist(
  subjectType: SubjectType,
  subjectId: string,
  profileId: string | null,
  result: RiskResult
) {
  await aiRest('ai_risk_assessments', {
    method: 'POST',
    body: JSON.stringify({
      subject_type: subjectType,
      subject_id: subjectId,
      profile_id: profileId,
      score: result.score,
      decision: result.decision,
      status: result.decision === 'allow' ? 'cleared' : 'pending',
      rules_version: 'phase11-v1',
      features: result.features,
      explanations: result.explanations
    })
  });
  await aiRest(`${subjectType === 'order' ? 'orders' : 'payments'}?id=eq.${subjectId}`, {
    method: 'PATCH',
    body: JSON.stringify({ai_risk_score: result.score, ai_risk_decision: result.decision})
  });
}
