import 'server-only';

import {randomUUID} from 'node:crypto';

import {encryptOrderPayload} from '@/features/commerce/server/payload-crypto';
import {createAdminClient} from '@/lib/supabase/admin';
import type {
  FulfillmentJobDbRow,
  Json,
  OrderStatus,
  SupplierDbRow,
  SupplierOrderDbRow,
  SupplierProductDbRow
} from '@/lib/supabase/database.types';
import {getSupplierDriver} from './drivers/registry';
import {SupplierError, type SupplierOrderResult} from './drivers/supplier-driver';
import {decryptSupplierSecret} from './supplier-crypto';

type WorkSummary = {processed: number; completed: number; retried: number; deadLettered: number};

function asObject(value: Json): Record<string, Json | undefined> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function firstTarget(value: Json) {
  const fields = asObject(value);
  for (const key of ['target', 'profile_url', 'player_id', 'email', 'username']) {
    if (typeof fields[key] === 'string' && fields[key]) return fields[key];
  }
  return 'not-required';
}

function safeError(error: unknown) {
  if (error instanceof SupplierError) return {code: error.code, safe: error.message};
  if (error instanceof Error) return {code: 'fulfillment_error', safe: error.message.slice(0, 500)};
  return {code: 'fulfillment_error', safe: 'Unknown fulfillment failure'};
}

async function transition(orderId: string, to: OrderStatus, source: string, metadata: Json = {}) {
  const admin = createAdminClient();
  const {error} = await admin.rpc('transition_order_status', {
    p_order_id: orderId,
    p_to: to,
    p_actor_type: 'system',
    p_source: source,
    p_metadata: metadata
  });
  if (error && !error.message.includes('order_illegal_transition')) throw new Error(error.message);
}

async function refreshOrderDeliveryStatus(orderId: string) {
  const admin = createAdminClient();
  const [{data: order}, {data: items}] = await Promise.all([
    admin.from('orders').select('id,status').eq('id', orderId).single(),
    admin.from('order_items').select('quantity,delivered_quantity').eq('order_id', orderId)
  ]);
  if (!order || !items?.length) return;
  const all = items.every((item) => item.delivered_quantity >= item.quantity);
  const some = items.some((item) => item.delivered_quantity > 0);
  if (all && ['paid', 'processing', 'partially_delivered'].includes(order.status)) {
    if (order.status === 'paid') await transition(orderId, 'processing', 'fulfillment_worker');
    await transition(orderId, 'delivered', 'fulfillment_worker');
  } else if (some && order.status === 'processing') {
    await transition(orderId, 'partially_delivered', 'fulfillment_worker');
  }
}

async function recordSupplierHealth(
  supplier: SupplierDbRow,
  succeeded: boolean,
  latencyMs: number
) {
  const admin = createAdminClient();
  const failures = succeeded ? 0 : supplier.consecutive_failures + 1;
  const opens = failures >= 5;
  await admin
    .from('suppliers')
    .update({
      consecutive_failures: failures,
      success_count: supplier.success_count + (succeeded ? 1 : 0),
      failure_count: supplier.failure_count + (succeeded ? 0 : 1),
      health_status: opens ? 'open' : succeeded ? 'healthy' : 'degraded',
      average_latency_ms: supplier.average_latency_ms
        ? Math.round(supplier.average_latency_ms * 0.8 + latencyMs * 0.2)
        : latencyMs,
      last_health_check_at: new Date().toISOString()
    })
    .eq('id', supplier.id);
  await admin.from('supplier_circuits').upsert(
    {
      supplier_id: supplier.id,
      operation: 'place_order',
      state: opens ? 'open' : 'closed',
      failure_count: failures,
      success_count: supplier.success_count + (succeeded ? 1 : 0),
      opened_at: opens ? new Date().toISOString() : null,
      probe_after: opens ? new Date(Date.now() + 5 * 60_000).toISOString() : null
    },
    {onConflict: 'supplier_id,operation'}
  );
}

