import {cookies} from 'next/headers';
import {NextResponse, type NextRequest} from 'next/server';

import {getAuthContext} from '@/features/auth/server/authorization';
import {
  addCartItem,
  guestCartCookie,
  newGuestCartToken,
  readCart,
  removeCartItem,
  setCartCoupon,
  updateCartItem
} from '@/features/commerce/server/cart-service';
import {createClient} from '@/lib/supabase/server';

async function context(locale = 'en') {
  const auth = await getAuthContext();
  const store = await cookies();
  let guestToken = auth ? null : (store.get(guestCartCookie)?.value ?? null);
  let isNew = false;
  if (!auth && !guestToken) {
    guestToken = newGuestCartToken();
    isNew = true;
  }
  let defaults = {currencyCode: 'USD', localeCode: locale, countryCode: null as string | null};
  if (auth) {
    const supabase = await createClient();
    const {data: profile} = await supabase
      .from('profiles')
      .select('currency_code,locale_code,country_code')
      .eq('id', auth.user.id)
      .maybeSingle();
    if (profile)
      defaults = {
        currencyCode: profile.currency_code,
        localeCode: profile.locale_code,
        countryCode: profile.country_code
      };
  }
  return {auth, guestToken, isNew, defaults};
}

function response(data: unknown, guestToken: string | null, isNew: boolean, status = 200) {
  const result = NextResponse.json(data, {status});
  if (guestToken && isNew)
    result.cookies.set(guestCartCookie, guestToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 30
    });
  return result;
}

export async function GET(request: NextRequest) {
  try {
    const state = await context(request.nextUrl.searchParams.get('locale') ?? 'en');
    const cart = await readCart({
      profileId: state.auth?.user.id ?? null,
      guestToken: state.guestToken
    });
    return response({cart}, state.guestToken, state.isNew);
  } catch (cause) {
    return NextResponse.json(
      {error: cause instanceof Error ? cause.message : 'cart_failed'},
      {status: 400}
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const state = await context(request.nextUrl.searchParams.get('locale') ?? 'en');
    const item = await addCartItem(
      {profileId: state.auth?.user.id ?? null, guestToken: state.guestToken},
      state.defaults,
      await request.json()
    );
    return response({item}, state.guestToken, state.isNew, 201);
  } catch (cause) {
    return NextResponse.json(
      {error: cause instanceof Error ? cause.message : 'cart_failed'},
      {status: 400}
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const state = await context();
    const body = (await request.json()) as {
      itemId?: string;
      quantity?: number;
      optionValues?: Record<string, unknown>;
      couponCode?: string | null;
    };
    if (body.couponCode !== undefined)
      await setCartCoupon(
        {profileId: state.auth?.user.id ?? null, guestToken: state.guestToken},
        body.couponCode
      );
    else if (body.itemId)
      await updateCartItem(
        {profileId: state.auth?.user.id ?? null, guestToken: state.guestToken},
        body.itemId,
        body
      );
    else throw new Error('cart_request_invalid');
    return response({ok: true}, state.guestToken, state.isNew);
  } catch (cause) {
    return NextResponse.json(
      {error: cause instanceof Error ? cause.message : 'cart_failed'},
      {status: 400}
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const state = await context();
    const itemId = request.nextUrl.searchParams.get('itemId');
    if (!itemId) throw new Error('cart_item_required');
    await removeCartItem(
      {profileId: state.auth?.user.id ?? null, guestToken: state.guestToken},
      itemId
    );
    return response({ok: true}, state.guestToken, state.isNew);
  } catch (cause) {
    return NextResponse.json(
      {error: cause instanceof Error ? cause.message : 'cart_failed'},
      {status: 400}
    );
  }
}
