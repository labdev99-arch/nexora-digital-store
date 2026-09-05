# Nexora Digital Store

Production-oriented multilingual marketplace for digital goods and services. The application uses Next.js 15, strict TypeScript, Supabase Auth/Postgres/Storage/Realtime, Drizzle migrations, next-intl, and Vercel.

## Local setup

Requirements: Node.js 20.11+, npm 10.2+, Docker Desktop, and a Supabase project (or local Supabase CLI stack).

1. Copy `.env.example` to `.env.local` and fill the Supabase public URL/key plus one server-only Supabase key.
2. Run `npm ci`.
3. Start Postgres with `docker compose up -d`, or link the Supabase CLI project.
4. Apply checked-in migrations with `npm run db:migrate`.
5. Seed the bilingual catalog with `npm run db:seed:catalog`.
6. Start the app with `npm run dev` and open `http://localhost:3000/en` or `/ar`.

Never commit `.env.local`. Any variable containing `SECRET`, private key material, provider token, or a Supabase server key belongs only in Vercel/Supabase secret storage.

## Quality gates

`npm run quality` runs token/color checks, PWA validation, RLS/policy audit, client-secret and mutation-authorization audit, formatting, lint, type checking, Vitest, production build, and bundle budgets. Run Playwright separately with `npm run test:e2e`; authenticated provider scenarios need the staging credentials documented in [LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md).

Database destructive/concurrency suites must only run against a disposable database with their explicit safety flags. k6 usage is documented in [RUNBOOK.md](./RUNBOOK.md).

## Deployment

- Production storefront: `https://nexora-digital-store.vercel.app`.
- Frontend and cron entry points: Vercel.
- Database, Auth, private Storage, Realtime, and database functions: Supabase.
- CI: GitHub Actions on pushes to `main` and pull requests.
- Health probe: `/api/health`.
- Public API docs: `/en/developers` and `/ar/developers`; OpenAPI document: `/api/openapi.json`.

Read [ARCHITECTURE.md](./ARCHITECTURE.md), [DATABASE.md](./DATABASE.md), [RUNBOOK.md](./RUNBOOK.md), and [SECURITY.md](./SECURITY.md) before production changes.
