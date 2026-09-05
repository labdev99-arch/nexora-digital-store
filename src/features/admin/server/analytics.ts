import 'server-only';

import {createAdminClient} from '@/lib/supabase/admin';
import type {Json} from '@/lib/supabase/database.types';

type AuditActivityRow = {
  id: string;
  action: string;
  resource_type: string;
  created_at: string;
};

type CurrencyRate = {code: string; exchange_rate_minor: number; rate_scale: number};
type NamedValue = {name: string; value: number};

export type AdminActivity = {
  id: string;
  kind: 'audit' | 'order';
  title: string;
  detail: string;
  createdAt: string;
};

export type AdminDashboardData = {
  currency: string;
  revenue: number;
  grossProfit: number;
  marginBps: number;
  averageOrderValue: number;
  refundRateBps: number;
  walletFloat: number;
  pendingManual: number;
  newCustomers: number;
  returningCustomers: number;
  orderStatuses: NamedValue[];
  funnel: NamedValue[];
  topProducts: NamedValue[];
  topCategories: NamedValue[];
  paymentMethods: NamedValue[];
  supplierReliability: Array<{name: string; reliability: number; balance?: number}>;
  dailyRevenue: Array<{date: string; revenue: number; profit: number}>;
  activity: AdminActivity[];
};

export type RetentionData = {
  cohorts: Array<{cohort: string; customers: number; retention: number[]}>;
  ltv: Array<{customerId: string; orders: number; value: number; lastOrderAt: string}>;
  averageLtv: number;
  activeCustomers: number;
  churnedCustomers: number;
  churnRateBps: number;
};

function localized(value: Json | null, locale: string): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '—';
  const record = value as Record<string, Json | undefined>;
  const direct = record[locale] ?? record.en ?? record.ar;
  return typeof direct === 'string' ? direct : '—';
}

function convertAmount(
  amount: number,
  from: string,
  to: string,
  rates: Map<string, CurrencyRate>
): number {
  if (from === to) return amount;
  const source = rates.get(from);
  const target = rates.get(to);
  if (!source || !target || source.exchange_rate_minor <= 0) return amount;
  const sourceScale = 10 ** source.rate_scale;
  const targetScale = 10 ** target.rate_scale;
  const base = (amount * sourceScale) / source.exchange_rate_minor;
  return Math.round((base * target.exchange_rate_minor) / targetScale);
}

function bump(map: Map<string, number>, key: string, value: number) {
  map.set(key, (map.get(key) ?? 0) + value);
}

function top(map: Map<string, number>, limit = 6): NamedValue[] {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([name, value]) => ({name, value}));
}

