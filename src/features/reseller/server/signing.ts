import {createHash, createHmac, randomBytes, timingSafeEqual} from 'node:crypto';

export function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function canonicalRequest(input: {
  timestamp: string;
  nonce: string;
  method: string;
  path: string;
  body: string;
}) {
  return [
    input.timestamp,
    input.nonce,
    input.method.toUpperCase(),
    input.path,
    sha256(input.body)
  ].join('\n');
}

export function signPayload(secret: string, payload: string) {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function safeSignatureEqual(expected: string, received: string) {
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createApiCredential(environment: 'sandbox' | 'live') {
  const marker = environment === 'sandbox' ? 'test' : 'live';
  const prefix = `nx_${marker}_${randomBytes(8).toString('hex')}`;
  const rawKey = `${prefix}.${randomBytes(24).toString('base64url')}`;
  return {
    prefix,
    rawKey,
    keyHash: sha256(rawKey),
    signingSecret: randomBytes(32).toString('base64url')
  };
}

export function idempotencyDecision(
  stored: {requestHash: string; responseBody: unknown} | null,
  requestHash: string
): 'new' | 'replay' | 'conflict' | 'processing' {
  if (!stored) return 'new';
  if (stored.requestHash !== requestHash) return 'conflict';
  return stored.responseBody == null ? 'processing' : 'replay';
}

export function rateLimitDecision(current: number, limit: number) {
  return {allowed: current <= limit, remaining: Math.max(0, limit - current)};
}
