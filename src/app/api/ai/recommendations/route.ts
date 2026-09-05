import {NextResponse} from 'next/server';
import {getAuthContext} from '@/features/auth/server/authorization';
import {recommendationQuerySchema} from '@/features/ai/schemas';
import {getRecommendations} from '@/features/ai/server/recommendations';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const input = recommendationQuerySchema.parse(Object.fromEntries(url.searchParams));
    const auth = await getAuthContext();
    return NextResponse.json(
      {
        data: await getRecommendations({
          profileId: auth?.user.id,
          locale: input.locale,
          sourceProductId: input.source,
          limit: input.limit
        })
      },
      {
        headers: {
          'cache-control': auth
            ? 'private, max-age=60'
            : 'public, s-maxage=300, stale-while-revalidate=600'
        }
      }
    );
  } catch (cause) {
    return NextResponse.json(
      {error: cause instanceof Error ? cause.message : 'recommendations_failed'},
      {status: 400}
    );
  }
}
