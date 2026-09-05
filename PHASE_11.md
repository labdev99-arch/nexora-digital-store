# Phase 11 — AI platform and PWA

Phase 11 adds optional, isolated AI capabilities and an installable offline-capable web app. AI is an enhancement boundary: setting `AI_PROVIDER=disabled` leaves catalog, cart, checkout, payments, wallet, fulfillment, support, and administration fully operational.

## AI architecture

- `AiProvider` is the only provider-facing contract. The included OpenAI-compatible adapter supplies chat, 1,536-dimension embeddings, and payment-proof vision; models and endpoint are environment-configurable.
- `runAiText`, `runEmbeddings`, and `runProofVision` apply timeouts, graceful fallback, per-user limits, response caching where safe, and append-only usage telemetry with token, configured cost, latency, provider, model, cache, and outcome fields.
- `ai_jobs` provides leased `SKIP LOCKED` work, exponential retry, and a dead-letter terminal state. `/api/cron/ai` claims batches and Vercel invokes it every five minutes.
- No AI path can post wallet entries, approve a payment, refund an order, or bypass the existing order state machine. Deterministic business rules remain authoritative.

## Support RAG and isolation

Only published knowledge articles, active FAQs, and active products are embedded in `ai_documents`. Private orders are deliberately excluded from the vector index. At answer time the server obtains the authenticated user, retrieves that user's orders through the user-scoped Supabase client and RLS, and supplies only that result to the assistant. Retrieved text is delimited and explicitly treated as untrusted data, never as instructions.

Answers follow the selected locale, cite source URLs, abstain when grounding is insufficient, and can create a support ticket containing the complete conversation. Conversation and message RLS restricts customers to their own rows; `ai.manage` staff can review escalations.

## Recommendations, risk, OCR, and translation

- Recommendation refresh combines co-purchase edges with category/product-type similarity. Personalized rows derive from the customer's own completed purchases; popularity and featured products cover cold start.
- Explainable risk scoring covers amount, recent velocity, device/IP geography mismatch, proof reuse, and referral-loop evidence. Thresholds produce allow/review/hold decisions and a staff queue. Existing wallet and order commands remain the only mutation path.
- Proof OCR extracts integer minor-unit amount, currency, reference, date, and sender with confidence and mismatch flags. SHA-256 plus perceptual hashing detects exact and visually reused proofs; finance approval remains mandatory for manual rails.
- Translation jobs snapshot the source and locked glossary, generate a proposal for each enabled target locale, and publish only after a staff approval action.
- Admin intelligence accepts questions only against a server-built aggregate dataset. Fifteen-minute anomaly checks cover revenue drops, supplier failure spikes, and refund spikes; a daily digest is saved and sent to owners/admins.

## PWA

The generated manifest defines standalone display, icons, shortcuts, share target, scope, orientation, and iOS splash assets. `public/sw.js` implements:

- network-first localized navigation with designed `/en/offline` and `/ar/offline` fallbacks;
- stale-while-revalidate catalog/recommendation caching;
- IndexedDB background sync for allowlisted non-financial cart, support, and review actions only;
- Web Push display and safe notification-click focus/navigation;
- versioned cache cleanup and update activation.

`PwaManager` handles service-worker registration, connectivity state, install prompting, queued-action replay, and update readiness. The existing mobile shell supplies safe-area-aware bottom navigation and app-like transitions.

## Operations and verification

Required environment variables are documented in `.env.example`. For an enabled provider set `AI_PROVIDER`, provider credentials/models, pricing-per-million-token values, and `CRON_SECRET`. Run:

```bash
npm run check:pwa
npm run check:colors
npm run typecheck
npm run lint
npm run test:run
npm run build
```

Apply `drizzle/0033_phase11_ai_pwa.sql` and `drizzle/0034_phase11_functions.sql` before enabling the worker. Run `tests/database/ai.sql` with the other database security tests. After deployment, verify manifest/service-worker/offline responses and run Lighthouse against both locales.
