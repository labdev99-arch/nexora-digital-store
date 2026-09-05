import 'server-only';

import {randomUUID} from 'node:crypto';

import {decryptCredential} from './credential-crypto';
import {signPayload} from './signing';
import {trustedRest} from './trusted-rest';

type Delivery = {
  id: string;
  endpoint_id: string;
  event_id: string;
  event_type: string;
  payload: unknown;
};
type Endpoint = {url: string; secret_ciphertext: string; active: boolean};

export async function runResellerWebhookWorker(limit = 20) {
  const workerId = `reseller-webhooks:${randomUUID()}`;
  const deliveries = await trustedRest<Delivery[]>('rpc/claim_reseller_webhook_deliveries', {
    method: 'POST',
    body: JSON.stringify({p_worker_id: workerId, p_limit: limit})
  });
  let delivered = 0;
  let failed = 0;
  for (const delivery of deliveries) {
    let succeeded = false;
    let status: number | null = null;
    let responseBody = '';
    let errorCode: string | null = null;
    let signature = '';
    try {
      const endpoints = await trustedRest<Endpoint[]>(
        `reseller_webhook_endpoints?select=url,secret_ciphertext,active&id=eq.${delivery.endpoint_id}&deleted_at=is.null&limit=1`
      );
      const endpoint = endpoints[0];
      if (!endpoint?.active) throw new Error('webhook_endpoint_inactive');
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = JSON.stringify({
        id: delivery.event_id,
        type: delivery.event_type,
        created_at: new Date().toISOString(),
        data: delivery.payload
      });
      signature = `t=${timestamp},v1=${signPayload(decryptCredential(endpoint.secret_ciphertext), `${timestamp}.${body}`)}`;
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'X-Nexora-Webhook-Signature': signature},
        body,
        signal: AbortSignal.timeout(10_000)
      });
      status = response.status;
      responseBody = (await response.text()).slice(0, 1_000);
      succeeded = response.ok;
      if (!succeeded) errorCode = `http_${response.status}`;
    } catch (error) {
      errorCode = error instanceof Error ? error.message.slice(0, 120) : 'delivery_failed';
    }
    await trustedRest('rpc/finish_reseller_webhook_delivery', {
      method: 'POST',
      body: JSON.stringify({
        p_delivery_id: delivery.id,
        p_worker_id: workerId,
        p_succeeded: succeeded,
        p_signature: signature,
        p_response_status: status,
        p_response_body_safe: responseBody,
        p_error_code: errorCode
      })
    });
    if (succeeded) delivered += 1;
    else failed += 1;
  }
  return {claimed: deliveries.length, delivered, failed};
}
