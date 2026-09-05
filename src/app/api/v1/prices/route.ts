import {apiSuccess} from '@/features/reseller/server/api-response';
import {withResellerApi} from '@/features/reseller/server/api-auth';
import {wholesaleCatalog} from '@/features/reseller/server/reseller-service';

export async function GET(request: Request) {
  return withResellerApi(request, 'catalog:read', async (context) => {
    const catalog = await wholesaleCatalog(
      context.account.profile_id,
      new URL(request.url).searchParams.get('currency') ?? undefined
    );
    return apiSuccess(
      catalog.products.map((item) => ({
        variant_id: item.id,
        sku: item.sku,
        currency: item.currency_code,
        price_amount: item.wholesale_price_amount,
        tier: catalog.tier.code
      }))
    );
  });
}
