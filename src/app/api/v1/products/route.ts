import {apiSuccess} from '@/features/reseller/server/api-response';
import {withResellerApi} from '@/features/reseller/server/api-auth';
import {wholesaleCatalog} from '@/features/reseller/server/reseller-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return withResellerApi(request, 'catalog:read', async (context) => {
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
    const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get('per_page') ?? 25)));
    const catalog = await wholesaleCatalog(
      context.account.profile_id,
      url.searchParams.get('currency') ?? undefined
    );
    const start = (page - 1) * perPage;
    return apiSuccess(catalog.products.slice(start, start + perPage), 200, {
      page,
      per_page: perPage,
      total: catalog.products.length,
      tier: catalog.tier.code
    });
  });
}
