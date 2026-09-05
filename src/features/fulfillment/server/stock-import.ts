import 'server-only';

import {createHash, createHmac} from 'node:crypto';

import {createAdminClient} from '@/lib/supabase/admin';
import {encryptOrderPayload} from '@/features/commerce/server/payload-crypto';
import {stockImportSchema} from '../schemas/fulfillment';

function parseCsv(input: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"' && quoted && input[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) {
      row.push(field.trim());
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && input[index + 1] === '\n') index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
    } else field += character;
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function codeHash(value: string) {
  const key = process.env.ORDER_PAYLOAD_ENCRYPTION_KEY;
  if (!key || key.length < 32) throw new Error('order_payload_key_missing');
  return createHmac('sha256', key).update(value).digest('hex');
}

export async function importStockCodes(actorId: string, raw: unknown) {
  const input = stockImportSchema.parse(raw);
  const rows = parseCsv(input.csv);
  const first = rows[0]?.map((value) => value.toLowerCase());
  const hasHeader = first?.includes('code') ?? false;
  const codeIndex = hasHeader ? Math.max(0, first?.indexOf('code') ?? 0) : 0;
  const expiryIndex = hasHeader ? (first?.indexOf('expires_at') ?? -1) : 1;
  const hintIndex = hasHeader ? (first?.indexOf('display_hint') ?? -1) : 2;
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const admin = createAdminClient();
  const {data: batch, error: batchError} = await admin
    .from('stock_code_import_batches')
    .insert({
      variant_id: input.variantId,
      filename: input.filename,
      total_rows: dataRows.length,
      imported_by: actorId
    })
    .select('*')
    .single();
  if (batchError || !batch) throw new Error('stock_import_batch_failed');
  let imported = 0;
  let duplicates = 0;
  const rejected: Array<{row: number; reason: string}> = [];
  const seen = new Set<string>();
  for (let offset = 0; offset < dataRows.length; offset += 250) {
    const inserts: Array<{
      variant_id: string;
      import_batch_id: string;
      payload_ciphertext: string;
      payload_hash: string;
      display_hint: string | null;
      expires_at: string | null;
    }> = [];
    for (const [relativeIndex, row] of dataRows.slice(offset, offset + 250).entries()) {
      const code = row[codeIndex]?.trim();
      if (!code || code.length > 10_000) {
        rejected.push({row: offset + relativeIndex + (hasHeader ? 2 : 1), reason: 'invalid_code'});
        continue;
      }
      const hash = codeHash(code);
      if (seen.has(hash)) {
        duplicates += 1;
        continue;
      }
      seen.add(hash);
      const expiryText = expiryIndex >= 0 ? row[expiryIndex] : null;
      const expiresAt = expiryText ? new Date(expiryText) : null;
      if (expiresAt && Number.isNaN(expiresAt.getTime())) {
        rejected.push({
          row: offset + relativeIndex + (hasHeader ? 2 : 1),
          reason: 'invalid_expiry'
        });
        continue;
      }
      inserts.push({
        variant_id: input.variantId,
        import_batch_id: String(batch.id),
        payload_ciphertext: encryptOrderPayload(code),
        payload_hash: hash,
        display_hint:
          hintIndex >= 0 && row[hintIndex]
            ? row[hintIndex].slice(0, 120)
            : `••••${createHash('sha256').update(code).digest('hex').slice(-4)}`,
        expires_at: expiresAt?.toISOString() ?? null
      });
    }
    if (!inserts.length) continue;
    const {data, error} = await admin
      .from('stock_codes')
      .upsert(inserts, {onConflict: 'variant_id,payload_hash', ignoreDuplicates: true})
      .select('id');
    if (error) throw new Error('stock_import_insert_failed');
    imported += data?.length ?? 0;
    duplicates += inserts.length - (data?.length ?? 0);
  }
  await admin
    .from('stock_code_import_batches')
    .update({
      imported_rows: imported,
      duplicate_rows: duplicates,
      rejected_rows: rejected.length,
      error_report: rejected
    })
    .eq('id', String(batch.id));
  return {batchId: String(batch.id), imported, duplicates, rejected: rejected.length};
}
