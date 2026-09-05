# Phase 9 — Referrals, Affiliates, Loyalty and VIP

## Delivered

- Signed 90-day referral cookie, first/last-touch setting, server attribution, campaign links, WhatsApp/Telegram/X sharing, and locally generated QR codes.
- Affiliate applications, approval-linked RBAC, global/category/product commission rules, two levels, holding periods, refund reversal, payout reservation, wallet payout, and external payout review.
- Click, signup, conversion, per-link, pending/available/paid earnings, payout history, and marketing-asset dashboards.
- PII-safe device/IP hashing, self-referral blocking, device/IP velocity signals, clustering evidence, and a manual fraud queue.
- Append-only loyalty points ledger with purchase/category rules, seasonal and tier multipliers, referral/review/streak/badge bonuses, expiry, refund reversal, wallet and discount redemption.
- VIP tiers with discount, queue priority, limits, exclusive catalog, support and extras; nightly base-currency calculation, tier events, notifications, and progress UI.
- Admin reporting plus CRUD configuration for affiliates, rules, links, payouts, fraud, assets, loyalty rules, badges, VIP tiers, and growth settings.

## Safety invariants

- A profile can receive only one immutable referral attribution.
- Referral IP, device, and user-agent values are never stored raw.
- One order item can create at most one commission per affiliate level.
- Payout allocations reserve commission amounts under row locks and cannot be duplicated.
- Commission reversal and point reversal are compensating events; history is never rewritten.
- Loyalty entries are append-only and every redemption uses a unique idempotency key.
- Wallet rewards and affiliate payouts use the Phase 3 double-entry posting primitive.

## Operations

- `growth-maintenance-nightly` runs at 02:17 UTC through `pg_cron`.
- Configure `REFERRAL_COOKIE_SECRET` and `REFERRAL_HASH_SALT` as independent random secrets in every environment.
- Run `tests/database/growth.sql` against a disposable database after applying migrations.
