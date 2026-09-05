import {apiSuccess} from '@/features/reseller/server/api-response';
import {withResellerApi} from '@/features/reseller/server/api-auth';
import {placeApiOrder} from '@/features/reseller/server/reseller-service';
import {queryValue, trustedRest} from '@/features/reseller/server/trusted-rest';
import {ResellerApiError} from '@/features/reseller/server/api-response';

export async function GET(request: Request) {
  return withResellerApi(request, 'orders:read', async (context) => {
    const table = context.apiKey.environment === 'sandbox' ? 'reseller_sandbox_orders' : 'orders';
    const ownerColumn =
      context.apiKey.environment === 'sandbox' ? 'reseller_account_id' : 'profile_id';
    const owner =
      context.apiKey.environment === 'sandbox' ? context.account.id : context.account.profile_id;
    const rows = await trustedRest<unknown[]>(
      `${table}?select=*&${ownerColumn}=eq.${queryValue(owner)}&order=created_at.desc&limit=100`
    );
    return apiSuccess(rows);
  });
}

export async function POST(request: Request) {
  return withResellerApi(request, 'orders:write', async (context) => {
    const idempotencyKey = request.headers.get('idempotency-key');
    if (!idempotencyKey) throw new ResellerApiError('idempotency_key_required', 400);
    const input = JSON.parse(context.bodyText) as unknown;
    const result = await placeApiOrder(context, input, idempotencyKey);
    return apiSuccess(result.body, result.replayed ? 200 : 201, {
      idempotency_replayed: result.replayed
    });
  });
}
