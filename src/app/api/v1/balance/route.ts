import {apiSuccess} from '@/features/reseller/server/api-response';
import {withResellerApi} from '@/features/reseller/server/api-auth';
import {trustedRest} from '@/features/reseller/server/trusted-rest';

export async function GET(request: Request) {
  return withResellerApi(request, 'balance:read', async (context) => {
    if (context.apiKey.environment === 'sandbox') {
      return apiSuccess([{currency_code: 'USD', available_amount: 1_000_000, simulated: true}]);
    }
    const rows = await trustedRest<unknown[]>(
      `wallets?select=currency_code,cached_balance,locked,frozen_at&owner_id=eq.${context.account.profile_id}&account_type=eq.customer&order=currency_code.asc`
    );
    return apiSuccess(rows);
  });
}
