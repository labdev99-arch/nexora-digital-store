import {requireUser} from '@/features/auth/server/authorization';
import {createOrderPdf} from '@/features/commerce/server/order-document';
import {getOrderDetail} from '@/features/commerce/server/order-service';
import type {AppLocale} from '@/i18n/routing';
export async function GET(
  _request: Request,
  {params}: {params: Promise<{locale: string; id: string}>}
) {
  const {locale, id} = await params;
  const appLocale: AppLocale = locale === 'ar' ? 'ar' : 'en';
  const auth = await requireUser(locale);
  const detail = await getOrderDetail(id, {profileId: auth.user.id, guestToken: null});
  const pdf = await createOrderPdf(appLocale, 'invoice', detail.order, detail.items);
  return new Response(Buffer.from(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${detail.order.order_number}-invoice.pdf"`,
      'cache-control': 'private, no-store'
    }
  });
}
