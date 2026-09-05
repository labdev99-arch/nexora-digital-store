import {resellerOpenApi} from '@/features/reseller/openapi';

export function GET(request: Request) {
  return Response.json(resellerOpenApi(new URL(request.url).origin));
}
