# Phase 5 — Commerce, checkout, and orders

## Delivered

- Persistent authenticated carts, hashed guest-cookie carts, login merge, dynamic option validation, stock checks, recently relevant upsells, and server-owned price snapshots.
- Integer-only authoritative pricing in the required order: base, tier, country, quantity, flash sale, coupons, loyalty, fees, then tax. The scenario table covers fixed, percentage, free-item, inclusive-tax, and combined pipelines.
- Scoped coupons with global/per-user limits, product/category targeting, stacking groups, expiry, first-order checks, automatic promotions, and lock-protected redemption claims.
- Wallet-default checkout, guest checkout, provider-backed direct payments, fake-provider sandbox settlement, proof upload, country tax rules, notes, terms acceptance, and stable checkout idempotency.
- Orders and immutable item snapshots with a database-enforced state machine. Every accepted transition creates an append-only `order_events` row.
- Authenticated and token-scoped guest order views, realtime timelines/chat, masked deliveries, encrypted payload reveal, private signed file downloads, cancel/refund requests, and one-click reorder.
- Localized A4 invoice and receipt PDF routes for users and guests. Noto Naskh Arabic is embedded and Latin/Arabic runs are separated to avoid missing glyphs.
- Hourly abandoned-cart recovery scheduling with three deduplicated recovery windows and localized Resend delivery.

## Database boundaries

`0016_phase5_commerce.sql` adds the complete commerce schema, RLS, storage policy, Realtime publication, cron enqueue job, coupon claim function, wallet checkout function, direct-payment settlement function, and order state triggers. `0017_phase5_hardening.sql` covers all Phase 5 foreign keys and separates staff mutation policies from public reads.

The money boundary remains the Phase 3 ledger. Wallet checkout calls `wallet_debit()` once. Direct settlement posts one double-entry platform transfer. Both use stable idempotency keys, lock the order/payment rows, and return the original result on replay.

## Verification

- Supabase migrations `phase5_commerce` and `phase5_hardening`: applied successfully.
- Transactional database test: illegal transition rejected, legal event history recorded, coupon replay returned the original redemption, and all synthetic data rolled back.
- Supabase advisor: no actionable Phase 5 missing-index or duplicate-policy findings after hardening; RLS confirmed enabled on all 19 Phase 5 tables.
- Vitest: 48 tests passing, including 11 authoritative pricing scenarios and two localized PDF generation tests.
- Production build, ESLint, strict TypeScript, formatting, and raw-color gate: passing.
- Playwright journeys are checked in for wallet purchase, simulated direct payment, coupon, and refund request. They require the documented E2E account, funded wallet, variant, and refundable order environment variables.
