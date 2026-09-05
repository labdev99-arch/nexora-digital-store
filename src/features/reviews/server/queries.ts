import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
export async function getProductReviewSummary(productId: string) {
  const admin = createAdminClient();
  const [{data: aggregate}, {data: reviews}] = await Promise.all([
    admin.from('product_review_aggregates').select('*').eq('product_id', productId).maybeSingle(),
    admin
      .from('reviews')
      .select('*')
      .eq('product_id', productId)
      .eq('status', 'approved')
      .is('deleted_at', null)
      .order('created_at', {ascending: false})
      .limit(20)
  ]);
  const reviewRows = (reviews ?? []) as unknown as Array<Record<string, unknown>>;
  const ids = reviewRows.map((row) => String(row.id));
  const {data: replies} = ids.length
    ? await admin
        .from('review_replies')
        .select('*')
        .in('review_id', ids)
        .is('deleted_at', null)
        .order('created_at')
    : {data: []};
  const withImages: Array<Record<string, unknown>> = await Promise.all(
    reviewRows.map(async (review) => {
      const paths = Array.isArray(review.image_paths)
        ? review.image_paths.filter((path): path is string => typeof path === 'string')
        : [];
      const {data} = paths.length
        ? await admin.storage.from('review-images').createSignedUrls(paths, 60 * 60)
        : {data: []};
      return {
        ...review,
        image_urls: (data ?? [])
          .map((item) => item.signedUrl)
          .filter((url): url is string => Boolean(url))
      };
    })
  );
  return {aggregate, reviews: withImages, replies: replies ?? []};
}
