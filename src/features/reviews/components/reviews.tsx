'use client';
import {Star} from 'lucide-react';
import Image from 'next/image';
import {useLocale, useTranslations} from 'next-intl';
import {useState, useTransition} from 'react';
import {Button} from '@/components/ui/button';
import {Input, Textarea} from '@/components/ui/form-controls';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/surfaces';
import {submitReviewAction} from '../server/actions';
export function ProductReviews({
  summary
}: {
  summary: {
    aggregate: Record<string, unknown> | null;
    reviews: Array<Record<string, unknown>>;
    replies: Array<Record<string, unknown>>;
  };
}) {
  const locale = useLocale();
  const t = useTranslations('Reviews');
  return (
    <section className="product-reviews" lang={locale}>
      <header>
        <div>
          <p className="section-eyebrow">{t('eyebrow')}</p>
          <h2>{t('title')}</h2>
        </div>
        <div className="review-score">
          <strong>{Number(summary.aggregate?.average_rating ?? 0).toFixed(1)}</strong>
          <span>
            <Star />
            {t('count', {count: Number(summary.aggregate?.review_count ?? 0)})}
          </span>
        </div>
      </header>
      <div className="review-list">
        {summary.reviews.length ? (
          summary.reviews.map((review) => (
            <Card key={String(review.id)}>
              <CardHeader>
                <div
                  className="review-stars"
                  aria-label={t('rating', {rating: Number(review.rating)})}
                >
                  {Array.from({length: 5}, (_, i) => (
                    <Star key={i} data-filled={i < Number(review.rating)} />
                  ))}
                </div>
                <CardTitle>{String(review.title ?? t('verifiedPurchase'))}</CardTitle>
                <span>{t('verifiedPurchase')}</span>
              </CardHeader>
              <CardContent>
                <p>{String(review.body ?? '')}</p>
                {Array.isArray(review.image_urls) && review.image_urls.length ? (
                  <div className="review-image-grid">
                    {review.image_urls.map((url) => (
                      <Image
                        key={String(url)}
                        src={String(url)}
                        alt={String(review.title ?? t('verifiedPurchase'))}
                        width={320}
                        height={240}
                      />
                    ))}
                  </div>
                ) : null}
                {summary.replies
                  .filter((reply) => reply.review_id === review.id)
                  .map((reply) => (
                    <aside key={String(reply.id)}>
                      <strong>{t('adminReply')}</strong>
                      <p>{String(reply.body)}</p>
                    </aside>
                  ))}
              </CardContent>
            </Card>
          ))
        ) : (
          <p>{t('empty')}</p>
        )}
      </div>
    </section>
  );
}
export function ReviewForm({orderItemId}: {orderItemId: string}) {
  const locale = useLocale() === 'ar' ? 'ar' : 'en';
  const t = useTranslations('Reviews.form');
  const [rating, setRating] = useState(5);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState('');
  const [imagePaths, setImagePaths] = useState<string[]>([]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rating-actions">
          {[1, 2, 3, 4, 5].map((value) => (
            <Button
              key={value}
              type="button"
              size="icon"
              variant={rating === value ? 'default' : 'outline'}
              onClick={() => setRating(value)}
            >
              {value}
            </Button>
          ))}
        </div>
        <form
          action={(form) =>
            startTransition(async () => {
              const response = await submitReviewAction({
                orderItemId,
                rating,
                title: String(form.get('title')),
                body: String(form.get('body')),
                imagePaths,
                locale
              });
              setResult(response.ok ? t('submitted') : t('failed'));
            })
          }
        >
          <Input name="title" label={t('heading')} />
          <Textarea name="body" label={t('body')} />
          <label className="review-image-upload">
            {t('images')}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              disabled={pending || imagePaths.length >= 5}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []).slice(0, 5 - imagePaths.length);
                startTransition(async () => {
                  const uploaded: string[] = [];
                  for (const file of files) {
                    const body = new FormData();
                    body.set('file', file);
                    body.set('orderItemId', orderItemId);
                    const response = await fetch('/api/reviews/images', {method: 'POST', body});
                    if (response.ok) uploaded.push(String((await response.json()).path));
                  }
                  setImagePaths((current) => [...current, ...uploaded].slice(0, 5));
                });
              }}
            />
            <small>{t('imageCount', {count: imagePaths.length})}</small>
          </label>
          <Button type="submit" loading={pending}>
            {t('submit')}
          </Button>
        </form>
        {result ? <p role="status">{result}</p> : null}
      </CardContent>
    </Card>
  );
}