async function insertDelivery(
  orderId: string,
  orderItemId: string,
  payload: string,
  displayHint: string | null,
  quantity: number
) {
  const admin = createAdminClient();
  const {error: deliveryError} = await admin.from('order_deliveries').insert({
    order_id: orderId,
    order_item_id: orderItemId,
    kind: 'code',
    payload_ciphertext: payload,
    display_hint: displayHint
  });
  if (deliveryError) throw new Error('delivery_insert_failed');
  const {data: item} = await admin
    .from('order_items')
    .select('delivered_quantity,quantity')
    .eq('id', orderItemId)
    .single();
  if (!item) throw new Error('order_item_missing');
  const delivered = Math.min(item.quantity, item.delivered_quantity + quantity);
  const {error} = await admin
    .from('order_items')
    .update({delivered_quantity: delivered})
    .eq('id', orderItemId)
    .eq('delivered_quantity', item.delivered_quantity);
  if (error) throw new Error('delivery_counter_update_failed');
}

async function tryStockCode(orderId: string, itemId: string) {
  const admin = createAdminClient();
  const {data: code, error} = await admin.rpc('assign_stock_code', {p_order_item_id: itemId});
  if (error || !code) return false;
  await insertDelivery(orderId, itemId, code.payload_ciphertext, code.display_hint, 1);
  const {count: priorAttempts} = await admin
    .from('fulfillment_attempts')
    .select('id', {count: 'exact', head: true})
    .eq('order_item_id', itemId);
  await admin.from('fulfillment_attempts').insert({
    order_id: orderId,
    order_item_id: itemId,
    stock_code_id: code.id,
    attempt_number: (priorAttempts ?? 0) + 1,
    status: 'succeeded',
    finished_at: new Date().toISOString()
  });
  return true;
}

async function supplierCandidates(variantId: string, quantity: number) {
  const admin = createAdminClient();
  const {data: products} = await admin
    .from('supplier_products')
    .select('*')
    .eq('variant_id', variantId)
    .eq('active', true)
    .is('deleted_at', null)
    .lte('minimum_quantity', quantity)
    .order('priority');
  const candidates: Array<{mapping: SupplierProductDbRow; supplier: SupplierDbRow}> = [];
  for (const mapping of products ?? []) {
    if (mapping.maximum_quantity !== null && mapping.maximum_quantity < quantity) continue;
    const {data: supplier} = await admin
      .from('suppliers')
      .select('*')
      .eq('id', mapping.supplier_id)
      .eq('enabled', true)
      .is('deleted_at', null)
      .maybeSingle();
    if (!supplier || supplier.health_status === 'disabled') continue;
    const {data: circuit} = await admin
      .from('supplier_circuits')
      .select('*')
      .eq('supplier_id', supplier.id)
      .eq('operation', 'place_order')
      .maybeSingle();
    const probeDue =
      !circuit?.probe_after || new Date(String(circuit.probe_after)).getTime() <= Date.now();
    if (supplier.health_status === 'open' && !probeDue) continue;
    candidates.push({mapping, supplier});
  }
  return candidates.sort(
    (left, right) =>
      left.supplier.priority +
      left.mapping.priority -
      (right.supplier.priority + right.mapping.priority)
  );
}

async function persistSupplierResult(
  supplierOrder: SupplierOrderDbRow,
  supplier: SupplierDbRow,
  result: SupplierOrderResult,
  latencyMs: number
) {
  const admin = createAdminClient();
  await admin
    .from('supplier_orders')
    .update({
      external_order_id: result.externalOrderId,
      status: result.status,
      delivered_quantity: result.deliveredQuantity,
      response_safe: result.safeResponse,
      cost_amount: result.costAmount ?? supplierOrder.cost_amount,
      placed_at: new Date().toISOString(),
      completed_at: result.status === 'completed' ? new Date().toISOString() : null,
      last_checked_at: new Date().toISOString(),
      next_poll_at: ['submitted', 'processing', 'partial'].includes(result.status)
        ? new Date(Date.now() + 30_000).toISOString()
        : null
    })
    .eq('id', supplierOrder.id);
  await admin.from('supplier_order_events').insert({
    supplier_order_id: supplierOrder.id,
    from_status: 'queued',
    to_status: result.status,
    delivered_quantity: result.deliveredQuantity,
    response_safe: result.safeResponse
  });
  await recordSupplierHealth(supplier, result.status !== 'failed', latencyMs);
  if (result.status === 'partial') {
    await admin
      .from('suppliers')
      .update({partial_count: supplier.partial_count + 1})
      .eq('id', supplier.id);
  }
}

