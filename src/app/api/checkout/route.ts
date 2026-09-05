import {cookies} from 'next/headers';
import {NextResponse, type NextRequest} from 'next/server';

import {getAuthContext} from '@/features/auth/server/authorization';
import {guestCartCookie} from '@/features/commerce/server/cart-service';
import {checkout} from '@/features/commerce/server/checkout-service';

export async function POST(request: NextRequest) {
  try {
    const locale = request.nextUrl.searchParams.get('locale') === 'ar' ? 'ar' : 'en';
    const auth = await getAuthContext();
    const store = await cookies();
    const result = await checkout(
      auth,
      store.get(guestCartCookie)?.value ?? null,
      await request.json(),
      locale
    );
    const response = NextResponse.json(result, {status: 201});
    if (result.guestAccessToken)
      response.cookies.set(`nexora_order_${result.order.id}`, result.guestAccessToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 90
      });
    return response;
  } catch (cause) {
    return NextResponse.json(
      {error: cause instanceof Error ? cause.message : 'checkout_failed'},
      {status: 400}
    );
  }
}
