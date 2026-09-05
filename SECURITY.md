# Security model

## Enforced controls

- Every public table must enable RLS and define at least one policy. `scripts/check-rls.mjs` checks migrations in CI and queries `pg_class`/`pg_policy` when `SECURITY_AUDIT_DATABASE_URL` is available.
- Browser mutations are protected with Origin and Fetch Metadata checks. Signed webhooks, cron routes, and HMAC reseller APIs are explicitly separated from cookie-authenticated routes.
- Middleware applies a nonce-based CSP, frame denial, HSTS, restrictive referrer/permissions policies, and endpoint-class rate limits. Distributed limits use Upstash; the in-memory fallback is for local development only.
- Every mutation must expose an authorization, signature, or cron guard marker. `scripts/check-security.mjs` fails CI on an unguarded mutation or suspicious public/client secret.
- Supabase server keys are isolated in server-only modules. Files are private by default and delivered through short-lived signed URLs.
- Stock codes, delivery payloads, supplier credentials, notification destinations, and reseller secrets use authenticated application-level encryption keys. Rotate them with the runbook procedure.
- Payment, WhatsApp, Telegram, reseller, and supplier callbacks must verify signatures before parsing trusted fields and record replay identifiers.
- Logs and Sentry disable default PII and redact tokens, cookies, email, phone, addresses, proof payloads, and authorization headers.
- Turnstile is fail-closed when `TURNSTILE_SECRET_KEY` is enabled. Leave both Turnstile variables unset in local development.

## Reporting

Send security reports privately to `security@nexora.example`. Do not open a public issue containing credentials, customer data, proof images, delivery codes, or exploit details.

## Release audit

Before launch, run `npm run quality`, `npm audit --omit=dev --audit-level=high`, Supabase Security Advisor, Performance Advisor, the database query plan suite, Playwright, and the k6 staging test. A red gate blocks release.
