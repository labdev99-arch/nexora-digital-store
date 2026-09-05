type Bucket = {count: number; resetAt: number};

const memoryBuckets = new Map<string, Bucket>();

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

function memoryLimit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  const current = memoryBuckets.get(key);
  const bucket =
    !current || current.resetAt <= now
      ? {count: 1, resetAt: now + windowSeconds * 1000}
      : {count: current.count + 1, resetAt: current.resetAt};
  memoryBuckets.set(key, bucket);
  return {
    allowed: bucket.count <= limit,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt
  };
}

export async function enforceRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return memoryLimit(key, limit, windowSeconds);

  const redisKey = `nexora:rl:${key}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
  try {
    const response = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: {authorization: `Bearer ${token}`, 'content-type': 'application/json'},
      body: JSON.stringify([
        ['INCR', redisKey],
        ['EXPIRE', redisKey, windowSeconds]
      ]),
      cache: 'no-store'
    });
    if (!response.ok) return memoryLimit(key, limit, windowSeconds);
    const payload = (await response.json()) as Array<{result?: number}>;
    const count = Number(payload[0]?.result ?? limit + 1);
    const resetAt = Date.now() + windowSeconds * 1000;
    return {allowed: count <= limit, limit, remaining: Math.max(0, limit - count), resetAt};
  } catch {
    return memoryLimit(key, limit, windowSeconds);
  }
}

export function clientAddress(request: Request): string {
  return (
    request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}
