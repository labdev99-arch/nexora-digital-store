'use server';
import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {requirePermission} from '@/features/auth/server/authorization';
import {createClient} from '@/lib/supabase/server';
const schema = z.object({
  orderItemId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(120),
  body: z.string().trim().max(3000),
  imagePaths: z.array(z.string().min(1)).max(5),
  locale: z.enum(['en', 'ar']),
  productSlug: z.string().optional()
});
export async function submitReviewAction(raw: unknown) {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return {ok: false, error: 'invalid_review'} as const;
  await requirePermission(parsed.data.locale, 'account.update');
  const supabase = await createClient();
  const {error} = await supabase.rpc('submit_verified_review', {
    p_order_item_id: parsed.data.orderItemId,
    p_rating: parsed.data.rating,
    p_title: parsed.data.title,
    p_body: parsed.data.body,
    p_image_paths: parsed.data.imagePaths
  });
  if (error) return {ok: false, error: error.message} as const;
  if (parsed.data.productSlug)
    revalidatePath(`/${parsed.data.locale}/products/${parsed.data.productSlug}`);
  return {ok: true} as const;
}
