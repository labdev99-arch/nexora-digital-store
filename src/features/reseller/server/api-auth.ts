import 'server-only';

import {randomUUID} from 'node:crypto';

import type {ResellerApiScope} from '../schemas/reseller';
import {ResellerApiError, apiFailure} from './api-response';
import {decryptCredential} from './credential-crypto';
import {canonicalRequest, safeSignatureEqual, sha256, signPayload} from './signing';
import {queryValue, trustedRest} from './trusted-rest';

type ApiKeyRow = {
  id: string;
  reseller_account_id: string;
  key_prefix: string;
  key_hash: string;
  signing_secret_ciphertext: string;
  environment: 'sandbox' | 'live';
  scopes: string[];
  revoked_at: string | null;
  expires_at: string | null;
};
type AccountRow = {
  id: string;
  profile_id: string;
  status: string;
  current_tier_id: string;
  manual_tier_id: string | null;
};

export type ResellerApiContext = {
  requestId: string;
  apiKey: ApiKeyRow;
  account: AccountRow;
  bodyText: string;
  startedAt: number;
};

function clientIp(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';
}

async function authenticate(
  request: Request,
  scope: ResellerApiScope,
  compatibility = false
): Promise<ResellerApiContext> {
  const requestId = request.headers.get('x-request-id') ?? randomUUID();
  const bodyText =
    request.method === 'GET' || request.method === 'HEAD' ? '' : await request.text();
  let compatibilityKey: string | undefined;
  if (compatibility) {
    try {
      const parsed = JSON.parse(bodyText) as {key?: unknown};
      compatibilityKey = typeof parsed.key === 'string' ? parsed.key : undefined;
    } catch {
      compatibilityKey = new URLSearchParams(bodyText).get('key') ?? undefined;
    }
  }
  const rawKey =
    request.headers.get('x-nexora-key') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    compatibilityKey;
  if (!rawKey) throw new ResellerApiError('api_key_missing', 401);
  const prefix = rawKey.split('.')[0] ?? '';
  const keys = await trustedRest<ApiKeyRow[]>(
    `reseller_api_keys?select=*&key_prefix=eq.${queryValue(prefix)}&deleted_at=is.null&limit=1`
  );
  const apiKey = keys[0];
  if (
    !apiKey ||
    apiKey.revoked_at ||
    (apiKey.expires_at && Date.parse(apiKey.expires_at) <= Date.now())
  ) {
    throw new ResellerApiError('api_key_invalid', 401);
  }
  if (!safeSignatureEqual(apiKey.key_hash, sha256(rawKey))) {
    throw new ResellerApiError('api_key_invalid', 401);
  }
  if (!apiKey.scopes.includes(scope))
    throw new ResellerApiError('scope_missing', 403, `Required scope: ${scope}`);
  const accounts = await trustedRest<AccountRow[]>(
    `reseller_accounts?select=id,profile_id,status,current_tier_id,manual_tier_id&id=eq.${apiKey.reseller_account_id}&deleted_at=is.null&limit=1`
  );
  const account = accounts[0];
  if (!account || account.status !== 'active')
    throw new ResellerApiError('reseller_account_inactive', 403);
  const timestamp = request.headers.get('x-nexora-timestamp') ?? '';
  const nonce = request.headers.get('x-nexora-nonce') ?? '';
  if (!compatibility) {
    const signature = request.headers.get('x-nexora-signature') ?? '';
    if (!timestamp || !nonce || !signature)
      throw new ResellerApiError('signature_headers_missing', 401);
    if (Math.abs(Date.now() - Date.parse(timestamp)) > 300_000) {
      throw new ResellerApiError('request_timestamp_expired', 401);
    }
    const url = new URL(request.url);
    const expected = signPayload(
      decryptCredential(apiKey.signing_secret_ciphertext),
      canonicalRequest({
        timestamp,
        nonce,
        method: request.method,
        path: `${url.pathname}${url.search}`,
        body: bodyText
      })
    );
    if (!safeSignatureEqual(expected, signature))
      throw new ResellerApiError('signature_invalid', 401);
  }
  try {
    await trustedRest('rpc/claim_reseller_api_request', {
      method: 'POST',
      body: JSON.stringify({
        p_api_key_id: apiKey.id,
        p_nonce: compatibility ? `smm-${randomUUID()}` : nonce,
        p_timestamp: compatibility ? new Date().toISOString() : timestamp,
        p_ip: clientIp(request)
      })
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('nonce')) throw new ResellerApiError('request_replayed', 409);
    if (message.includes('rate_limit')) throw new ResellerApiError('rate_limit_exceeded', 429);
    if (message.includes('ip')) throw new ResellerApiError('ip_not_allowed', 403);
    throw error;
  }
  return {requestId, apiKey, account, bodyText, startedAt: Date.now()};
}

async function logRequest(
  context: ResellerApiContext | null,
  request: Request,
  requestId: string,
  scope: string,
  status: number,
  startedAt: number,
  errorCode?: string
) {
  await trustedRest('reseller_api_request_logs', {
    method: 'POST',
    headers: {Prefer: 'return=minimal'},
    body: JSON.stringify({
      api_key_id: context?.apiKey.id ?? null,
      reseller_account_id: context?.account.id ?? null,
      request_id: requestId,
      method: request.method,
      path: new URL(request.url).pathname,
      scope,
      status_code: status,
      duration_ms: Math.max(0, Date.now() - startedAt),
      ip_hash: sha256(clientIp(request)),
      error_code: errorCode ?? null
    })
  }).catch(() => undefined);
}

export async function withResellerApi(
  request: Request,
  scope: ResellerApiScope,
  handler: (context: ResellerApiContext) => Promise<Response>,
  compatibility = false
) {
  const startedAt = Date.now();
  const requestId = request.headers.get('x-request-id') ?? randomUUID();
  let context: ResellerApiContext | null = null;
  try {
    context = await authenticate(request, scope, compatibility);
    const response = await handler(context);
    await logRequest(context, request, context.requestId, scope, response.status, startedAt);
    response.headers.set('x-request-id', context.requestId);
    return response;
  } catch (error) {
    const code = error instanceof ResellerApiError ? error.code : 'internal_error';
    const response = apiFailure(error, context?.requestId ?? requestId);
    await logRequest(
      context,
      request,
      context?.requestId ?? requestId,
      scope,
      response.status,
      startedAt,
      code
    );
    return response;
  }
}
