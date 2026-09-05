import 'server-only';

import {createHash, randomUUID} from 'node:crypto';
import {createAdminClient} from '@/lib/supabase/admin';
import {notify} from '@/features/notifications/server/service';
import type {Json} from '@/lib/supabase/database.types';
import {runAiText, runEmbeddings} from './runtime';
import {aiRest, aiRpc} from './rest';
import {scoreRisk} from './risk';

type AiJob = {
  id: string;
  kind: string;
  aggregate_type: string;
  aggregate_id: string | null;
  payload: Record<string, unknown>;
};
function localized(value: Json | undefined, locale: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const record = value as Record<string, Json | undefined>;
  const item = record[locale] ?? record.en ?? record.ar;
  return typeof item === 'string' ? item : '';
}
function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

async function refreshDocument(job: AiJob) {
  if (!job.aggregate_id) throw new Error('ai_document_source_missing');
  const admin = createAdminClient();
  const {data: locales} = await admin.from('locales').select('code').eq('enabled', true);
  for (const {code} of locales ?? []) {
    let title = '',
      content = '',
      url = '';
    let deleted = false;
    if (job.aggregate_type === 'knowledge_article') {
      const {data} = await admin
        .from('knowledge_articles')
        .select('slug,title,excerpt,body,status,deleted_at')
        .eq('id', job.aggregate_id)
        .maybeSingle();
      deleted = !data || data.status !== 'published' || Boolean(data.deleted_at);
      if (data) {
        title = localized(data.title, code);
        content = `${localized(data.excerpt, code)}\n${localized(data.body, code)}`;
        url = `/${code}/help/${data.slug}`;
      }
    } else if (job.aggregate_type === 'faq') {
      const {data} = await admin
        .from('knowledge_faqs')
        .select('id,question,answer,active,deleted_at')
        .eq('id', job.aggregate_id)
        .maybeSingle();
      deleted = !data || !data.active || Boolean(data.deleted_at);
      if (data) {
        title = localized(data.question, code);
        content = localized(data.answer, code);
        url = `/${code}/help#faq-${data.id}`;
      }
    } else {
      const {data} = await admin
        .from('products')
        .select('slug,name,short_description,description,status,deleted_at')
        .eq('id', job.aggregate_id)
        .maybeSingle();
      deleted = !data || data.status !== 'active' || Boolean(data.deleted_at);
      if (data) {
        title = localized(data.name, code);
        content = `${localized(data.short_description, code)}\n${localized(data.description, code)}`;
        url = `/${code}/products/${data.slug}`;
      }
    }
    if (deleted || !title || !content) {
      await aiRest(
        `ai_documents?source_type=eq.${job.aggregate_type}&source_id=eq.${job.aggregate_id}&locale_code=eq.${code}`,
        {method: 'PATCH', body: JSON.stringify({deleted_at: new Date().toISOString()})}
      );
      continue;
    }
    const digest = hash(`${title}\n${content}`);
    const embedding =
      (await runEmbeddings([`${title}\n${content}`], {feature: 'embedding.refresh'}))?.[0] ?? null;
    await aiRest('ai_documents?on_conflict=source_type,source_id,locale_code', {
      method: 'POST',
      headers: {prefer: 'resolution=merge-duplicates,return=minimal'},
      body: JSON.stringify({
        source_type: job.aggregate_type,
        source_id: job.aggregate_id,
        locale_code: code,
        title,
        content,
        source_url: url,
        content_hash: digest,
        embedding: embedding ? `[${embedding.join(',')}]` : null,
        embedded_at: embedding ? new Date().toISOString() : null,
        deleted_at: null
      })
    });
  }
  return {refreshed: true};
}

