import {randomBytes} from 'node:crypto';

import {webhookEndpointSchema} from '@/features/reseller/schemas/reseller';
import {apiSuccess} from '@/features/reseller/server/api-response';
import {withResellerApi} from '@/features/reseller/server/api-auth';
import {encryptCredential} from '@/features/reseller/server/credential-crypto';
import {trustedRest} from '@/features/reseller/server/trusted-rest';

export async function GET(request: Request) {
  return withResellerApi(request, 'webhooks:manage', async (context) => {
    const rows = await trustedRest<unknown[]>(
      `reseller_webhook_endpoints?select=id,url,description,events,active,failure_count,last_delivery_at,created_at&reseller_account_id=eq.${context.account.id}&deleted_at=is.null&order=created_at.desc`
    );
    return apiSuccess(rows);
  });
}

export async function POST(request: Request) {
  return withResellerApi(request, 'webhooks:manage', async (context) => {
    const input = webhookEndpointSchema.parse(JSON.parse(context.bodyText) as unknown);
    const secret = randomBytes(32).toString('base64url');
    const rows = await trustedRest<{id: string; url: string; events: string[]}[]>(
      'reseller_webhook_endpoints',
      {
        method: 'POST',
        headers: {Prefer: 'return=representation'},
        body: JSON.stringify({
          reseller_account_id: context.account.id,
          url: input.url,
          description: input.description ?? null,
          events: input.events,
          secret_ciphertext: encryptCredential(secret)
        })
      }
    );
    return apiSuccess({...rows[0], signing_secret: secret}, 201);
  });
}
