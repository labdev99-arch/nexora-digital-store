# Reseller API operations

The canonical OpenAPI 3.1 document is served at `/api/openapi.json`; interactive bilingual docs are at `/en/developers` and `/ar/developers`.

Every live request uses an API key with scopes/environment/rate limit/IP rules, an HMAC-SHA256 signature, timestamp, and one-time nonce. Order creation additionally requires `Idempotency-Key`; replay returns the original result. Error responses use the stable machine-readable envelope documented in OpenAPI. Never log signing secrets or bodies containing customer delivery inputs.

Outgoing `order.updated`, `order.delivered`, `order.failed`, and `balance.low` webhooks are signed, retried with backoff, and stored in the delivery log. Consumers must verify the signature against the raw body, reject stale timestamps, deduplicate event IDs, and return a 2xx only after durable acceptance.

The `/api/smm` compatibility endpoint uses the same signed account and scope controls. Sandbox keys never settle real wallets or suppliers. See `RUNBOOK.md` for key rotation, load testing, and incident response.