async function placeWithFailover(
  orderId: string,
  item: {
    id: string;
    variant_id: string;
    quantity: number;
    option_values: Json;
  }
) {
  const admin = createAdminClient();
  const candidates = await supplierCandidates(item.variant_id, item.quantity);
  let lastError: unknown = new Error('supplier_mapping_unavailable');
  for (const {mapping, supplier} of candidates) {
    const idempotencyKey = `supplier:${item.id}:${supplier.id}`;
    const {data: existing} = await admin
      .from('supplier_orders')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (existing && existing.status !== 'failed') return existing;
    const {data: supplierOrder, error: createError} = existing
      ? {data: existing, error: null}
      : await admin
          .from('supplier_orders')
          .insert({
            supplier_id: supplier.id,
            supplier_product_id: mapping.id,
            order_id: orderId,
            order_item_id: item.id,
            idempotency_key: idempotencyKey,
            requested_quantity: item.quantity,
            target_ciphertext: encryptOrderPayload(firstTarget(item.option_values)),
            request_safe: {service: mapping.external_service_id, quantity: item.quantity},
            cost_amount: mapping.cost_amount * item.quantity,
            cost_currency_code: mapping.cost_currency_code
          })
          .select('*')
          .single();
    if (createError || !supplierOrder) throw new Error('supplier_order_create_failed');
    const started = Date.now();
    try {
      const driver = getSupplierDriver(supplier.driver);
      const result = await driver.placeOrder(
        {
          idempotencyKey,
          externalServiceId: mapping.external_service_id,
          quantity: item.quantity,
          target: firstTarget(item.option_values),
          options: item.option_values
        },
        {
          endpoint: supplier.endpoint,
          apiKey: decryptSupplierSecret(supplier.api_key_ciphertext),
          sandbox: supplier.sandbox_mode,
          settings: supplier.settings
        }
      );
      await persistSupplierResult(supplierOrder, supplier, result, Date.now() - started);
      const {count: priorAttempts} = await admin
        .from('fulfillment_attempts')
        .select('id', {count: 'exact', head: true})
        .eq('order_item_id', item.id);
      await admin.from('fulfillment_attempts').insert({
        order_id: orderId,
        order_item_id: item.id,
        supplier_order_id: supplierOrder.id,
        attempt_number: (priorAttempts ?? 0) + 1,
        status:
          result.status === 'failed'
            ? 'failed'
            : result.status === 'completed'
              ? 'succeeded'
              : 'running',
        finished_at: ['failed', 'completed'].includes(result.status)
          ? new Date().toISOString()
          : null
      });
      if (result.status === 'failed')
        throw new SupplierError('supplier_rejected', false, 'Supplier rejected order');
      if (result.deliveryPayload) {
        await insertDelivery(
          orderId,
          item.id,
          encryptOrderPayload(result.deliveryPayload),
          result.deliveryPayload.slice(-4).padStart(result.deliveryPayload.length, '•'),
          Math.max(1, result.deliveredQuantity)
        );
      } else if (result.status === 'completed' || result.status === 'partial') {
        const {data: current} = await admin
          .from('order_items')
          .select('*')
          .eq('id', item.id)
          .single();
        if (current)
          await admin
            .from('order_items')
            .update({
              delivered_quantity:
                result.status === 'completed'
                  ? current.quantity
                  : Math.min(current.quantity, result.deliveredQuantity)
            })
            .eq('id', current.id);
      }
      if (['submitted', 'processing', 'partial'].includes(result.status)) {
        await admin.from('fulfillment_jobs').insert({
          kind: 'poll.supplier_order',
          aggregate_type: 'supplier_order',
          aggregate_id: supplierOrder.id,
          payload: {supplier_order_id: supplierOrder.id},
          run_at: new Date(Date.now() + 30_000).toISOString(),
          idempotency_key: `poll:${supplierOrder.id}`
        });
      }
      return supplierOrder;
    } catch (error) {
      lastError = error;
      await admin
        .from('supplier_orders')
        .update({status: 'failed', response_safe: {error: safeError(error).code}})
        .eq('id', supplierOrder.id);
      await recordSupplierHealth(supplier, false, Date.now() - started);
    }
  }
  throw lastError;
}

