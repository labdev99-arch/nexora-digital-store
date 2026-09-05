# Phase 10 — Notifications, Realtime, Support and Reviews

## Delivered

- A single `notify(userId, event, data)` queue fans out localized templates to in-app, Resend email, Web Push, WhatsApp Cloud API, Telegram Bot, and an SMS-ready HTTP adapter.
- Idempotent event intake, per-channel delivery records, exponential retries, dead-letter status, quiet hours, event/channel preferences, and global unsubscribe handling.
- WhatsApp opt-in with one-time verification, approved-template delivery, signed inbound webhook, and localized “where is my order” responses.
- Telegram deep-link account linking, signed webhook processing, order notifications, and `/orders`, `/balance`, `/status <id>`, and `/support` commands.
- Live in-app notifications, order events, wallet balances, support conversations, and the admin support queue through Supabase Realtime.
- Support tickets with categories, priorities, SLA deadlines, assignment fields, per-order chat, private attachments, internal notes, canned replies, ratings, and controlled reopening.
- A public localized knowledge base and FAQ with Postgres full-text search.
- Verified-purchase reviews, up to five private image uploads, moderation, admin replies, product aggregates, and Product JSON-LD ratings.

## Operations

- The Vercel notification worker runs every minute at `/api/cron/notifications` and requires `CRON_SECRET`.
- Configure the provider variables documented in `.env.example`; providers without credentials fail safely into retry/dead-letter state.
- Register `/api/notifications/webhooks/whatsapp` and `/api/notifications/webhooks/telegram` with the matching provider secrets.
- WhatsApp outbound template names are stored per locale in `notification_templates.provider_template_name` so approved Meta names can be changed without code.
- Run `tests/database/engagement.sql` against a disposable database after migrations and keep Realtime enabled for the four documented tables.

## Security invariants

- Every Phase 10 table has RLS and explicit grants; service-only queues and webhook logs are not client-writable.
- WhatsApp and Telegram webhook signatures/secrets are verified before parsing or processing payloads.
- External channel identifiers are encrypted and separately hashed; verification codes and deep-link tokens are stored only as hashes.
- Support and review files use private buckets, ownership checks, file-type limits, and size limits.
- Reviews can only be created through the database RPC for a delivered or completed order item owned by the caller.
