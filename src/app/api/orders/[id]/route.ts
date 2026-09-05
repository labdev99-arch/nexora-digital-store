import {cookies} from 'next/headers';
import {NextResponse, type NextRequest} from 'next/server';
import {getAuthContext} from '@/features/auth/server/authorization';
import {
  cancelOrder,
  postOrderMessage,
  reorder,
  requestOrderRefund
} from '@/features/commerce/server/order-service';

export async function POST(request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const {id} = await params;
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({error: 'auth_required'}, {status: 401});
    const body = (await request.json()) as {action?: string; reason?: string; body?: string};
    const data =
      body.action === 'cancel'
        ? await cancelOrder(id, auth.user.id)
        : body.action === 'refund'
          ? await requestOrderRefund(id, auth.user.id, {reason: body.reason})
          : body.action === 'message'
            ? await postOrderMessage(id, auth.user.id, {body: body.body})
            : body.action === 'reorder'
              ? await reorder(id, auth.user.id)
              : null;
    if (!data) throw new Error('order_action_invalid');
    return NextResponse.json({data});
  } catch (cause) {
    return NextResponse.json(
      {error: cause instanceof Error ? cause.message : 'order_action_failed'},
      {status: 400}
    );
  }
}

export async function GET(_request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  const store = await cookies();
  return NextResponse.json({hasGuestAccess: Boolean(store.get(`nexora_order_${id}`))});
}