async function fulfillOrder(job: FulfillmentJobDbRow) {
  const admin = createAdminClient();
  const {data: order} = await admin.from('orders').select('*').eq('id', job.aggregate_id).single();
  if (!order) throw new Error('order_not_found');
  if (['delivered', 'completed', 'refunded', 'cancelled'].includes(order.status))
    return {orderId: order.id};
  if (order.status === 'paid') await transition(order.id, 'processing', 'fulfillment_worker');
  const {data: items} = await admin
    .from('order_items')
    .select('*')
    .eq('order_id', order.id)
    .order('created_at');
  for (const item of items ?? []) {
    if (item.delivered_quantity >= item.quantity) continue;
    if (item.fulfillment_mode === 'manual') {
      await admin.rpc('create_manual_fulfillment_task', {p_order_item_id: item.id});
      continue;
    }
    let delivered = false;
    try {
      let stockDelivered = item.delivered_quantity;
      while (stockDelivered < item.quantity) {
        const assigned = await tryStockCode(order.id, item.id);
        if (!assigned) break;
        stockDelivered += 1;
      }
      delivered = stockDelivered >= item.quantity;
      if (!delivered && stockDelivered === item.delivered_quantity) {
        await placeWithFailover(order.id, item);
        delivered = true;
      } else if (!delivered) {
        throw new Error('stock_code_unavailable');
      }
    } catch (error) {
      if (item.fulfillment_mode === 'auto_then_manual') {
        const detail = safeError(error);
        await admin.rpc('create_manual_fulfillment_task', {
          p_order_item_id: item.id,
          p_failure_context: {error_code: detail.code, error_safe: detail.safe}
        });
      } else {
        throw error;
      }
    }
  }
  await refreshOrderDeliveryStatus(order.id);
  return {orderId: order.id};
}

