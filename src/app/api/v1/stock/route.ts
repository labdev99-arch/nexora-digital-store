import {apiSuccess} from '@/features/reseller/server/api-response';
import {withResellerApi} from '@/features/reseller/server/api-auth';
import {wholesaleCatalog} from '@/features/reseller/server/reseller-service';

export async function GET(request: Request) {
  return withResellerApi(request, 'catalog:read', async (context) => {
    const catalog = await wholesaleCatalog(context.account.profile_id);
    return apiSuccess(
      catalog.products.map((item) => ({
        variant_id: item.id,
        sku: item.sku,
        available: item.available,
        unlimited: item.unlimited_stock,
        quantity: item.unlimited_stock ? null : item.stock_quantity
      }))
    );
  });
}
