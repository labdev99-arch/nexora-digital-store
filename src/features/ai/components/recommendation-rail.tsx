'use client';

import Image from 'next/image';
import {Sparkles} from 'lucide-react';
import {useLocale, useTranslations} from 'next-intl';
import {useEffect, useState} from 'react';
import {Link} from '@/i18n/navigation';
import {PriceDisplay} from '@/components/ui/advanced';
import {Skeleton} from '@/components/ui/surfaces';

type Product = {
  id: string;
  slug: string;
  name: string;
  description: string;
  priceAmount: number;
  currencyCode: string;
  image: string | null;
};

export function RecommendationRail({
  sourceProductId,
  className = ''
}: {
  sourceProductId?: string;
  className?: string;
}) {
  const locale = useLocale();
  const t = useTranslations('AI.recommendations');
  const [products, setProducts] = useState<Product[] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({locale, limit: '6'});
    if (sourceProductId) query.set('source', sourceProductId);
    fetch(`/api/ai/recommendations?${query}`, {signal: controller.signal})
      .then((response) => (response.ok ? response.json() : null))
      .then((value: unknown) => {
        if (value && typeof value === 'object' && 'data' in value) {
          const data = (value as {data?: {products?: Product[]}}).data;
          setProducts(data?.products ?? []);
        } else setProducts([]);
      })
      .catch(() => setProducts([]));
    return () => controller.abort();
  }, [locale, sourceProductId]);
  if (products?.length === 0) return null;
  return (
    <section className={`recommendation-rail ${className}`} aria-labelledby="recommendation-title">
      <div className="site-container">
        <div className="recommendation-heading">
          <span>
            <Sparkles aria-hidden="true" />
            {t(sourceProductId ? 'crossSellEyebrow' : 'eyebrow')}
          </span>
          <h2 id="recommendation-title">{t(sourceProductId ? 'crossSellTitle' : 'title')}</h2>
          <p>{t('description')}</p>
        </div>
        <div className="recommendation-grid">
          {products === null
            ? Array.from({length: 4}, (_, index) => (
                <Skeleton className="recommendation-skeleton" key={index} />
              ))
            : products.map((product) => (
                <Link
                  className="recommendation-card"
                  href={`/products/${product.slug}`}
                  key={product.id}
                >
                  <div className="recommendation-media">
                    {product.image ? (
                      <Image
                        src={product.image}
                        alt=""
                        fill
                        sizes="(max-width: 720px) 70vw, 280px"
                      />
                    ) : (
                      <Sparkles aria-hidden="true" />
                    )}
                  </div>
                  <div>
                    <strong>{product.name}</strong>
                    <p>{product.description}</p>
                    <PriceDisplay amount={product.priceAmount} currency={product.currencyCode} />
                  </div>
                </Link>
              ))}
        </div>
      </div>
    </section>
  );
}
