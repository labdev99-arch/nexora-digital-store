# Nexora admin manual (English)

Use an individual MFA-protected staff account; never share owner credentials. The UI hides unauthorized controls and the server repeats every permission check.

- **Dashboard**: choose date/currency, inspect revenue, supplier cost/margin, queues, refunds, wallet float, reliability, LTV/cohorts, and live activity. Investigate anomalies before exporting.
- **Catalog**: maintain bilingual content, inputs, variants, costs/prices, fulfillment mode, stock/warranty/SEO. Preview ar/en and never activate a supplier-mapped item without a test.
- **Orders/Fulfillment**: follow immutable events, claim manual work, store internal notes separately, and deliver only through supported encrypted payload/file controls. Never edit order status or codes in SQL.
- **Payments/Wallets**: compare proof/reference/amount, OCR/duplicate flags, and audit evidence. Adjust a wallet only with permission and a mandatory reason; never edit the ledger. Four-eyes review is recommended for large refunds/adjustments.
- **Suppliers/Jobs**: watch health, balance, margins, circuit state, job attempts/dead letters, polling age, and failover. Disable a degraded supplier before data correction.
- **Users/RBAC/KYC**: grant least privilege with expiry, document escalation, review device/session anomalies, and access private files only for a case.
- **Growth/Reseller/Support**: investigate referral fraud and payout holds, protect API secrets, verify webhook delivery, respect SLA/quiet hours/unsubscribe, and moderate reviews with reasons.
- **Settings/Launch**: feature flags and maintenance mode are preferred emergency controls. Currency, tax, fee, locale, template, and homepage changes require preview and audit reason.

Exports may contain personal data: use approved devices and delete them after purpose. Follow `RUNBOOK.md` for incidents, stuck orders, key rotation, rollback, deletion, and backups.
