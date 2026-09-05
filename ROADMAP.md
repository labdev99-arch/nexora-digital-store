# Nexora Delivery Roadmap

Each phase is a production-capable vertical increment. A phase is accepted only after its migration, RLS policies, authorization, localized UI states, observability, automated tests, and documentation are complete.

## Phase 0 — Architecture and platform foundation

### Deliverables

- `ARCHITECTURE.md`, complete target `DATABASE.md`, and this 12-phase plan.
- Next.js 15 strict TypeScript bootstrap with App Router, Tailwind, shadcn conventions, next-intl, Drizzle, Supabase clients, TanStack Query, and Zustand.
- Token-first dark/light design foundation and bilingual `/ar` + `/en` homepage skeleton.
- Language, theme, and USD/LBP/EUR/SAR/AED switchers; mobile navigation; matching loading/error states.
- Foundational Drizzle schema/migration, RLS examples, append-only wallet guard, atomic wallet command.
- ESLint, Prettier, Husky/lint-staged, Vitest, CI, environment contract, and pgvector Postgres Compose service.

### Acceptance criteria

- `/ar` renders RTL with an explicit Arabic webfont; `/en` renders LTR.
- Theme and currency preferences survive reload; no component contains hardcoded hex colors.
- `npm run format:check`, lint, typecheck, tests, and production build pass.
- Foundational migration enables RLS on every created public table and prevents wallet transaction update/delete.
- Documentation covers every Master Spec domain without implementing post-Phase-0 business features.

## Phase 1 — Identity, authorization, and localization — complete

### Deliverables

- Email/password, magic link, Google/Apple OAuth, phone OTP, verification/reset, TOTP 2FA, device sessions, remote logout.
- Profiles with avatar, locale/currency/timezone/country, consent, referral, and KYC status.
- Customer/reseller/affiliate/support/fulfiller/finance/admin/owner roles, live permission mappings, RLS helpers, and reusable server guards.
- Data-driven locale/currency registries, cookie/header locale resolution, Intl formatters, and localized auth/account/email catalogs.
- Protected localized account, administration, and reseller shells with profile, security, notification, and preference screens.
- Private avatar storage, per-device session mirror, single-session revocation, and audit-ready security boundaries.

### Acceptance criteria

- Every auth method completes or clearly reports configuration requirements in ar/en.
- Removing a permission immediately blocks both server mutation and data access.
- English and Arabic auth screens switch LTR/RTL correctly and contain no Phase 1 hardcoded UI copy.
- Playwright covers signup, verification, login, TOTP, and logout in both launch locales when Supabase E2E credentials are available.
- Users can list and revoke individual sessions or sign out globally.

## Phase 2 — Catalog, media, search, and admin catalog

**Status:** Complete (2026-08-10). See `PHASE_2.md` for the implementation and verification record.

### Deliverables

- Nested categories; five product types; variants, option schemas, player ID/URL/file fields, galleries, bundles, add-ons, related items.
- Stock/coming-soon/out-of-stock states; code inventory ingestion shell; supplier/product mappings.
- Localized search, filters, autocomplete, category/product SEO, JSON-LD, sitemap and OG generation.
- Premium catalog/product UI with tilt/shine/live-price affordances, skeletons, empty/error states.
- Admin CRUD, split-view editor, translation completion indicators, bulk CSV/Excel import-export, media management.

### Acceptance criteria

- One realistic product from each catalog domain is purchasable in its valid configuration shape.
- Invalid player IDs, URL targets, quantities, regions, or option combinations are rejected server-side.
- Draft/deleted products are invisible through RLS and direct URLs.
- Product/category metadata, hreflang and structured data validate for ar/en.
- Import is idempotent, reports row-level errors, and all admin changes appear in the audit log.

## Phase 3 — Wallet ledger and financial controls (complete)

### Deliverables

- Append-only double-entry ledger, multi-currency available/held sub-balances, immutable entries, and trigger-only balance cache.
- Locked credit, debit, hold, and release functions with negative-balance prevention and exact idempotency replay.
- Nightly derived-balance reconciliation, critical admin alerts, wallet freeze, and audited reasoned adjustments.
- Localized user wallet, filterable transaction detail/statement, and Arabic-capable CSV/PDF exports.
- Finance wallet workspace with customer lookup, ledger export, freeze/unfreeze, and signed adjustments.

### Acceptance criteria

- Concurrent debits cannot overdraw or lose an update; a disposable test fires 100 parallel debits.
- Duplicate idempotency keys return the original transaction and conflicting payloads fail.
- Direct ledger UPDATE/DELETE and cached-balance mutation fail at database level.
- Cached and fully derived balances reconcile with zero drift; mismatches create critical alerts.
- User and finance routes are role protected, localized, responsive, and export valid Arabic statements.

