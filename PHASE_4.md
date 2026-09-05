# Phase 4 — Payments

## Provider boundary

`PaymentProvider` isolates initiation, verification, webhook normalization,
refunds and status checks. `payment_methods.driver` selects a registered driver;
the card driver may be replaced by setting `CARD_PAYMENT_PROVIDER` to `stripe`,
`areeba`, `netcommerce`, or `checkout` without changing checkout code.

Credentials are never stored in `payment_methods.config`; they are server-only
environment variables. Operational rules (availability, limits, fixed/basis-point
fees, currencies, countries, tiers, localized instructions, sandbox mode) are data.

## Atomic settlement

All successful provider events call `settle_wallet_topup()`. It locks the payment
row, returns immediately when already settled, posts the customer credit through
Phase 3's idempotent double-entry `wallet_credit()`, posts the processing fee as a
separate double-entry transfer, and only then records `wallet_transaction_id`.
Provider retries therefore cannot credit twice.

## Manual proof flow

Whish, OMT, bank and cash create a unique reference. Proofs are stored in the
private `payment-proofs` bucket. SHA-256 exact matching and a perceptual image hash
flag reused screenshots. The OCR boundary extracts amount, reference and date;
`PAYMENT_OCR_ENDPOINT` activates a real OCR service, while sandbox mode offers a
deterministic filename-based check for local tests. Finance staff approve/reject
with a mandatory reason through a database-authorized RPC.

## Crypto

The NOWPayments driver supports USDT TRC20/ERC20/BEP20, BTC and ETH with an
address, atomic-unit expected amount, expiry/rate-lock timestamps, network
confirmation thresholds and under/overpayment policy. Its IPN signature is
verified using HMAC-SHA512 over canonical JSON before any state change.

## Webhooks and audit

Provider signatures are verified before persistence. `(provider_code,
provider_event_id)` is unique and gives replay protection. Every payment action is
recorded in append-only `payment_audit_logs`; stored webhook payloads are for
operational diagnostics and must remain PII-minimized.
