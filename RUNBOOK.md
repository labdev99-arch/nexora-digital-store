# Nexora operations runbook

## Deploy

1. Create a staging deployment from the release branch and apply migrations there first.
2. Run `npm run quality`, Playwright, the SQL database tests, and k6 against staging.
3. Confirm `/api/health`, cron logs, Supabase advisors, queue depth, wallet reconciliation, and a sandbox payment/order/refund.
4. Back up the production database and record the current Vercel deployment and migration number.
5. Apply forward-compatible migrations, deploy Vercel, then run the smoke checklist. Destructive cleanup ships in a later release only.

## Roll back

If application errors rise, immediately promote the last healthy Vercel deployment. Keep schema changes backward-compatible; never attempt an ad-hoc destructive down migration. Disable the affected feature/provider with feature flags, stop its cron, restore from backup/PITR only for confirmed data corruption, and reconcile wallets/orders after recovery. Record timeline, scope, and corrective action in an incident report.

## Rotate keys

Create a new least-privilege credential, store it in staging, validate, then store it in production and redeploy. For webhook keys, accept old and new during a short overlap when the provider supports it. Re-encrypt stored ciphertext with a controlled one-time job before retiring an encryption key. Revoke the old credential, inspect logs for use, and record rotation date/owner. A leaked Supabase service key, payment key, encryption key, or OAuth secret is a security incident.

## Add a payment provider

Implement the `PaymentProvider` interface and its webhook verifier, register it by configuration, add admin capabilities/limits/fees/instructions, create sandbox tests, and prove ledger settlement/refund idempotency. Add provider secrets to the env matrix; never branch checkout business logic by provider outside the registry.

## Add a language

Add a locale DB row, a complete `messages/<code>.json`, locale-aware email/notification templates, appropriate font coverage, and translation approvals. Run `scripts/generate-locales.mjs`, RTL/LTR screenshots, sitemap/hreflang checks, invoices, and Playwright. No route code change should be needed.

## Add a supplier

Implement or configure a supplier driver, encrypt its credential, map products, configure priority/margin/currency, validate balance/status/cancel in sandbox, and set circuit-breaker thresholds. Keep it disabled until health probes and a full mock/real low-value order pass.

## Handle a stuck order

Find the order and immutable events, payment settlement/idempotency record, fulfillment job/attempt, supplier order, and circuit state. Do not manually edit wallet or ledger rows. Retry only an idempotent job; otherwise move `auto_then_manual` to the manual queue with evidence. If unrecoverable, use the supported wallet refund flow and confirm the double-entry transaction, notification, and audit log.

## Backups and PITR

Enable daily backups and Supabase PITR for production; the exact retention depends on the paid plan. Quarterly, restore into an isolated project, run migrations/advisors, compare critical row counts, reconcile every wallet, and document recovery time/objectives. Encrypt external exports and delete test restores after verification.

## Monitoring and alerts

Probe `/api/health` every minute from two regions. Alert after two consecutive failures. In Sentry, alert on new high-volume errors, payment/webhook failures, checkout latency, cron failures, and error-rate regressions. Operational alerts also cover wallet mismatch, queue age, supplier circuit opening, low stock, failed notifications, refund spike, and API webhook dead letters.

## Data retention and deletion

The nightly retention route calls `run_data_retention()` with `CRON_SECRET`. Audit its `retention_runs` row. Account deletion has a seven-day cooling-off period and is blocked by active orders/disputes. Finance/audit/ledger records remain pseudonymized for statutory retention and are never physically edited to simulate deletion.

## Load test

Install k6 outside production and run `k6 run -e BASE_URL=https://staging.example tests/load/phase12.js`. For checkout, provide a dedicated test account cookie and safe sandbox `CHECKOUT_PAYLOAD`; for reseller API load, provide freshly signed headers. Stop if wallet reconciliation, supplier costs, error rate, or latency crosses the budgets in `performance-budget.json`.
