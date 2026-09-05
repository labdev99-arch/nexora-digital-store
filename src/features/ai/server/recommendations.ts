import 'server-only';

import {createAdminClient} from '@/lib/supabase/admin';
import type {Json} from '@/lib/supabase/database.types';
import {aiRest} from './rest';

function localized(value: Json, locale: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const item =
    (value as Record<string, Json | undefined>)[locale] ??
    (value as Record<string, Json | undefined>).en ??
    (value as Record<string, Json | undefined>).ar;
  return typeof item === 'string' ? item : '';
}

export async function getRecommendations(input: {
  profileId?: string;
  locale: 'ar' | 'en';
  sourceProductId?: string;
  limit: number;
}) {
  const admin = createAdminClient();
  let productIds: string[] = [];
  let strategy = 'popularity';
  if (input.profileId) {
    const rows = await aiRest<Array<{product_id: string}>>(
      `profile_recommendations?select=product_id&profile_id=eq.${input.profileId}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&order=score_bps.desc&limit=${input.limit}`
    );
    productIds = rows.map((row) => row.product_id);
    strategy = productIds.length ? 'personalized' : 'popularity';
  }
  if (!productIds.length && input.sourceProductId) {
    const edges = await aiRest<Array<{recommended_product_id: string}>>(
      `product_recommendation_edges?select=recommended_product_id&source_product_id=eq.${input.sourceProductId}&order=score_bps.desc&limit=${input.limit}`
    );
    productIds = edges.map((row) => row.recommended_product_id);
    strategy = productIds.length ? 'cross_sell' : 'popularity';
  }
  if (!productIds.length) {
    const {data: items} = await admin
      .from('order_items')
      .select('product_id,quantity,orders!inner(status)')
      .in('orders.status', ['paid', 'processing', 'partially_delivered', 'delivered', 'completed'])
      .limit(5000);
    const scores = new Map<string, number>();
    for (const item of items ?? [])
      scores.set(item.product_id, (scores.get(item.product_id) ?? 0) + item.quantity);
    productIds = [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, input.limit)
      .map(([id]) => id);
  }
  if (productIds.length < input.limit) {
    const {data: fallback} = await admin
      .from('products')
      .select('id')
      .eq('status', 'active')
      .eq('featured', true)
      .is('deleted_at', null)
      .order('published_at', {ascending: false})
      .limit(input.limit);
    productIds = [...new Set([...productIds, ...(fallback ?? []).map((row) => row.id)])].slice(
      0,
      input.limit
    );
  }
  if (!productIds.length) return {strategy, products: []};
  const [productsResult, variantsResult, mediaResult] = await Promise.all([
    admin
      .from('products')
      .select('id,slug,name,short_description')
      .in('id', productIds)
      .eq('status', 'active')
      .is('deleted_at', null),
    admin
      .from('product_variants')
      .select('product_id,price_amount,currency_code')
      .in('product_id', productIds)
      .eq('active', true)
      .order('price_amount'),
    admin
      .from('product_media')
      .select('product_id,url,storage_path')
      .in('product_id', productIds)
      .eq('is_primary', true)
  ]);
  const products = (productsResult.data ?? []).map((product) => {
    const variant = variantsResult.data?.find((item) => item.product_id === product.id);
    const media = mediaResult.data?.find((item) => item.product_id === product.id);
    const image =
      media?.url ??
      (media?.storage_path
        ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/catalog-media/${media.storage_path}`
        : null);
    return {
      id: product.id,
      slug: product.slug,
      name: localized(product.name, input.locale),
      description: localized(product.short_description, input.locale),
      priceAmount: variant?.price_amount ?? 0,
      currencyCode: variant?.currency_code ?? 'USD',
      image
    };
  });
  const order = new Map(productIds.map((id, index) => [id, index]));
  return {
    strategy,
    products: products.sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99))
  };
}
