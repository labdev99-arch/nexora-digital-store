-- Phase 8 performance hardening: cover every reseller foreign key used by joins and deletes.
CREATE INDEX reseller_tiers_threshold_currency_idx ON public.reseller_tiers(threshold_currency_code);
CREATE INDEX reseller_tiers_credit_currency_idx ON public.reseller_tiers(credit_currency_code);
CREATE INDEX reseller_accounts_current_tier_idx ON public.reseller_accounts(current_tier_id);
CREATE INDEX reseller_accounts_volume_currency_idx ON public.reseller_accounts(volume_currency_code);
CREATE INDEX reseller_accounts_credit_currency_idx ON public.reseller_accounts(credit_currency_code);
CREATE INDEX reseller_tier_events_from_tier_idx ON public.reseller_tier_events(from_tier_id);
CREATE INDEX reseller_tier_events_to_tier_idx ON public.reseller_tier_events(to_tier_id);
CREATE INDEX reseller_tier_events_currency_idx ON public.reseller_tier_events(currency_code);
CREATE INDEX reseller_sandbox_orders_currency_idx ON public.reseller_sandbox_orders(currency_code);
CREATE INDEX reseller_api_request_logs_api_key_idx ON public.reseller_api_request_logs(api_key_id);