export async function getAdminDashboard({
  from,
  to,
  currency,
  locale
}: {
  from: Date;
  to: Date;
  currency: string;
  locale: string;
}): Promise<AdminDashboardData> {
  const admin = createAdminClient();
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const [
    currenciesResult,
    ordersResult,
    allCustomerOrdersResult,
    itemsResult,
    supplierOrdersResult,
    cartsResult,
    paymentsResult,
    suppliersResult,
    walletsResult,
    manualResult,
    productsResult,
    categoriesResult,
    auditResult,
    eventsResult
  ] = await Promise.all([
    admin.from('currencies').select('code,exchange_rate_minor,rate_scale').eq('enabled', true),
    admin
      .from('orders')
      .select('id,profile_id,status,currency_code,total_amount,refunded_amount,created_at')
      .gte('created_at', fromIso)
      .lt('created_at', toIso)
      .limit(10000),
    admin
      .from('orders')
      .select('profile_id,created_at,status,total_amount,currency_code')
      .not('profile_id', 'is', null)
      .limit(20000),
    admin.from('order_items').select('order_id,product_id,total_amount,quantity').limit(20000),
    admin
      .from('supplier_orders')
      .select('order_id,cost_amount,cost_currency_code,status')
      .gte('created_at', fromIso)
      .lt('created_at', toIso)
      .limit(10000),
    admin
      .from('carts')
      .select('status,created_at')
      .gte('created_at', fromIso)
      .lt('created_at', toIso)
      .limit(10000),
    admin
      .from('payments')
      .select('provider_code,status,credited_amount,refunded_amount,currency_code,created_at')
      .gte('created_at', fromIso)
      .lt('created_at', toIso)
      .limit(10000),
    admin
      .from('suppliers')
      .select('name,success_count,failure_count,partial_count,health_status')
      .is('deleted_at', null)
      .limit(1000),
    admin
      .from('wallets')
      .select('account_type,currency_code,cached_balance')
      .eq('account_type', 'customer')
      .limit(20000),
    admin
      .from('manual_fulfillment_tasks')
      .select('status')
      .in('status', ['queued', 'claimed', 'in_progress', 'waiting_customer', 'sla_breached'])
      .limit(10000),
    admin.from('products').select('id,category_id,name').limit(10000),
    admin.from('categories').select('id,name').limit(10000),
    admin
      .from('audit_logs')
      .select('id,action,resource_type,created_at')
      .order('created_at', {ascending: false})
      .limit(15),
    admin
      .from('order_events')
      .select('id,to_status,order_id,created_at')
      .order('created_at', {ascending: false})
      .limit(15)
  ]);
  const errors = [currenciesResult, ordersResult, itemsResult, supplierOrdersResult].flatMap(
    (result) => (result.error ? [result.error.message] : [])
  );
  if (errors.length > 0) throw new Error(errors.join('; '));

  const rates = new Map((currenciesResult.data ?? []).map((rate) => [rate.code, rate]));
  const orders = ordersResult.data ?? [];
  const revenueStatuses = new Set([
    'paid',
    'processing',
    'partially_delivered',
    'delivered',
    'completed'
  ]);
  const orderById = new Map(orders.map((order) => [order.id, order]));
  let revenue = 0;
  let refunded = 0;
  const orderStatuses = new Map<string, number>();
  const daily = new Map<string, {revenue: number; cost: number}>();
  for (const order of orders) {
    bump(orderStatuses, order.status, 1);
    if (!revenueStatuses.has(order.status)) continue;
    const converted = convertAmount(order.total_amount, order.currency_code, currency, rates);
    const convertedRefund = convertAmount(
      order.refunded_amount,
      order.currency_code,
      currency,
      rates
    );
    revenue += converted;
    refunded += convertedRefund;
    const date = order.created_at.slice(0, 10);
    const bucket = daily.get(date) ?? {revenue: 0, cost: 0};
    bucket.revenue += converted;
    daily.set(date, bucket);
  }
  let supplierCost = 0;
  for (const supplierOrder of supplierOrdersResult.data ?? []) {
    if (!orderById.has(supplierOrder.order_id)) continue;
    const cost = convertAmount(
      supplierOrder.cost_amount,
      supplierOrder.cost_currency_code,
      currency,
      rates
    );
    supplierCost += cost;
    const order = orderById.get(supplierOrder.order_id);
    if (order) {
      const bucket = daily.get(order.created_at.slice(0, 10)) ?? {revenue: 0, cost: 0};
      bucket.cost += cost;
      daily.set(order.created_at.slice(0, 10), bucket);
    }
  }
  const productById = new Map((productsResult.data ?? []).map((product) => [product.id, product]));
  const categoryById = new Map(
    (categoriesResult.data ?? []).map((category) => [category.id, localized(category.name, locale)])
  );
  const productTotals = new Map<string, number>();
  const categoryTotals = new Map<string, number>();
  for (const item of itemsResult.data ?? []) {
    const order = orderById.get(item.order_id);
    if (!order || !revenueStatuses.has(order.status)) continue;
    const value = convertAmount(item.total_amount, order.currency_code, currency, rates);
    const product = productById.get(item.product_id);
    bump(productTotals, localized(product?.name ?? null, locale), value);
    bump(categoryTotals, categoryById.get(product?.category_id ?? '') ?? '—', value);
  }
  const paymentTotals = new Map<string, number>();
  for (const payment of paymentsResult.data ?? []) {
    if (!['paid', 'partially_refunded', 'refunded'].includes(payment.status)) continue;
    bump(
      paymentTotals,
      payment.provider_code,
      convertAmount(payment.credited_amount, payment.currency_code, currency, rates)
    );
  }
  let walletFloat = 0;
  for (const wallet of walletsResult.data ?? []) {
    walletFloat += convertAmount(wallet.cached_balance, wallet.currency_code, currency, rates);
  }

  const customersInRange = new Set(orders.map((order) => order.profile_id).filter(Boolean));
  const firstOrder = new Map<string, string>();
  for (const order of allCustomerOrdersResult.data ?? []) {
    if (!order.profile_id) continue;
    const current = firstOrder.get(order.profile_id);
    if (!current || order.created_at < current) firstOrder.set(order.profile_id, order.created_at);
  }
  let newCustomers = 0;
  let returningCustomers = 0;
  for (const customer of customersInRange) {
    if (!customer) continue;
    const first = firstOrder.get(customer);
    if (first && first >= fromIso && first < toIso) newCustomers += 1;
    else returningCustomers += 1;
  }
  const paidOrders = orders.filter((order) => revenueStatuses.has(order.status)).length;
  const grossProfit = revenue - supplierCost;
  const auditEvents = (auditResult.data ?? []) as unknown as AuditActivityRow[];
  const activities: AdminActivity[] = [
    ...auditEvents.map((event) => ({
      id: event.id,
      kind: 'audit' as const,
      title: event.action,
      detail: event.resource_type,
      createdAt: event.created_at
    })),
    ...(eventsResult.data ?? []).map((event) => ({
      id: event.id,
      kind: 'order' as const,
      title: event.to_status,
      detail: event.order_id,
      createdAt: event.created_at
    }))
  ]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 20);

  return {
    currency,
    revenue,
    grossProfit,
    marginBps: revenue > 0 ? Math.round((grossProfit * 10000) / revenue) : 0,
    averageOrderValue: paidOrders > 0 ? Math.round(revenue / paidOrders) : 0,
    refundRateBps: revenue > 0 ? Math.round((refunded * 10000) / revenue) : 0,
    walletFloat,
    pendingManual: manualResult.data?.length ?? 0,
    newCustomers,
    returningCustomers,
    orderStatuses: top(orderStatuses, 20),
    funnel: [
      {name: 'carts', value: cartsResult.data?.length ?? 0},
      {name: 'checkout', value: orders.length},
      {name: 'paid', value: paidOrders},
      {
        name: 'delivered',
        value: orders.filter((order) => ['delivered', 'completed'].includes(order.status)).length
      }
    ],
    topProducts: top(productTotals),
    topCategories: top(categoryTotals),
    paymentMethods: top(paymentTotals),
    supplierReliability: (suppliersResult.data ?? []).map((supplier) => {
      const total = supplier.success_count + supplier.failure_count + supplier.partial_count;
      return {
        name: supplier.name,
        reliability: total > 0 ? Math.round((supplier.success_count * 10000) / total) : 10000
      };
    }),
    dailyRevenue: [...daily.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, value]) => ({date, revenue: value.revenue, profit: value.revenue - value.cost})),
    activity: activities
  };
}

