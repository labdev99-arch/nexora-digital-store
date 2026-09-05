# External credentials and launch blockers

Prioritized by whether an enabled production flow can settle money or deliver an order.

## P0 — required before accepting real money

1. **Active Supabase production project**: restore the Nexora project (currently inactive because the free organization reached its active-project limit), then provide the project URL, publishable key, server secret/service-role key, direct `DATABASE_URL`, and database password through Vercel/Supabase secrets. Apply migrations `0033`–`0035`, run database suites and both advisors. Never paste these values into source or chat.
2. **Stripe or chosen card acquirer**: provide live secret/publishable keys and webhook signing secret after business/KYC approval. If replacing Stripe, provide Areeba, NetCommerce, or Checkout.com API base URL, merchant/account ID, signing/encryption specification, sandbox/live keys, refund/dispute API docs, and callback IPs/certificates. The `LocalCardGatewayProvider` remains intentionally non-settling until this arrives.
3. **Whish Money official API**: ask Whish for merchant/API access and provide sandbox/live base URLs, API key/client credentials, request-signing rules, payment-status/refund endpoints, webhook secret/certificate/IP allowlist, reference format, fees/limits, and settlement currencies. Until then keep the official API disabled and use the proof-review flow only.
4. **OMT merchant/API agreement**: provide merchant ID, sandbox/live endpoint and credentials, signature/webhook specification, status/refund capabilities, fee table, amount limits, supported currencies, and settlement SLA. Until then OMT is proof-review/manual approval only.
5. **Supplier APIs**: for every supplier provide company/contact, sandbox and live endpoints, API key, IP allowlist requirement, currency, price/service mapping, balance/status/cancel behavior, webhook or polling limits, SLA, refund rules, and rate limits. Load credentials through encrypted admin configuration and certify a low-value order before enabling.

## P1 — required for production communications and abuse controls

6. **WhatsApp Business Cloud approval**: provide Meta Business ID, approved WhatsApp Business Account/phone number ID, permanent system-user access token, app secret, webhook verification token, and approved locale template names for each event. Configure the exact webhook URL and subscribe to messages/statuses.
7. **Resend production domain**: provide API key and verified sender domain/address after SPF/DKIM; publish DMARC and give a monitored reply/support mailbox.
8. **Cloudflare Turnstile**: provide production site key and secret restricted to the real domains. Both variables must be enabled together.
9. **Upstash Redis**: provide a dedicated production REST URL/token for globally consistent rate limits. The memory fallback is not sufficient across Vercel instances.
10. **Sentry**: provide DSN, organization, project, and Vercel build auth token; configure alert destinations and PII scrubbing. Source-map token remains server/build-only.

## P2 — required only when the related feature is enabled

11. **NOWPayments/direct crypto watcher**: API/IPN secrets, payout/wallet policy, confirmation thresholds by network, callback allowlist, under/overpayment policy, and compliance approval. Direct-node mode additionally needs monitored node RPC credentials and hot-wallet procedures.
12. **Telegram Bot**: bot token, username, webhook secret, command/privacy configuration, and production webhook registration.
13. **Web Push**: VAPID public/private keys and a monitored `mailto:` subject.
14. **SMS adapter**: provider endpoint/token, sender ID, supported countries, consent/opt-out rules, and delivery callback signature.
15. **AI provider**: base URL/key, approved models, regional/data-processing terms, spending limit, and unit costs. AI may remain disabled without affecting checkout.
16. **Analytics/pixels**: GA4 measurement ID, Meta Pixel, and TikTok Pixel only after the legal consent configuration is approved. They are technically gated until consent.
17. **Apple OAuth**: no action now; keep disabled until an Apple Developer membership exists. Later provide service ID/team ID/key ID/private key and approved domains/callbacks.

## How to provide values safely

Add values directly to Vercel Production/Preview environment variables, Supabase Vault/Edge Function secrets, and GitHub Actions encrypted secrets. Tell the engineer only the variable names that are populated and the environment; do not send the secret values. Rotate any credential ever pasted into a file, screenshot, issue, or chat.