async function pollSupplierOrder(job: FulfillmentJobDbRow) {
  const admin = createAdminClient();
  const {data: supplierOrder} = await admin
    .from('supplier_orders')
    .select('*')
    .eq('id', job.aggregate_id)
    .single();
  if (!supplierOrder || !supplierOrder.external_order_id)
    throw new Error('supplier_order_not_ready');
  if (['completed', 'cancelled', 'failed'].includes(supplierOrder.status))
    return {supplierOrderId: supplierOrder.id};
  const {data: supplier} = await admin
    .from('suppliers')
    .select('*')
    .eq('id', supplierOrder.supplier_id)
    .single();
  if (!supplier) throw new Error('supplier_not_found');
  const driver = getSupplierDriver(supplier.driver);
  const result = await driver.checkStatus(supplierOrder.external_order_id, {
    endpoint: supplier.endpoint,
    apiKey: decryptSupplierSecret(supplier.api_key_ciphertext),
    sandbox: supplier.sandbox_mode,
    settings: supplier.settings
  });
  await admin
    .from('supplier_orders')
    .update({
      status: result.status,
      delivered_quantity: result.deliveredQuantity,
      response_safe: result.safeResponse,
      cost_amount: result.costAmount ?? supplierOrder.cost_amount,
      completed_at: result.status === 'completed' ? new Date().toISOString() : null,
      last_checked_at: new Date().toISOString(),
      next_poll_at: ['submitted', 'processing', 'partial'].includes(result.status)
        ? new Date(Date.now() + 30_000).toISOString()
        : null
    })
    .eq('id', supplierOrder.id);
  if (result.deliveryPayload) {
    await insertDelivery(
      supplierOrder.order_id,
      supplierOrder.order_item_id,
      encryptOrderPayload(result.deliveryPayload),
      `••••${result.deliveryPayload.slice(-4)}`,
      Math.max(1, result.deliveredQuantity)
    );
  } else if (result.status === 'completed' || result.status === 'partial') {
    const {data: item} = await admin
      .from('order_items')
      .select('*')
      .eq('id', supplierOrder.order_item_id)
      .single();
    if (item)
      await admin
        .from('order_items')
        .update({
          delivered_quantity:
            result.status === 'completed'
              ? item.quantity
              : Math.min(item.quantity, result.deliveredQuantity)
        })
        .eq('id', item.id);
  }
  await refreshOrderDeliveryStatus(supplierOrder.order_id);
  if (['submitted', 'processing', 'partial'].includes(result.status)) {
    const nextRun = new Date(Date.now() + 30_000).toISOString();
    await admin.from('fulfillment_jobs').insert({
      kind: 'poll.supplier_order',
      aggregate_type: 'supplier_order',
      aggregate_id: supplierOrder.id,
      payload: {supplier_order_id: supplierOrder.id},
      run_at: nextRun,
      idempotency_key: `poll:${supplierOrder.id}:${nextRun}`
    });
    return {supplierOrderId: supplierOrder.id, status: result.status};
  }
  if (result.status === 'failed')
    throw new SupplierError('supplier_order_failed', false, 'Supplier order failed');
  return {supplierOrderId: supplierOrder.id, status: result.status};
}

async function processJob(job: FulfillmentJobDbRow): Promise<Json> {
  if (job.kind === 'fulfill.order') return fulfillOrder(job);
  if (job.kind === 'poll.supplier_order') return pollSupplierOrder(job);
  if (job.kind === 'inventory.sweep') {
    const admin = createAdminClient();
    const {data, error} = await admin.rpc('expire_stock_codes_and_alert');
    if (error) throw new Error(error.message);
    return data;
  }
  throw new Error(`fulfillment_job_unknown:${job.kind}`);
}

export async function runFulfillmentWorker(limit = 10): Promise<WorkSummary> {
  const admin = createAdminClient();
  const {error: inventoryError} = await admin.rpc('expire_stock_codes_and_alert');
  if (inventoryError) throw new Error(inventoryError.message);
  const workerId = `worker-${randomUUID()}`;
  const {data: jobs, error} = await admin.rpc('claim_fulfillment_jobs', {
    p_worker_id: workerId,
    p_limit: limit,
    p_lease_seconds: 120
  });
  if (error) throw new Error(error.message);
  const summary: WorkSummary = {processed: 0, completed: 0, retried: 0, deadLettered: 0};
  for (const job of jobs ?? []) {
    summary.processed += 1;
    try {
      const result = await processJob(job);
      const {error: finishError} = await admin.rpc('finish_fulfillment_job', {
        p_job_id: job.id,
        p_worker_id: workerId,
        p_succeeded: true,
        p_result: result
      });
      if (finishError) throw new Error(finishError.message);
      summary.completed += 1;
    } catch (caught) {
      const detail = safeError(caught);
      const {data: failed, error: finishError} = await admin.rpc('finish_fulfillment_job', {
        p_job_id: job.id,
        p_worker_id: workerId,
        p_succeeded: false,
        p_error_code: detail.code,
        p_error_safe: detail.safe
      });
      if (finishError) throw new Error(finishError.message);
      if (failed.status === 'dead_letter') {
        summary.deadLettered += 1;
        if (job.kind === 'fulfill.order') {
          await admin.rpc('refund_unrecoverable_order', {
            p_order_id: job.aggregate_id,
            p_reason: 'Automatic fulfillment failed after all retry attempts'
          });
        }
      } else summary.retried += 1;
    }
  }
  return summary;
}