## Phase 4 — Pricing, checkout preparation, and payment rails

### Deliverables

- Integer-money pricing, FX, promotions, coupons, cart quote snapshots, and country tax/VAT rules.
- Whish, OMT, bank/cash proof flows; Stripe Payment Intents/3DS adapter; NOWPayments crypto chains/confirmations; local-card adapter seam.
- Private proof upload, OCR-assist queue, finance verification workspace, signed webhook ingress and replay defense.
- Wallet top-up experience, proof review, localized receipts, provider limits, and payment status tracking.

### Acceptance criteria

- Quotes are deterministic from integer inputs and an immutable rate/rule snapshot.
- Coupon and payment concurrency cannot exceed usage limits or create duplicate business results.
- Cart totals match checkout totals or checkout explicitly returns a refreshed quote.
- Each payment adapter passes a shared initiate/verify/webhook/refund/status contract suite.

## Phase 5 — Checkout, orders, invoices, and realtime tracking

### Deliverables

- Guest/auth checkout, wallet-default payment, external payment continuation, checkout recovery.
- Immutable order/item/customer/address/price/tax/option snapshots.
- Enforced order state machine, timeline events, live pulsing state UI, partial delivery and disputes.
- Arabic-capable PDF invoices/receipts, signed access, email receipt event.
- Order history/details, one-click reorder and optimistic non-money actions.

### Acceptance criteria

- Illegal state transitions fail in both application and database tests.
- Paid wallet checkout atomically creates the order, ledger debit, history, and outbox event.
- Realtime UI reconnects/refetches without missing the authoritative state.
- Guest order access requires a scoped signed token plus email verification.
- PDF snapshots reproduce stored totals and render Arabic without missing glyphs.

## Phase 6 — Automatic and manual fulfillment

**Implementation status:** code complete; production migration and live sandbox acceptance pending explicit deployment approval.

### Deliverables

- Atomic encrypted code inventory assignment and inventory controls.
- Generic Perfect Panel/SMMProvider and generic reseller drivers; normalized capabilities/statuses.
- Retry with jitter, circuit breaker, supplier balance/reliability metrics, job attempts and dead-letter queue.
- Hybrid auto-then-manual behavior; manual queue with SLA, claim/assign, internal notes, chat and secure text/code/link/file delivery.
- Milestones, revision rounds, requirements, deliverables for freelance services.

### Acceptance criteria

- Load tests cannot double-assign a code or duplicate a supplier order.
- Driver failures trip/recover circuit state and exhausted attempts surface once in dead letters.
- Hybrid failure creates exactly one manual task with full attempt context.
- Unauthorized staff cannot claim, inspect, or deliver tasks outside permissions.
- Auto and manual critical E2E purchases finish in delivered/completed state and notify the customer.

## Phase 7 — Administration and business intelligence

**Implementation status:** complete; migrations `0020`–`0022` applied to production Supabase.

### Deliverables

- Executive dashboard with date/currency controls, profit from supplier cost, funnel, customer mix, rankings, wallet float, manual queue, supplier reliability and live activity.
- Cohort retention, LTV and churn analysis.
- Permission-aware CRUD hub for commerce, customer, finance, operations, marketing and content domains.
- Drag-sortable, scheduled, localized homepage builder connected to the public storefront.
- Localized notification/email template editor with declared-variable preview.
- Saved filters, bulk actions, CSV/SpreadsheetML import-export and searchable append-only audit explorer.

### Acceptance criteria

- Admin pages and handlers enforce `admin.access` plus the resource permission; navigation exposes only authorized areas.
- Generic CRUD cannot mutate wallet balances, payments, order state or encrypted stock payloads.
- Dashboard values come from order, supplier-cost, wallet, payment and fulfillment sources and convert with configured rates.
- Every administrative mutation writes an immutable before/after audit record.
- All new tables have RLS and explicit grants; advisor findings introduced by the phase are remediated.
- Strict typecheck, lint, unit tests, token-color gate and production build pass.

## Phase 8 — Reseller platform and public API

**Implementation status:** complete; migrations `0023`–`0026` applied and verified in production Supabase.

### Deliverables

- Bronze/Silver/Gold/Platinum wholesale tiers, 30-day volume upgrades, audited manual override, credit limits, and tier-specific pricing.
- Localized reseller dashboard, bulk orders, spend history, balances, downloadable price lists, key and webhook management.
- REST API v1, scoped sandbox/live keys, HMAC signing, timestamp/nonces, IP allowlists, atomic per-key rates, and idempotent orders.
- Signed outgoing webhooks with exponential retry/dead-letter handling, OpenAPI 3.1 documentation, and SMM-panel compatibility.

