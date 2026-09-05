-- Explicit service-only policies keep credential/security tables deny-by-default for users
-- while satisfying the project invariant that every table has at least one documented policy.
CREATE POLICY reseller_api_keys_service_only ON public.reseller_api_keys
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY reseller_api_nonces_service_only ON public.reseller_api_nonces
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY reseller_api_rate_windows_service_only ON public.reseller_api_rate_windows
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY reseller_api_idempotency_service_only ON public.reseller_api_idempotency
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY reseller_webhook_endpoints_service_only ON public.reseller_webhook_endpoints
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY reseller_api_request_logs_service_only ON public.reseller_api_request_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
