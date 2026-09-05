# Phase 7 — Administration and business intelligence

## Outcome

Phase 7 provides a permission-aware administration surface at `/{locale}/admin`. It uses React Server Components for authorization and initial data, narrow route handlers for mutations, and a whitelisted resource registry. Wallet balances, payment records, stock-code secrets, and order states cannot be changed through generic CRUD.

## Areas

- Dashboard: date range and reporting-currency controls; revenue, supplier cost, gross profit/margin, AOV, refunds, wallet float, manual queue, conversion, customer mix, rankings, supplier reliability, daily charts, and a Realtime activity feed.
- Customer intelligence: monthly cohort retention, LTV, 90-day churn, active/churned counts.
- Resource console: product, variant, category, stock, supplier, order, user, role, wallet, payment, promotion, tier, loyalty, affiliate, support, review, content, banner, locale, currency, tax, payment-method, feature-flag, and platform-setting views.
- Content operations: scheduled localized homepage sections with drag ordering and storefront rendering; localized notification/email templates with variable preview and versioning.
- Operations: saved filters, pagination, search, sorting, bulk archive/delete where safe, UTF-8 CSV and SpreadsheetML import/export.
- Audit: append-only before/after records with actor, request ID, IP, user agent, hashes, resource, and timestamp.

## Security model

- The admin layout requires `admin.access`; each page and API handler additionally requires its resource permission.
- Navigation is derived from the caller's permission set. Hidden UI is convenience only; route handlers repeat authorization on the server.
- Resource names and columns are allowlisted. Sensitive ciphertext and supplier credentials are never selected.
- Generic mutations are disabled for wallets, payments, orders, and stock codes. Their existing transactional commands remain authoritative.
- Every new public table has RLS enabled and explicit grants. Service credentials remain server-only.
- `audit_logs` rejects UPDATE and DELETE through a database trigger, including service-role calls.

## Database releases

- `0020_phase7_admin.sql`: administration/content schema, permissions, RLS, grants, indexes, seeds, and append-only audit enforcement.
- `0021_phase7_hardening.sql`: Supabase Advisor remediation for foreign-key indexes and overlapping permissive policies.
- `0022_phase7_realtime.sql`: RLS-protected Realtime publication for the live audit activity feed.

All three migrations were applied to Supabase project `ojohrhpukavbnzjuqjfa` on 2026-08-15.

## Verification

- TypeScript strict check: passed.
- ESLint with zero warnings: passed.
- Raw-color token gate: passed.
- Vitest: 12 files and 57 tests passed, including the Phase 7 registry and tabular interchange tests.
- Next.js production build: passed; 79 routes/pages generated or traced.
- Database proof: every Phase 7 table reports RLS enabled with an access policy; `audit_logs_append_only` is enabled.
- Supabase performance advisor: no remaining Phase 7 missing-FK or overlapping-policy finding after hardening.

## Operational notes

- `audit_logs` is included in the Supabase Realtime publication; its SELECT RLS policy remains the subscription authorization boundary.
- Supabase leaked-password protection is a project-level Auth setting and should be enabled before launch.
- Existing SECURITY DEFINER RPC advisor warnings are intentional guarded Phase 1/3 commands; their bodies enforce self/finance authorization before mutation.
