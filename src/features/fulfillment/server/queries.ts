import 'server-only';

import {createAdminClient} from '@/lib/supabase/admin';

export async function getFulfillmentDashboard() {
  const admin = createAdminClient();
  const [jobs, deadLetters, tasks, suppliers, codes, variants, reliability, performance] =
    await Promise.all([
      admin.from('fulfillment_jobs').select('*').order('created_at', {ascending: false}).limit(50),
      admin
        .from('fulfillment_dead_letters')
        .select('*')
        .is('resolved_at', null)
        .order('created_at', {ascending: false})
        .limit(20),
      admin.from('manual_fulfillment_tasks').select('*').order('sla_due_at').limit(100),
      admin.from('suppliers').select('*').is('deleted_at', null).order('priority'),
      admin.from('stock_codes').select('variant_id,status').limit(10_000),
      admin
        .from('product_variants')
        .select('id,sku,name')
        .eq('active', true)
        .is('deleted_at', null)
        .order('sku'),
      admin.from('supplier_reliability').select('*').order('reliability_bps', {ascending: false}),
      admin
        .from('fulfiller_performance')
        .select('*')
        .order('completed_tasks', {ascending: false})
        .limit(20)
    ]);
  const stockByVariant = new Map<string, {available: number; assigned: number}>();
  for (const code of codes.data ?? []) {
    const value = stockByVariant.get(code.variant_id) ?? {available: 0, assigned: 0};
    if (code.status === 'available') value.available += 1;
    if (code.status === 'assigned') value.assigned += 1;
    stockByVariant.set(code.variant_id, value);
  }
  return {
    jobs: jobs.data ?? [],
    deadLetters: deadLetters.data ?? [],
    tasks: tasks.data ?? [],
    suppliers: suppliers.data ?? [],
    variants: (variants.data ?? []).map((variant) => ({
      ...variant,
      stock: stockByVariant.get(variant.id) ?? {available: 0, assigned: 0}
    })),
    reliability: reliability.data ?? [],
    performance: performance.data ?? []
  };
}
