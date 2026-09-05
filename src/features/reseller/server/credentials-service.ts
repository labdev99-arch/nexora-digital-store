import 'server-only';

import {randomBytes} from 'node:crypto';

import type {AuthContext} from '@/features/auth/server/authorization';
import {createApiKeySchema, webhookEndpointSchema} from '../schemas/reseller';
import {encryptCredential} from './credential-crypto';
import {createApiCredential} from './signing';
import {queryValue, trustedRest} from './trusted-rest';

type AccountRow = {id: string; status: string};

async function accountFor(identity: AuthContext) {
  if (!identity.permissions.includes('reseller.access')) throw new Error('forbidden');
  const rows = await trustedRest<AccountRow[]>(
    `reseller_accounts?select=id,status&profile_id=eq.${identity.user.id}&deleted_at=is.null&limit=1`
  );
  if (!rows[0] || rows[0].status !== 'active') throw new Error('reseller_account_inactive');
  return rows[0];
}

export async function listApiKeys(identity: AuthContext) {
  const account = await accountFor(identity);
  return trustedRest<unknown[]>(
    `reseller_api_keys?select=id,name,key_prefix,environment,scopes,rate_limit_per_minute,ip_allowlist,last_used_at,expires_at,revoked_at,created_at&reseller_account_id=eq.${account.id}&deleted_at=is.null&order=created_at.desc`
  );
}

export async function createApiKey(identity: AuthContext, input: unknown) {
  const account = await accountFor(identity);
  const value = createApiKeySchema.parse(input);
  const credential = createApiCredential(value.environment);
  const rows = await trustedRest<{id: string}[]>('reseller_api_keys', {
    method: 'POST',
    headers: {Prefer: 'return=representation'},
    body: JSON.stringify({
      reseller_account_id: account.id,
      name: value.name,
      key_prefix: credential.prefix,
      key_hash: credential.keyHash,
      signing_secret_ciphertext: encryptCredential(credential.signingSecret),
      environment: value.environment,
      scopes: value.scopes,
      rate_limit_per_minute: value.rateLimitPerMinute,
      ip_allowlist: value.ipAllowlist,
      expires_at: value.expiresAt ?? null
    })
  });
  return {id: rows[0]?.id, apiKey: credential.rawKey, signingSecret: credential.signingSecret};
}

export async function revokeApiKey(identity: AuthContext, id: string) {
  const account = await accountFor(identity);
  await trustedRest(
    `reseller_api_keys?id=eq.${queryValue(id)}&reseller_account_id=eq.${account.id}`,
    {
      method: 'PATCH',
      headers: {Prefer: 'return=minimal'},
      body: JSON.stringify({revoked_at: new Date().toISOString()})
    }
  );
}

export async function listWebhookEndpoints(identity: AuthContext) {
  const account = await accountFor(identity);
  return trustedRest<unknown[]>(
    `reseller_webhook_endpoints?select=id,url,description,events,active,failure_count,last_delivery_at,created_at&reseller_account_id=eq.${account.id}&deleted_at=is.null&order=created_at.desc`
  );
}

export async function createWebhookEndpoint(identity: AuthContext, input: unknown) {
  const account = await accountFor(identity);
  const value = webhookEndpointSchema.parse(input);
  const secret = randomBytes(32).toString('base64url');
  const rows = await trustedRest<{id: string}[]>('reseller_webhook_endpoints', {
    method: 'POST',
    headers: {Prefer: 'return=representation'},
    body: JSON.stringify({
      reseller_account_id: account.id,
      url: value.url,
      description: value.description ?? null,
      events: value.events,
      secret_ciphertext: encryptCredential(secret)
    })
  });
  return {id: rows[0]?.id, signingSecret: secret};
}
