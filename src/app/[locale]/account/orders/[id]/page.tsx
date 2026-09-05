import {getTranslations} from 'next-intl/server';
import {notFound} from 'next/navigation';
import {requireUser} from '@/features/auth/server/authorization';
import {OrderDetail} from '@/features/commerce/components/order-detail';
import {getOrderDetail} from '@/features/commerce/server/order-service';
import type {OrderStatus} from '@/lib/supabase/database.types';
import {RecommendationRail} from '@/features/ai/components/recommendation-rail';
export default async function OrderPage({params}: {params: Promise<{locale: string; id: string}>}) {
  const {locale, id} = await params;
  const [auth, t] = await Promise.all([
    requireUser(locale),
    getTranslations({locale, namespace: 'Commerce'})
  ]);
  try {
    const detail = await getOrderDetail(id, {profileId: auth.user.id, guestToken: null});
    return (
      <>
        <OrderDetail
          initial={detail}
          locale={locale}
          labels={{
            status: t('order.status'),
            total: t('order.total'),
            items: t('order.items'),
            timeline: t('order.timeline'),
            deliveries: t('order.deliveries'),
            reveal: t('order.reveal'),
            copy: t('order.copy'),
            download: t('order.download'),
            cancel: t('order.cancel'),
            refund: t('order.refund'),
            reorder: t('order.reorder'),
            reason: t('order.reason'),
            send: t('order.send'),
            message: t('order.message'),
            invoice: t('order.invoice'),
            receipt: t('order.receipt'),
            emptyDeliveries: t('order.emptyDeliveries'),
            success: t('order.success'),
            error: t('order.error'),
            paymentPending: t('order.paymentPending'),
            paymentReference: t('order.paymentReference'),
            proof: t('order.proof'),
            uploadProof: t('order.uploadProof'),
            proofUploaded: t('order.proofUploaded'),
            statusLabels: Object.fromEntries(
              [
                'draft',
                'awaiting_payment',
                'paid',
                'processing',
                'partially_delivered',
                'delivered',
                'completed',
                'on_hold',
                'failed',
                'cancelled',
                'refunded',
                'disputed'
              ].map((status) => [status, t(`orders.statuses.${status}`)])
            ) as Record<OrderStatus, string>
          }}
        />
        {detail.items[0]?.product_id ? (
          <RecommendationRail sourceProductId={detail.items[0].product_id} />
        ) : null}
      </>
    );
  } catch {
    notFound();
  }
}
