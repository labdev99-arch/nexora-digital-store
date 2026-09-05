import {apiSuccess} from '@/features/reseller/server/api-response';
import {withResellerApi} from '@/features/reseller/server/api-auth';
import {queryValue, trustedRest} from '@/features/reseller/server/trusted-rest';

export async function DELETE(request: Request, {params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  return withResellerApi(request, 'webhooks:manage', async (context) => {
    await trustedRest(
      `reseller_webhook_endpoints?id=eq.${queryValue(id)}&reseller_account_id=eq.${context.account.id}`,
      {
        method: 'PATCH',
        headers: {Prefer: 'return=minimal'},
        body: JSON.stringify({deleted_at: new Date().toISOString(), active: false})
      }
    );
    return apiSuccess({id, deleted: true});
  });
}
