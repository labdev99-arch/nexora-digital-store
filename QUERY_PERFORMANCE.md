# Query performance review

The launch suite in `tests/database/query-performance.sql` covers the twenty highest-risk read/write paths: account orders and timelines, payment queues, wallet statements, catalog/variants, cart, fulfillment/manual queues, suppliers, tickets, notifications, reseller webhooks, and recommendations.

Run it on staging with production-like statistics and `pg_stat_statements` enabled. Archive JSON plans. Review sequential scans on large/selective tables, row-estimate errors, heap fetches, temporary files, lock wait, and p95 latency. The Phase 12 migration adds partial/covering indexes for active account orders, order queues, payments, catalog, and support. Existing phase migrations cover wallet, idempotency, stock, supplier, notification, and reseller paths.

Do not add indexes solely to silence a plan: verify selectivity and write/storage cost. Remove N+1 patterns by batching relationships, selecting only required columns, and resolving related records in one server query. Re-run Supabase Performance Advisor and `ANALYZE` after large catalog imports. Because the current Supabase project is inactive, real `EXPLAIN (ANALYZE, BUFFERS)` evidence must be captured after restoration and remains a launch gate.
