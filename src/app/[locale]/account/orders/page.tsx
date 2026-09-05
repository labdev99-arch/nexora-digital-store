import {getTranslations} from 'next-intl/server';
import {PriceDisplay} from '@/components/ui/advanced';
import {Link} from '@/i18n/navigation';
import {requireUser} from '@/features/auth/server/authorization';
import {listOrders} from '@/features/commerce/server/order-service';
import type {CurrencyCode} from '@/lib/money';
import type {OrderStatus} from '@/lib/supabase/database.types';
export default async function OrdersPage({
  params,
  searchParams
}: {
  params: Promise<{locale: string}>;
  searchParams: Promise<{status?: string}>;
}) {
  const {locale} = await params;
  const {status} = await searchParams;
  const [auth, t] = await Promise.all([
    requireUser(locale),
    getTranslations({locale, namespace: 'Commerce.orders'})
  ]);
  const allowed = [
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
  ];
  const orders = await listOrders(
    auth.user.id,
    allowed.includes(status ?? '') ? (status as OrderStatus) : undefined
  );
  return (
    <main className="account-content commerce-account">
      <header>
        <span>{t('eyebrow')}</span>
        <h1>{t('title')}</h1>
        <p>{t('description')}</p>
      </header>
      <nav className="order-filters">
        <Link href="/account/orders">{t('all')}</Link>
        {['paid', 'processing', 'delivered', 'completed', 'refunded'].map((item) => (
          <Link key={item} href={`/account/orders?status=${item}`}>
            {t(`statuses.${item}`)}
          </Link>
        ))}
      </nav>
      <section className="order-list">
        {orders.length ? (
          orders.map((order) => (
            <Link href={`/account/orders/${order.id}`} key={order.id}>
              <div>
                <strong>{order.order_number}</strong>
                <span>
                  {new Intl.DateTimeFormat(locale, {dateStyle: 'medium'}).format(
                    new Date(order.created_at)
                  )}
                </span>
              </div>
              <span data-status={order.status}>{t(`statuses.${order.status}`)}</span>
              <PriceDisplay
                amount={order.total_amount}
                currency={order.currency_code as CurrencyCode}
              />
            </Link>
          ))
        ) : (
          <p>{t('empty')}</p>
        )}
      </section>
    </main>
  );
}
