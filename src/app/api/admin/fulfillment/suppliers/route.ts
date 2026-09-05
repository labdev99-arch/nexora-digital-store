import {NextResponse} from 'next/server';

import {getAuthContext} from '@/features/auth/server/authorization';
import {supplierConfigSchema} from '@/features/fulfillment/schemas/fulfillment';
import {encryptSupplierSecret} from '@/features/fulfillment/server/supplier-crypto';
import {createAdminClient} from '@/lib/supabase/admin';

export async function POST(request: Request) {
  const identity = await getAuthContext();
  if (!identity?.permissions.includes('fulfillment.manage'))
    return NextResponse.json({error: 'forbidden'}, {status: 403});
  try {
    const input = supplierConfigSchema.parse(await request.json());
    const admin = createAdminClient();
    const {data: existing} = await admin
      .from('suppliers')
      .select('*')
      .eq('code', input.code)
      .is('deleted_at', null)
      .maybeSingle();
    const payload = {
      code: input.code,
      name: input.name,
      driver: input.driver,
      endpoint: input.endpoint,
      currency_code: input.currencyCode,
      margin_bps: input.marginBps,
      priority: input.priority,
      enabled: input.enabled,
      sandbox_mode: input.sandboxMode,
      ...(input.apiKey ? {api_key_ciphertext: encryptSupplierSecret(input.apiKey)} : {})
    };
    const query = existing
      ? admin.from('suppliers').update(payload).eq('id', existing.id)
      : admin.from('suppliers').insert(payload);
    const {data, error} = await query.select('id,code,name,driver,health_status').single();
    return error
      ? NextResponse.json({error: error.message}, {status: 400})
      : NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {error: error instanceof Error ? error.message : 'supplier_config_invalid'},
      {status: 400}
    );
  }
}