async function refreshRecommendations() {
  type RecommendationEdge = {
    source_product_id: string;
    recommended_product_id: string;
    score_bps: number;
    collaborative_score_bps: number;
    content_score_bps: number;
    reason_code: string;
  };
  const admin = createAdminClient();
  const {data: items} = await admin
    .from('order_items')
    .select('order_id,product_id,orders!inner(profile_id,status)')
    .in('orders.status', ['delivered', 'completed'])
    .limit(20000);
  const byOrder = new Map<string, Set<string>>(),
    popularity = new Map<string, number>();
  for (const item of items ?? []) {
    const set = byOrder.get(item.order_id) ?? new Set<string>();
    set.add(item.product_id);
    byOrder.set(item.order_id, set);
    popularity.set(item.product_id, (popularity.get(item.product_id) ?? 0) + 1);
  }
  const pairs = new Map<string, number>();
  for (const set of byOrder.values())
    for (const source of set)
      for (const target of set)
        if (source !== target)
          pairs.set(`${source}:${target}`, (pairs.get(`${source}:${target}`) ?? 0) + 1);
  const edgeMap = new Map<string, RecommendationEdge>(
    [...pairs.entries()].map(([key, count]) => {
      const [source, recommended] = key.split(':') as [string, string];
      const collaborative = Math.min(10000, count * 1000);
      return [
        key,
        {
          source_product_id: source,
          recommended_product_id: recommended,
          score_bps: collaborative,
          collaborative_score_bps: collaborative,
          content_score_bps: 0,
          reason_code: 'customers_also_bought'
        }
      ] as [string, RecommendationEdge];
    })
  );
  const {data: activeProducts} = await admin
    .from('products')
    .select('id,category_id,product_type_code')
    .eq('status', 'active')
    .is('deleted_at', null);
  for (const source of activeProducts ?? [])
    for (const target of activeProducts ?? []) {
      if (source.id === target.id) continue;
      const content = Math.min(
        10000,
        (source.category_id === target.category_id ? 5000 : 0) +
          (source.product_type_code === target.product_type_code ? 2500 : 0)
      );
      if (!content) continue;
      const key = `${source.id}:${target.id}`;
      const current = edgeMap.get(key);
      const collaborative = current?.collaborative_score_bps ?? 0;
      edgeMap.set(key, {
        source_product_id: source.id,
        recommended_product_id: target.id,
        score_bps: Math.min(10000, Math.round(collaborative * 0.65 + content * 0.35)),
        collaborative_score_bps: collaborative,
        content_score_bps: content,
        reason_code: current ? 'hybrid_affinity' : 'content_similarity'
      });
    }
  const rows = [...edgeMap.values()];
  if (rows.length)
    await aiRest(
      'product_recommendation_edges?on_conflict=source_product_id,recommended_product_id',
      {
        method: 'POST',
        headers: {prefer: 'resolution=merge-duplicates,return=minimal'},
        body: JSON.stringify(rows)
      }
    );
  const {data: recent} = await admin
    .from('orders')
    .select('id,profile_id')
    .not('profile_id', 'is', null)
    .in('status', ['delivered', 'completed'])
    .order('created_at', {ascending: false})
    .limit(5000);
  const recentIds = (recent ?? []).map((order) => order.id);
  const {data: recentItems} = recentIds.length
    ? await admin.from('order_items').select('order_id,product_id').in('order_id', recentIds)
    : {data: []};
  const edgesBySource = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = edgesBySource.get(row.source_product_id) ?? [];
    list.push(row);
    edgesBySource.set(row.source_product_id, list);
  }
  const recommendations = new Map<string, Map<string, number>>();
  for (const order of recent ?? [])
    for (const item of (recentItems ?? []).filter((row) => row.order_id === order.id))
      for (const edge of edgesBySource.get(item.product_id) ?? []) {
        const profile = order.profile_id!;
        const map = recommendations.get(profile) ?? new Map<string, number>();
        map.set(
          edge.recommended_product_id,
          Math.max(map.get(edge.recommended_product_id) ?? 0, edge.score_bps)
        );
        recommendations.set(profile, map);
      }
  const profileRows = [...recommendations.entries()].flatMap(([profileId, map]) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([productId, score]) => ({
        profile_id: profileId,
        product_id: productId,
        score_bps: score,
        reason_code: 'based_on_orders',
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString()
      }))
  );
  if (profileRows.length)
    await aiRest('profile_recommendations?on_conflict=profile_id,product_id', {
      method: 'POST',
      headers: {prefer: 'resolution=merge-duplicates,return=minimal'},
      body: JSON.stringify(profileRows)
    });
  return {edges: rows.length, profiles: recommendations.size, popular: popularity.size};
}

