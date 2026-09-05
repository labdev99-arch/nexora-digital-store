'use client';

import {Minus, Plus, ShoppingBag, Trash2} from 'lucide-react';
import {useCallback, useEffect, useState, useTransition} from 'react';
import {toast} from 'sonner';

import {PriceDisplay} from '@/components/ui/advanced';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/form-controls';
import {Link} from '@/i18n/navigation';
import type {CurrencyCode} from '@/lib/money';
import type {CartView} from '../types';

type Labels = {
  title: string;
  description: string;
  empty: string;
  browse: string;
  quantity: string;
  remove: string;
  subtotal: string;
  coupon: string;
  apply: string;
  checkout: string;
  updated: string;
  error: string;
  upsells: string;
  add: string;
};

export function CartConsole({locale, labels}: {locale: string; labels: Labels}) {
  const [cart, setCart] = useState<CartView | null>(null);
  const [coupon, setCoupon] = useState('');
  const [pending, startTransition] = useTransition();
  const load = useCallback(async () => {
    const response = await fetch(`/api/cart?locale=${locale}`, {cache: 'no-store'});
    const payload = (await response.json()) as {cart: CartView | null};
    setCart(payload.cart);
    setCoupon(payload.cart?.couponCodes[0] ?? '');
  }, [locale]);
  useEffect(() => void load(), [load]);

  const mutate = (request: RequestInit, query = '') =>
    startTransition(async () => {
      const response = await fetch(`/api/cart${query}`, request);
      if (!response.ok) toast.error(labels.error);
      else {
        await load();
        toast.success(labels.updated);
      }
    });
  const subtotal =
    cart?.items.reduce((sum, item) => sum + item.priceAmount * item.quantity, 0) ?? 0;
  return (
    <main className="commerce-page site-container">
      <header className="commerce-heading">
        <span>{labels.title}</span>
        <h1>{labels.title}</h1>
        <p>{labels.description}</p>
      </header>
      {!cart?.items.length ? (
        <section className="commerce-empty">
          <ShoppingBag aria-hidden="true" />
          <p>{labels.empty}</p>
          <Button asChild variant="gradient">
            <Link href="/products">{labels.browse}</Link>
          </Button>
        </section>
      ) : (
        <div className="cart-layout">
          <section className="cart-lines" aria-busy={pending}>
            {cart.items.map((item) => (
              <article className="cart-line" key={item.id}>
                <div className="cart-line-copy">
                  <strong>{item.productName[locale] ?? item.productName.en}</strong>
                  <span>
                    {item.variantName[locale] ?? item.variantName.en} · {item.sku}
                  </span>
                </div>
                <div className="cart-quantity" aria-label={labels.quantity}>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={pending || item.quantity <= 1}
                    onClick={() =>
                      mutate({
                        method: 'PATCH',
                        headers: {'content-type': 'application/json'},
                        body: JSON.stringify({itemId: item.id, quantity: item.quantity - 1})
                      })
                    }
                  >
                    <Minus aria-hidden="true" />
                  </Button>
                  <span>{item.quantity}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      mutate({
                        method: 'PATCH',
                        headers: {'content-type': 'application/json'},
                        body: JSON.stringify({itemId: item.id, quantity: item.quantity + 1})
                      })
                    }
                  >
                    <Plus aria-hidden="true" />
                  </Button>
                </div>
                <PriceDisplay
                  amount={item.priceAmount * item.quantity}
                  currency={item.currencyCode as CurrencyCode}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={labels.remove}
                  disabled={pending}
                  onClick={() => mutate({method: 'DELETE'}, `?itemId=${item.id}`)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </article>
            ))}
          </section>
          <aside className="cart-summary">
            <div>
              <span>{labels.subtotal}</span>
              <PriceDisplay
                amount={subtotal}
                currency={cart.currencyCode as CurrencyCode}
                size="lg"
              />
            </div>
            <div className="coupon-row">
              <Input
                label={labels.coupon}
                value={coupon}
                onChange={(event) => setCoupon(event.target.value.toUpperCase())}
              />
              <Button
                disabled={pending}
                onClick={() =>
                  mutate({
                    method: 'PATCH',
                    headers: {'content-type': 'application/json'},
                    body: JSON.stringify({couponCode: coupon || null})
                  })
                }
              >
                {labels.apply}
              </Button>
            </div>
            <Button asChild variant="gradient" size="lg">
              <Link href="/checkout">{labels.checkout}</Link>
            </Button>
          </aside>
        </div>
      )}
      {cart?.upsells.length ? (
        <section className="upsell-grid">
          <h2>{labels.upsells}</h2>
          {cart.upsells.map((item) => (
            <Link href={`/products/${item.slug}`} key={item.id}>
              <strong>
                {typeof item.name === 'object' && item.name && !Array.isArray(item.name)
                  ? String(item.name[locale] ?? item.name.en ?? '')
                  : ''}
              </strong>
              <PriceDisplay
                amount={item.priceAmount}
                currency={item.currencyCode as CurrencyCode}
              />
              <span>{labels.add}</span>
            </Link>
          ))}
        </section>
      ) : null}
    </main>
  );
}
