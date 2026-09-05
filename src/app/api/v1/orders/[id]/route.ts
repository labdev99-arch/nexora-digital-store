import {apiSuccess} from '@/features/reseller/server/api-response';
import {withResellerApi} from '@/features/reseller/server/api-auth';
import {apiOrder} from '@/features/reseller/server/reseller-service';

export async function GET(request: Request, {params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  return withResellerApi(request, 'orders:read', async (context) =>
    apiSuccess(await apiOrder(context.account.id, context.apiKey.environment, id))
  );
}
