import {ResellerApiError} from '@/features/reseller/server/api-response';
import {withResellerApi} from '@/features/reseller/server/api-auth';
import {
  apiOrder,
  placeApiOrder,
  wholesaleCatalog
} from '@/features/reseller/server/reseller-service';
import {sha256} from '@/features/reseller/server/signing';
import {trustedRest} from '@/features/reseller/server/trusted-rest';

function parseBody(body: string) {
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return Object.fromEntries(new URLSearchParams(body));
  }
}

export async function POST(request: Request) {
  return withResellerApi(
    request,
    'smm:compat',
    async (context) => {
      const body = parseBody(context.bodyText);
      const action = String(body.action ?? 'services');
      if (action === 'services') {
        const catalog = await wholesaleCatalog(context.account.profile_id);
        return Response.json(
          catalog.products
            .filter((item) => item.products.product_type_code === 'smm')
            .map((item) => ({
              service: item.id,
              name: item.products.name.en ?? item.sku,
              type: 'Default',
              category: 'Nexora',
              rate: item.wholesale_price_amount,
              min: 1,
              max: 1_000_000,
              refill: false,
              cancel: false
            }))
        );
      }
      if (action === 'add') {
        const variantId = String(body.service ?? '');
        const quantity = Number(body.quantity ?? 1);
        const link = String(body.link ?? '');
        const idempotencyKey = `smm:${sha256(`${context.apiKey.id}:${context.bodyText}:${Math.floor(Date.now() / 60_000)}`).slice(0, 48)}`;
        const result = await placeApiOrder(
          context,
          {
            currencyCode: String(body.currency ?? 'USD'),
            localeCode: String(body.locale ?? 'en'),
            countryCode: String(body.country ?? 'LB'),
            items: [{variantId, quantity, optionValues: {profile_url: link, quantity}}]
          },
          idempotencyKey
        );
        const order = result.body as {id?: string; sandbox_order_number?: string};
        return Response.json({order: order.id ?? order.sandbox_order_number});
      }
      if (action === 'status') {
        const orderId = String(body.order ?? '');
        const order = (await apiOrder(context.account.id, context.apiKey.environment, orderId)) as {
          status?: string;
          total_amount?: number;
          currency_code?: string;
        };
        return Response.json({
          charge: order.total_amount ?? 0,
          start_count: '0',
          status: order.status ?? 'Processing',
          remains: '0',
          currency: order.currency_code ?? 'USD'
        });
      }
      if (action === 'balance') {
        if (context.apiKey.environment === 'sandbox')
          return Response.json({balance: '10000.00', currency: 'USD'});
        const wallets = await trustedRest<{currency_code: string; cached_balance: number}[]>(
          `wallets?select=currency_code,cached_balance&owner_id=eq.${context.account.profile_id}&account_type=eq.customer&order=currency_code.asc&limit=1`
        );
        return Response.json({
          balance: String(wallets[0]?.cached_balance ?? 0),
          currency: wallets[0]?.currency_code ?? 'USD'
        });
      }
      throw new ResellerApiError('smm_action_not_supported', 400);
    },
    true
  );
}