### Acceptance criteria

- Tier changes affect only new quotes and preserve prior order snapshots.
- Sandbox orders cannot touch live balances; live orders reuse the wallet ledger and fulfillment pipeline.
- Signed requests reject tampering, stale timestamps, replayed nonces, scope violations, disallowed IPs, and rate-limit excess.
- Webhook deliveries are signed, logged, retried, and eventually moved to a visible dead-letter state.

## Phase 9 — Notifications, PWA, and growth surfaces

### Deliverables

- Locale/versioned templates for email, WhatsApp Cloud API, Telegram Bot, Web Push and in-app notifications.
- Per-event/channel preference matrix, mandatory transactional overrides, retries and delivery logs.
- Installable PWA, offline shell, safe background sync, push, splash assets, share target and app navigation.
- Blog MDX, newsletter, homepage builder, banners/sections, UTM attribution and abandoned-cart recovery.
- Consent-gated GA4, Meta and TikTok pixels.

### Acceptance criteria

- Preference combinations are honored while mandatory security/payment events still deliver.
- Notification jobs are idempotent; provider failures retry/dead-letter without duplicate sends.
- Lighthouse PWA installability passes; offline navigation presents a localized designed shell.
- Background sync never repeats money-moving operations without an idempotency key.
- Marketing scripts do not load before the matching consent category.

## Phase 10 — AI and personalization

### Deliverables

- pgvector knowledge chunks, ingestion/versioning, citations, RAG support with order-history tool authorization.
- Collaborative and personalized recommendations with cold-start fallbacks.
- Fraud-risk feature pipeline, explainable score/version, review feedback and thresholds.
- Payment-proof OCR assistance with confidence/evidence; human remains authoritative for manual rails.
- Admin-assisted product translation for enabled locales with review/publish states.

### Acceptance criteria

- Chat cannot retrieve another user's orders or unpublished/internal knowledge.
- Grounded answers cite KB sources and abstain below relevance threshold.
- AI outputs never directly post money, approve KYC, refund, or change order state.
- Risk/OCR decisions store model/prompt version, features, confidence and reviewer outcome.
- Generated translations require explicit human publication and never overwrite edited copy silently.

## Phase 11 — Admin intelligence, hardening, and launch

### Deliverables

- Revenue/profit/orders/funnel/products/supplier/refund/LTV/cohort dashboards with RTL token-styled charts.
- Dense accessible data tables, inline editing, bulk actions, command palette, audit explorer.
- Feature flags, maintenance mode, locale/currency/template/homepage controls and operational runbooks.
- Full CI/CD, preview isolation, migration gates, backups/restore drill, load/security/accessibility/performance tests.
- Complete Playwright matrix: signup, top-up, automatic/manual purchase, refund, reseller API; seed/demo data.

### Acceptance criteria

- Dashboard totals reconcile against ledger/order source queries for fixed fixtures.
- RLS/security review finds no public table, bucket, function, or Realtime channel without an explicit posture.
- Backup restore and wallet reconciliation drills complete within agreed RTO/RPO.
- Critical E2E, WCAG 2.1 AA, RTL, performance budgets, failure injection and webhook replay suites pass.
- Production readiness review signs off payments, refunds, fulfillment fallback, incident response, privacy, and observability.

## Phase 11 implementation alignment — AI and PWA

The executed Phase 11 follows the current master specification: isolated support RAG, hybrid recommendations, explainable fraud scoring, proof OCR, reviewed translation, admin intelligence, and a fully optional provider abstraction; plus manifest, service worker, offline shell, safe background sync, push handling, splash screens, and install UX. Its schema is delivered by migrations `0033` and `0034`, with implementation and operational details in `PHASE_11.md`.

### Acceptance criteria

- Shared embeddings contain public approved content only; a user's order context is fetched server-side under that user's RLS identity.
- AI-disabled mode preserves every core store flow, and no AI output can directly move money or approve a financial action.
- Recommendations provide collaborative, content-similarity, personalized, cross-sell, and popularity fallback paths.
- Risk/OCR/translation decisions remain explainable and human-reviewable; usage records include tokens, configured cost, latency, model, and outcome.
- The PWA is installable and provides localized offline navigation, cache versioning, push handling, and an allowlisted non-financial sync queue.
- Type, lint, unit, PWA static, production build, and database security checks pass before release.
