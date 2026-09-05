import {Clock3, ShieldCheck} from 'lucide-react';
import type {Metadata} from 'next';
import Image from 'next/image';
import {notFound} from 'next/navigation';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {StorefrontShell} from '@/components/layout/storefront-shell';
import {Badge, Breadcrumb} from '@/components/ui/surfaces';
import {ProductCard} from '@/features/catalog/components/product-card';
import {ProductConfigurator} from '@/features/catalog/components/product-configurator';
import {RecentViewTracker} from '@/features/catalog/components/recent-view-tracker';
import {RecentProducts} from '@/features/catalog/components/recent-products';
import {
  getProductBySlug,
  getRelatedProducts,
  searchCatalog
} from '@/features/catalog/server/queries';
import {translate} from '@/features/catalog/types';
import type {AppLocale} from '@/i18n/routing';
import {getProductReviewSummary} from '@/features/reviews/server/queries';
import {ProductReviews} from '@/features/reviews/components/reviews';
import {RecommendationRail} from '@/features/ai/components/recommendation-rail';

type Props = {params: Promise<{locale: AppLocale; slug: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale, slug} = await params;
  const product = await getProductBySlug(slug);
  if (!product) return {};
  const seoTitle = localizedSeo(product.seo, 'title', locale) || translate(product.name, locale);
  const description =
    localizedSeo(product.seo, 'description', locale) || translate(product.shortDescription, locale);
  return {
    title: seoTitle,
    description,
    alternates: {
      canonical: `/${locale}/products/${slug}`,
      languages: {
        en: `/en/products/${slug}`,
        ar: `/ar/products/${slug}`,
        'x-default': `/en/products/${slug}`
      }
    },
    openGraph: {
      title: seoTitle,
      description,
      type: 'website',
      url: `/${locale}/products/${slug}`,
      images: [`/${locale}/products/${slug}/opengraph-image`]
    }
  };
}

export default async function ProductPage({params}: Props) {
  const {locale, slug} = await params;
  setRequestLocale(locale);
  const product = await getProductBySlug(slug);
  if (!product) notFound();
  const [related, catalog, t, reviewSummary] = await Promise.all([
    getRelatedProducts(product.id, locale),
    searchCatalog(locale, {pageSize: 60}),
    getTranslations({locale, namespace: 'Catalog'}),
    getProductReviewSummary(product.id)
  ]);
  const primary = product.media.find((item) => item.isPrimary) ?? product.media[0];
  const firstVariant = product.variants[0];
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: translate(product.name, locale),
    description: translate(product.shortDescription, locale),
    image: product.media.map((item) => item.url),
    sku: firstVariant?.sku,
    category: translate(product.categoryName, locale),
    aggregateRating:
      Number(reviewSummary.aggregate?.review_count ?? 0) > 0
        ? {
            '@type': 'AggregateRating',
            ratingValue: Number(reviewSummary.aggregate?.average_rating ?? 0),
            reviewCount: Number(reviewSummary.aggregate?.review_count ?? 0)
          }
        : undefined,
    review: reviewSummary.reviews.slice(0, 5).map((review) => ({
      '@type': 'Review',
      reviewRating: {'@type': 'Rating', ratingValue: Number(review.rating)},
      name: String(review.title ?? ''),
      reviewBody: String(review.body ?? '')
    })),
    offers: firstVariant
      ? {
          '@type': 'Offer',
          priceCurrency: firstVariant.currencyCode,
          price: (firstVariant.priceAmount / 100).toFixed(2),
          availability:
            product.status === 'active'
              ? 'https://schema.org/InStock'
              : product.status === 'out_of_stock'
                ? 'https://schema.org/OutOfStock'
                : 'https://schema.org/PreOrder',
          url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/${locale}/products/${slug}`
        }
      : undefined
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {'@type': 'ListItem', position: 1, name: t('home'), item: `/${locale}`},
      {
        '@type': 'ListItem',
        position: 2,
        name: translate(product.categoryName, locale),
        item: `/${locale}/categories/${product.categorySlug}`
      },
      {'@type': 'ListItem', position: 3, name: translate(product.name, locale)}
    ]
  };
  const cardLabels = {
    view: t('view'),
    comingSoon: t('comingSoon'),
    outOfStock: t('outOfStock'),
    instant: t('instant')
  };
  return (
    <StorefrontShell>
      <main id="main-content" className="product-page page-shell">
        <Breadcrumb
          items={[
            {label: t('home'), href: `/${locale}`},
            {label: t('products'), href: `/${locale}/products`},
            {label: translate(product.name, locale)}
          ]}
        />
        <section className="product-detail">
          <div className="product-gallery" aria-label={t('gallery')}>
            <div className="product-primary-media">
              <Image
                src={primary?.url ?? '/icons/icon-512.png'}
                alt={primary ? translate(primary.alt, locale) : translate(product.name, locale)}
                fill
                priority
                sizes="(max-width: 60rem) 100vw, 52vw"
                unoptimized={Boolean(primary?.url.startsWith('http'))}
              />
            </div>
            {product.media.length > 1 ? (
              <div className="product-thumbnails">
                {product.media.map((media) => (
                  <div key={media.id}>
                    <Image
                      src={media.url}
                      alt={translate(media.alt, locale)}
                      fill
                      sizes="6rem"
                      unoptimized={media.url.startsWith('http')}
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <div className="product-copy">
            <div className="product-badges">
              {product.badges.map((badge) => (
                <Badge tone="accent" key={translate(badge, locale)}>
                  {translate(badge, locale)}
                </Badge>
              ))}
            </div>
            <span className="section-eyebrow">{translate(product.categoryName, locale)}</span>
            <h1>{translate(product.name, locale)}</h1>
            <p className="product-lead">{translate(product.shortDescription, locale)}</p>
            <div className="product-assurances">
              <span>
                <Clock3 aria-hidden="true" />
                <small>{t('delivery')}</small>
                <strong>{translate(product.deliveryEstimate, locale)}</strong>
              </span>
              <span>
                <ShieldCheck aria-hidden="true" />
                <small>{t('warranty')}</small>
                <strong>{translate(product.warrantyText, locale)}</strong>
              </span>
            </div>
            <div className="product-description">{translate(product.description, locale)}</div>
            <ProductConfigurator product={product} />
          </div>
        </section>
        {related.length ? (
          <section className="related-products">
            <span className="section-eyebrow">{t('related')}</span>
            <h2>{t('relatedDescription')}</h2>
            <div className="catalog-grid">
              {related.map((item) => (
                <ProductCard key={item.id} product={item} locale={locale} labels={cardLabels} />
              ))}
            </div>
          </section>
        ) : null}
        <RecentProducts
          products={catalog.products}
          currentSlug={product.slug}
          locale={locale}
          title={t('recentlyViewed')}
          labels={cardLabels}
        />
        <ProductReviews summary={reviewSummary} />
        <RecommendationRail sourceProductId={product.id} />
        <RecentViewTracker productId={product.id} slug={product.slug} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{__html: safeJson(jsonLd)}} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{__html: safeJson(breadcrumbLd)}}
        />
      </main>
    </StorefrontShell>
  );
}

function localizedSeo(seo: Record<string, unknown>, key: string, locale: string): string {
  const value = seo[key];
  if (!value || Array.isArray(value) || typeof value !== 'object') return '';
  const localized = value as Record<string, unknown>;
  return typeof localized[locale] === 'string'
    ? localized[locale]
    : typeof localized.en === 'string'
      ? localized.en
      : '';
}

function safeJson(value: object): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}
