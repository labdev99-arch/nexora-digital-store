# Phase 6 — Fulfillment operations

## Delivered

- A Postgres-backed job queue claimed with `FOR UPDATE SKIP LOCKED`, short worker leases, stale-lease recovery, capped exponential backoff plus jitter, bounded attempts, attempt history, dead letters, and operations alerts.
- A Vercel Cron worker route that sweeps expiry/SLA state, claims jobs, fulfills paid orders, polls supplier orders, and records a safe structured failure without holding database locks across network calls.
- Encrypted code inventory by variant with HMAC deduplication, CSV batches, expiry, low-stock alerts, and atomic earliest-expiring assignment. Once assigned, a database trigger makes the code payload and assignment immutable and prevents deletion.
- Data-driven supplier configuration and mappings, encrypted API credentials, generic Perfect Panel/SMM and reseller API adapters, a deterministic mock driver, failover ordering, circuit opening after repeated failures, status polling, partial delivery, cost capture, and reliability/profit views.
- Manual fulfillment tasks with one active task per item, VIP-aware priority, SLA countdown and breach state, atomic staff claim, assignment ownership, encrypted append-only internal notes, code/text/link/file delivery support, bulk delivery API, and staff performance metrics.
- `auto_then_manual` fallback with safe error context and a staff notification. Exhausted automatic fulfillment enters the dead-letter queue and credits the full unrecovered amount to the customer wallet through the Phase 3 ledger using a stable idempotency key.
- A bilingual, RTL-ready fulfillment command center at `/ar/admin/fulfillment` and `/en/admin/fulfillment` for jobs, inventory imports, supplier health/configuration, and the staff queue.

## Safety invariants

1. A stock code is selected and changed from `available` to `assigned` in one SQL statement under `FOR UPDATE SKIP LOCKED`.
2. An assigned stock row cannot be updated back to available or deleted, including by the service role.
3. Supplier placement has a unique stable idempotency key per item/supplier. A retry cannot create a second local supplier order.
4. Exactly one active manual task can exist per order item.
5. Job payloads and provider responses contain safe metadata only; API credentials, targets, codes, and internal notes are encrypted.
6. Provider HTTP calls occur outside database transactions. Queue, order, item, and wallet mutations remain short and independently atomic.
7. Automatic refund uses `wallet_credit()` and therefore remains a balanced, append-only Phase 3 ledger transfer.

## Verification

- Strict TypeScript: passing.
- ESLint with zero warnings: passing.
- Raw-color token gate: passing.
- Prettier: passing.
- Production migrations `phase6_fulfillment` and `phase6_hardening`: applied successfully to Supabase.
- Live database checks: 14/14 Phase 6 tables have RLS; manual claim/delivery RPCs are service-role-only; the import-batch foreign key has a covering index.
- Transactional production database test: passing with rollback, including atomic assignment, assigned-code immutability, job claim, and retry scheduling.
- Supabase advisors: no Phase 6 security warnings and no unindexed Phase 6 foreign keys. Fresh Phase 6 indexes are reported as unused until production traffic exercises them, which is expected.
- Next.js production build: passing end-to-end, including compilation, strict type validation, page-data collection, all 66 static pages, optimization, and trace collection.
- Vitest driver tests are checked in for mock immediate fulfillment, SMM normalization/redaction, reseller immediate delivery, and cancellation. The desktop sandbox blocked Vitest startup before tests ran because esbuild requested parent-directory access.
- `tests/database/fulfillment.sql` verifies assignment immutability and queue retry behavior transactionally after migration.
- `scripts/test-stock-concurrency.mjs` launches 100 simultaneous workers against 50 codes and requires 50 unique assignments plus 50 clean rejections. It refuses to run unless explicitly pointed at a disposable database.

## Deployment prerequisites

- Supabase migrations are already applied; future environments must run `drizzle/0018_phase6_fulfillment.sql` followed by `drizzle/0019_phase6_hardening.sql`.
- Configure `CRON_SECRET`, `ORDER_PAYLOAD_ENCRYPTION_KEY`, and `SUPPLIER_CREDENTIALS_ENCRYPTION_KEY` in Vercel.
- Configure the Vercel plan/scheduler to call `/api/cron/fulfillment` every minute. If the plan does not support one-minute cron, use Supabase Cron with an authenticated HTTP call to the same worker route.
- Add the sandbox mock supplier and map it to a seeded product variant before running the end-to-end automatic delivery acceptance check.