function monthKey(value: string): string {
  return value.slice(0, 7);
}

function monthDistance(from: string, to: string): number {
  const [fromYear = 0, fromMonth = 1] = from.split('-').map(Number);
  const [toYear = 0, toMonth = 1] = to.split('-').map(Number);
  return (toYear - fromYear) * 12 + toMonth - fromMonth;
}

export async function getRetentionData(currency: string): Promise<RetentionData> {
  const admin = createAdminClient();
  const [ordersResult, currenciesResult] = await Promise.all([
    admin
      .from('orders')
      .select('profile_id,status,total_amount,currency_code,created_at')
      .not('profile_id', 'is', null)
      .order('created_at')
      .limit(30000),
    admin.from('currencies').select('code,exchange_rate_minor,rate_scale').eq('enabled', true)
  ]);
  if (ordersResult.error) throw new Error(ordersResult.error.message);
  const rates = new Map((currenciesResult.data ?? []).map((rate) => [rate.code, rate]));
  const valid = (ordersResult.data ?? []).filter((order) =>
    ['paid', 'processing', 'partially_delivered', 'delivered', 'completed'].includes(order.status)
  );
  const customers = new Map<
    string,
    {orders: typeof valid; first: string; last: string; value: number}
  >();
  for (const order of valid) {
    if (!order.profile_id) continue;
    const entry = customers.get(order.profile_id) ?? {
      orders: [],
      first: order.created_at,
      last: order.created_at,
      value: 0
    };
    entry.orders.push(order);
    if (order.created_at < entry.first) entry.first = order.created_at;
    if (order.created_at > entry.last) entry.last = order.created_at;
    entry.value += convertAmount(order.total_amount, order.currency_code, currency, rates);
    customers.set(order.profile_id, entry);
  }
  const cohortMap = new Map<string, Array<{months: Set<number>}>>();
  for (const entry of customers.values()) {
    const cohort = monthKey(entry.first);
    const months = new Set(
      entry.orders.map((order) => monthDistance(cohort, monthKey(order.created_at)))
    );
    const bucket = cohortMap.get(cohort) ?? [];
    bucket.push({months});
    cohortMap.set(cohort, bucket);
  }
  const now = Date.now();
  const churnBoundary = now - 90 * 24 * 60 * 60 * 1000;
  const ltv = [...customers.entries()]
    .map(([customerId, entry]) => ({
      customerId,
      orders: entry.orders.length,
      value: entry.value,
      lastOrderAt: entry.last
    }))
    .sort((left, right) => right.value - left.value);
  const churnedCustomers = ltv.filter(
    (customer) => new Date(customer.lastOrderAt).getTime() < churnBoundary
  ).length;
  return {
    cohorts: [...cohortMap.entries()]
      .sort(([left], [right]) => right.localeCompare(left))
      .slice(0, 12)
      .map(([cohort, members]) => ({
        cohort,
        customers: members.length,
        retention: Array.from({length: 12}, (_, month) =>
          Math.round(
            (members.filter((member) => member.months.has(month)).length * 10000) / members.length
          )
        )
      })),
    ltv: ltv.slice(0, 100),
    averageLtv:
      ltv.length > 0 ? Math.round(ltv.reduce((sum, item) => sum + item.value, 0) / ltv.length) : 0,
    activeCustomers: ltv.length - churnedCustomers,
    churnedCustomers,
    churnRateBps: ltv.length > 0 ? Math.round((churnedCustomers * 10000) / ltv.length) : 0
  };
}
