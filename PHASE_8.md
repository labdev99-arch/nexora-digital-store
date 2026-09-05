# Phase 8 — Reseller Platform and Public API

## Delivered

- Bronze, Silver, Gold, and Platinum reseller tiers with tier prices from `tier_prices`, automatic 30-day volume evaluation, audited manual override, configurable credit limits, and per-tier API limits.
- A localized reseller dashboard for balances, spend/order history, wholesale catalog, bulk orders, downloadable CSV/JSON prices, API keys, and webhook endpoints.
- Signed REST API v1 for products, prices, stock, orders, order status, balances, and webhooks.
- Hashed API keys, separately encrypted signing secrets, scopes, sandbox/live separation, HMAC-SHA256 request signatures, five-minute timestamps, one-time nonces, IP allowlists, atomic rate limits, request logs, and order idempotency.
- Signed outgoing webhooks for `order.updated`, `order.delivered`, `order.failed`, and `balance.low`, with exponential retry, worker locking, delivery history, and dead-letter state.
- OpenAPI 3.1 JSON plus localized interactive examples in cURL, JavaScript, PHP, and Python.
- Common SMM-panel compatibility actions: `services`, `add`, `status`, and `balance`.

## Security invariants

- Live reseller orders use the Phase 3 wallet ledger, Phase 5 order state machine, and Phase 6 fulfillment triggers.
- Sandbox orders never debit a production wallet or enter production fulfillment.
- API keys and signing secrets are displayed once. Only a SHA-256 key hash and AES-256-GCM-encrypted signing secret are retained.
- Replayed nonces, stale timestamps, over-limit requests, non-allowlisted IPs, invalid scopes, and reused idempotency keys with different payloads are rejected.
- API request and tier-change records are append-only. Every Phase 8 table has RLS and explicit grants.

## Operational setup

1. Configure `RESELLER_API_ENCRYPTION_KEY` and `CRON_SECRET` in Vercel.
2. Apply migrations `0023` through `0026`.
3. Keep `/api/cron/reseller-webhooks` scheduled every minute.
4. Give approved users the `reseller` role; the migration creates their Bronze account automatically.
5. Add wholesale rows to `tier_prices` using tier codes `bronze`, `silver`, `gold`, and `platinum`.

## Verification

- Unit tests cover request signing/tampering, fixed-window decisions, idempotency replay/conflict, and webhook signatures.
- `tests/database/reseller.sql` verifies nonce uniqueness, database rate limiting, and idempotency uniqueness in a rollback-only transaction.
