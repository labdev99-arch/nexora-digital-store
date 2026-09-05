# Launch checklist

## Environment matrix

| Area             | Development               | Staging                             | Production                                 |
| ---------------- | ------------------------- | ----------------------------------- | ------------------------------------------ |
| Supabase         | local/disposable          | separate project                    | dedicated project with backups/PITR        |
| Payments         | sandbox only              | sandbox and low-value certification | live keys after sign-off                   |
| Suppliers        | mock                      | sandbox/test account                | live keys with limits/failover             |
| AI               | disabled or test          | capped test key                     | capped live key; graceful fallback enabled |
| Notifications    | console/test destinations | approved test recipients            | verified domains/templates/webhooks        |
| Rate limiting    | memory or Upstash dev     | dedicated Upstash DB                | dedicated production Upstash DB            |
| Sentry/analytics | disabled                  | staging projects                    | production projects; consent gated         |

All variables in `.env.example` must have an explicit owner and value/intent per environment. Secrets must exist only in Vercel/Supabase/GitHub encrypted stores.

## Infrastructure and trust

- [ ] Production Supabase project is active; migration `0035` applied; all database tests pass.
- [ ] Supabase Security and Performance Advisors show no unresolved critical finding.
- [ ] Daily backup and PITR retention are enabled and a restore drill is recorded.
- [ ] Custom domain is attached to Vercel, HTTPS is forced, HSTS is verified, and DNS ownership is documented.
- [ ] Resend domain has SPF and DKIM. Publish `_dmarc` initially with reporting, review reports, then move to quarantine/reject.
- [ ] Google OAuth production domain and exact Supabase callback are approved; redirect allowlist contains production/staging only.
- [ ] Turnstile production host, Upstash, Sentry, uptime probes, alert recipients, and escalation rota are active.

## Commerce smoke test

- [ ] Replace demo catalog with reviewed real categories/products, costs, prices, warranties, delivery estimates, regional rules, and stock.
- [ ] Test signup/verification/login/MFA, each enabled top-up provider, wallet purchase, direct payment, automatic code, supplier failover, manual delivery, refund, coupon, reseller order/webhook, affiliate attribution, notifications, and support.
- [ ] Repeat customer-critical flows in English and Arabic at 320px and desktop; confirm RTL, invoice/PDF Arabic, keyboard, screen reader, and automated WCAG AA.
- [ ] Wallet concurrency, reconciliation, append-only triggers, payment replay, webhook replay, stock assignment concurrency, and illegal order transitions pass.
- [ ] Run top-20 `EXPLAIN (ANALYZE, BUFFERS)` on staging, Playwright, Lighthouse, bundle budget, and k6. Archive artifacts with the release.

## SEO, analytics, and legal

- [ ] Replace `nexora.example` legal/support addresses with monitored company mailboxes and counsel-approved entity/jurisdiction text.
- [ ] Privacy, terms, refund, cookies, consent withdrawal, GDPR export/deletion, and retention schedule are approved in ar/en.
- [ ] Submit each locale sitemap to Google/Bing, verify robots/canonical/hreflang/JSON-LD/OG, and test 404/redirects.
- [ ] Enable GA4/Meta/TikTok only after consent; validate denial mode and unsubscribe/quiet hours.

## Go-live sequence

Freeze catalog/config, take backup, apply migration, deploy, warm/cache critical pages, run health and synthetic checkout, enable providers one at a time, then suppliers and marketing. Monitor errors, payment/fulfillment queues, wallet float, reconciliation, latency, and support for at least four hours. Keep rollback owner and last healthy deployment ready. Announce launch only after the financial smoke test reconciles exactly.
