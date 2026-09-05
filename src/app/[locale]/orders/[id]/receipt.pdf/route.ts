import {cookies} from 'next/headers';

import {createOrderPdf} from '@/features/commerce/server/order-document';
import {getOrderDetail} from '@/features/commerce/server/order-service';
import type {AppLocale} from '@/i18n/routing';

export async function GET(
  _request: Request,
  {params}: {params: Promise<{locale: string; id: string}>}
) {
  const {locale, id} = await params;
  const appLocale: AppLocale = locale === 'ar' ? 'ar' : 'en';
  const store = await cookies();
  const detail = await getOrderDetail(id, {
    profileId: null,
    guestToken: store.get(`nexora_order_${id}`)?.value ?? null
  });
  const pdf = await createOrderPdf(appLocale, 'receipt', detail.order, detail.items);
  return new Response(Buffer.from(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${detail.order.order_number}-receipt.pdf"`,
      'cache-control': 'private, no-store'
    }
  });
}
