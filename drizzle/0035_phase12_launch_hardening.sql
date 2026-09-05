CREATE TABLE IF NOT EXISTS public.privacy_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  anonymous_id_hash text,
  policy_version text NOT NULL,
  necessary boolean NOT NULL DEFAULT true,
  analytics boolean NOT NULL DEFAULT false,
  marketing boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'web',
  ip_hash text,
  user_agent_hash text,
  withdrawn_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT privacy_consents_identity_check CHECK (profile_id IS NOT NULL OR anonymous_id_hash IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.data_export_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','ready','failed','expired')),
  storage_path text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz,
  failure_code text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','cooling_off','processing','completed','cancelled','blocked')),
  reason text,
  scheduled_for timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  processed_at timestamptz,
  blocked_reason text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.retention_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL CHECK (status IN ('running','completed','failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  deleted_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS privacy_consents_profile_created_idx
  ON public.privacy_consents(profile_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS privacy_consents_anonymous_created_idx
  ON public.privacy_consents(anonymous_id_hash, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS data_export_requests_profile_status_idx
  ON public.data_export_requests(profile_id, status, created_at DESC) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_requests_active_uidx
  ON public.account_deletion_requests(profile_id)
  WHERE status IN ('pending','cooling_off','processing') AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS account_deletion_requests_schedule_idx
  ON public.account_deletion_requests(status, scheduled_for) WHERE deleted_at IS NULL;

ALTER TABLE public.privacy_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_export_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY privacy_consents_own_select ON public.privacy_consents
  FOR SELECT TO authenticated USING (profile_id = auth.uid());
CREATE POLICY privacy_consents_own_insert ON public.privacy_consents
  FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());
CREATE POLICY data_export_requests_own_select ON public.data_export_requests
  FOR SELECT TO authenticated USING (profile_id = auth.uid());
CREATE POLICY data_export_requests_own_insert ON public.data_export_requests
  FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());
CREATE POLICY account_deletion_requests_own_select ON public.account_deletion_requests
  FOR SELECT TO authenticated USING (profile_id = auth.uid());
CREATE POLICY account_deletion_requests_own_insert ON public.account_deletion_requests
  FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());
CREATE POLICY retention_runs_service_only ON public.retention_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Defense-in-depth: make future public tables fail closed. CI additionally requires
-- at least one explicit policy because enabled RLS without a policy is not reviewable.
CREATE OR REPLACE FUNCTION public.enable_rls_for_new_public_table()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE command record;
BEGIN
  FOR command IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF command.schema_name = 'public' AND command.object_type IN ('table','partitioned table') THEN
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', command.object_identity);
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.enable_rls_for_new_public_table() FROM PUBLIC, anon, authenticated;

DROP EVENT TRIGGER IF EXISTS ensure_public_tables_have_rls;
CREATE EVENT TRIGGER ensure_public_tables_have_rls
  ON ddl_command_end WHEN TAG IN ('CREATE TABLE','CREATE TABLE AS')
  EXECUTE FUNCTION public.enable_rls_for_new_public_table();

CREATE OR REPLACE FUNCTION public.run_data_retention()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  result jsonb := '{}'::jsonb;
  affected integer;
  run_id uuid;
BEGIN
  INSERT INTO public.retention_runs(status) VALUES ('running') RETURNING id INTO run_id;

  DELETE FROM public.ai_cache WHERE expires_at < now() - interval '1 day';
  GET DIAGNOSTICS affected = ROW_COUNT;
  result := result || jsonb_build_object('ai_cache', affected);

  DELETE FROM public.reseller_api_nonces WHERE expires_at < now() - interval '1 day';
  GET DIAGNOSTICS affected = ROW_COUNT;
  result := result || jsonb_build_object('reseller_api_nonces', affected);

  DELETE FROM public.notification_webhook_events
    WHERE processed_at IS NOT NULL AND created_at < now() - interval '90 days';
  GET DIAGNOSTICS affected = ROW_COUNT;
  result := result || jsonb_build_object('notification_webhook_events', affected);

  DELETE FROM public.idempotency_keys
    WHERE created_at < now() - interval '400 days';
  GET DIAGNOSTICS affected = ROW_COUNT;
  result := result || jsonb_build_object('idempotency_keys', affected);

  UPDATE public.data_export_requests
    SET status = 'expired', storage_path = NULL, updated_at = now()
    WHERE status = 'ready' AND expires_at < now();
  GET DIAGNOSTICS affected = ROW_COUNT;
  result := result || jsonb_build_object('expired_exports', affected);

  UPDATE public.retention_runs
    SET status = 'completed', completed_at = now(), deleted_counts = result, updated_at = now()
    WHERE id = run_id;
  RETURN result;
EXCEPTION WHEN OTHERS THEN
  UPDATE public.retention_runs
    SET status = 'failed', completed_at = now(), error_code = SQLSTATE, updated_at = now()
    WHERE id = run_id;
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.run_data_retention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_data_retention() TO service_role;

-- Launch-critical partial/covering indexes for common read paths.
CREATE INDEX IF NOT EXISTS orders_profile_created_active_idx
  ON public.orders(profile_id, created_at DESC) INCLUDE (status, total_minor, currency_code)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS orders_status_created_active_idx
  ON public.orders(status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS payments_profile_created_active_idx
  ON public.payments(profile_id, created_at DESC) INCLUDE (status, requested_amount, currency_code)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS products_catalog_active_idx
  ON public.products(status, category_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS support_tickets_profile_updated_active_idx
  ON public.support_tickets(profile_id, updated_at DESC) WHERE deleted_at IS NULL;

INSERT INTO public.role_permissions(role, permission)
VALUES
  ('customer','privacy.export'),
  ('customer','privacy.delete'),
  ('admin','privacy.manage'),
  ('owner','privacy.manage')
ON CONFLICT DO NOTHING;