async function generateTranslation(job: AiJob) {
  if (!job.aggregate_id) throw new Error('translation_job_missing');
  const rows = await aiRest<
    Array<{
      id: string;
      source_locale_code: string;
      target_locale_code: string;
      source_content: Record<string, unknown>;
    }>
  >(`ai_translation_jobs?select=*&id=eq.${job.aggregate_id}&limit=1`);
  const translation = rows[0];
  if (!translation) throw new Error('translation_not_found');
  const glossary = await aiRest<
    Array<{source_term: string; translations: Record<string, string>; do_not_translate: boolean}>
  >(
    `ai_glossary_terms?select=source_term,translations,do_not_translate&active=eq.true&deleted_at=is.null`
  );
  const result = await runAiText({
    feature: 'translation.generate',
    messages: [
      {
        role: 'system',
        content:
          'Translate JSON values only. Preserve keys and variables like {{name}}. Glossary is binding data. Return valid JSON only.'
      },
      {
        role: 'user',
        content: JSON.stringify({
          from: translation.source_locale_code,
          to: translation.target_locale_code,
          glossary,
          content: translation.source_content
        })
      }
    ]
  });
  if (!result) {
    await aiRest(`ai_translation_jobs?id=eq.${translation.id}`, {
      method: 'PATCH',
      body: JSON.stringify({status: 'failed'})
    });
    return {fallback: true};
  }
  let proposed: Record<string, unknown>;
  try {
    proposed = JSON.parse(result.text) as Record<string, unknown>;
  } catch {
    throw new Error('translation_invalid_json');
  }
  await aiRest(`ai_translation_jobs?id=eq.${translation.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'awaiting_approval',
      proposed_content: proposed,
      glossary_snapshot: glossary
    })
  });
  return {awaitingApproval: true};
}

async function detectInsights(includeDigest = false) {
  const admin = createAdminClient();
  const now = Date.now(),
    oneDay = new Date(now - 86400000).toISOString(),
    twoDays = new Date(now - 172800000).toISOString();
  const [current, previous, currentFailures, previousFailures, currentRefunds, previousRefunds] =
    await Promise.all([
      admin
        .from('orders')
        .select('total_amount')
        .gte('created_at', oneDay)
        .in('status', ['paid', 'processing', 'partially_delivered', 'delivered', 'completed']),
      admin
        .from('orders')
        .select('total_amount')
        .gte('created_at', twoDays)
        .lt('created_at', oneDay)
        .in('status', ['paid', 'processing', 'partially_delivered', 'delivered', 'completed']),
      admin
        .from('supplier_orders')
        .select('id', {count: 'exact', head: true})
        .gte('created_at', oneDay)
        .in('status', ['failed', 'cancelled']),
      admin
        .from('supplier_orders')
        .select('id', {count: 'exact', head: true})
        .gte('created_at', twoDays)
        .lt('created_at', oneDay)
        .in('status', ['failed', 'cancelled']),
      admin
        .from('orders')
        .select('id', {count: 'exact', head: true})
        .gte('created_at', oneDay)
        .eq('status', 'refunded'),
      admin
        .from('orders')
        .select('id', {count: 'exact', head: true})
        .gte('created_at', twoDays)
        .lt('created_at', oneDay)
        .eq('status', 'refunded')
    ]);
  const currentRevenue = (current.data ?? []).reduce((sum, row) => sum + row.total_amount, 0),
    previousRevenue = (previous.data ?? []).reduce((sum, row) => sum + row.total_amount, 0);
  const anomalies: Array<Record<string, unknown>> = [];
  if (previousRevenue > 0 && currentRevenue < previousRevenue * 0.7)
    anomalies.push({
      kind: 'anomaly',
      severity: 'critical',
      metric_key: 'revenue_drop',
      title: {en: 'Revenue dropped', ar: 'انخفاض الإيرادات'},
      body: {
        en: 'Revenue is more than 30% below the previous day.',
        ar: 'الإيرادات أقل بأكثر من 30٪ من اليوم السابق.'
      },
      evidence: {current: currentRevenue, previous: previousRevenue}
    });
  if ((currentFailures.count ?? 0) >= Math.max(3, (previousFailures.count ?? 0) * 2))
    anomalies.push({
      kind: 'anomaly',
      severity: 'warning',
      metric_key: 'supplier_failure_spike',
      title: {en: 'Supplier failures increased', ar: 'ارتفاع فشل الموردين'},
      body: {
        en: 'Supplier failures are above the expected baseline.',
        ar: 'حالات فشل الموردين أعلى من المستوى المتوقع.'
      },
      evidence: {current: currentFailures.count ?? 0, previous: previousFailures.count ?? 0}
    });
  if ((currentRefunds.count ?? 0) >= Math.max(3, (previousRefunds.count ?? 0) * 2))
    anomalies.push({
      kind: 'anomaly',
      severity: 'warning',
      metric_key: 'refund_spike',
      title: {en: 'Refunds increased', ar: 'ارتفاع عمليات الاسترداد'},
      body: {
        en: 'Refunded orders are above the previous-day baseline.',
        ar: 'الطلبات المستردة أعلى من مستوى اليوم السابق.'
      },
      evidence: {current: currentRefunds.count ?? 0, previous: previousRefunds.count ?? 0}
    });
  if (anomalies.length)
    await aiRest('ai_insights', {method: 'POST', body: JSON.stringify(anomalies)});
  if (includeDigest) {
    const evidence = {
      current_revenue: currentRevenue,
      previous_revenue: previousRevenue,
      supplier_failures: currentFailures.count ?? 0,
      refunds: currentRefunds.count ?? 0,
      anomalies: anomalies.length
    };
    await aiRest('ai_insights', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'daily_digest',
        severity: anomalies.some((item) => item.severity === 'critical') ? 'critical' : 'info',
        metric_key: 'daily_operations',
        title: {en: 'Daily intelligence digest', ar: 'ملخص الذكاء اليومي'},
        body: {
          en: `Revenue ${currentRevenue}; ${currentFailures.count ?? 0} supplier failures; ${currentRefunds.count ?? 0} refunds.`,
          ar: `الإيرادات ${currentRevenue}؛ فشل الموردين ${currentFailures.count ?? 0}؛ الاستردادات ${currentRefunds.count ?? 0}.`
        },
        evidence
      })
    });
    const {data: staff} = await admin
      .from('profile_roles')
      .select('profile_id')
      .in('role', ['admin', 'owner']);
    const day = new Date().toISOString().slice(0, 10);
    await Promise.all(
      [...new Set((staff ?? []).map((row) => row.profile_id))].map((profileId) =>
        notify(
          profileId,
          'admin.ai_daily_digest',
          {admin_url: '/admin/ai'},
          {idempotencyKey: `ai-digest:${day}`, sourceType: 'ai_insight'}
        )
      )
    );
  }
  return {anomalies: anomalies.length, digest: includeDigest};
}

async function processJob(job: AiJob) {
  switch (job.kind) {
    case 'embedding.refresh':
      return refreshDocument(job);
    case 'recommendations.refresh':
      return refreshRecommendations();
    case 'risk.score':
      return scoreRisk(job.aggregate_type as 'order' | 'topup', job.aggregate_id!);
    case 'translation.generate':
      return generateTranslation(job);
    case 'insights.detect':
      return detectInsights(false);
    case 'insights.digest':
      return detectInsights(true);
    default:
      throw new Error('ai_job_kind_unknown');
  }
}

async function enqueueRecurring() {
  const now = new Date(),
    hour = now.toISOString().slice(0, 13),
    quarter = `${hour}:${String(Math.floor(now.getUTCMinutes() / 15) * 15).padStart(2, '0')}`,
    day = now.toISOString().slice(0, 10);
  await Promise.all([
    aiRest('ai_jobs', {
      method: 'POST',
      headers: {prefer: 'resolution=ignore-duplicates,return=minimal'},
      body: JSON.stringify({
        kind: 'recommendations.refresh',
        aggregate_type: 'catalog',
        priority: 40,
        idempotency_key: `hour:${hour}`
      })
    }),
    aiRest('ai_jobs', {
      method: 'POST',
      headers: {prefer: 'resolution=ignore-duplicates,return=minimal'},
      body: JSON.stringify({
        kind: 'insights.detect',
        aggregate_type: 'analytics',
        priority: 30,
        idempotency_key: `quarter:${quarter}`
      })
    }),
    aiRest('ai_jobs', {
      method: 'POST',
      headers: {prefer: 'resolution=ignore-duplicates,return=minimal'},
      body: JSON.stringify({
        kind: 'insights.digest',
        aggregate_type: 'analytics',
        priority: 20,
        idempotency_key: `day:${day}`
      })
    })
  ]);
}
export async function processAiBatch(limit = 10) {
  await enqueueRecurring();
  const workerId = `ai-${randomUUID()}`;
  const jobs = await aiRpc<AiJob[]>('claim_ai_jobs', {
    p_worker_id: workerId,
    p_limit: limit,
    p_lease_seconds: 120
  });
  let completed = 0,
    failed = 0;
  for (const job of jobs) {
    try {
      const result = await processJob(job);
      await aiRpc('complete_ai_job', {
        p_job_id: job.id,
        p_worker_id: workerId,
        p_success: true,
        p_result: result,
        p_error: null
      });
      completed++;
    } catch (cause) {
      await aiRpc('complete_ai_job', {
        p_job_id: job.id,
        p_worker_id: workerId,
        p_success: false,
        p_result: {},
        p_error: cause instanceof Error ? cause.message : 'unknown'
      });
      failed++;
    }
  }
  return {claimed: jobs.length, completed, failed};
}
