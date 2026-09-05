-- Phase 6: fulfillment queue, code inventory, suppliers, and manual operations.
-- Network calls are deliberately outside database transactions. Workers atomically
-- claim short leases with SKIP LOCKED, call providers, then persist normalized results.

CREATE TYPE fulfillment_job_status AS ENUM ('pending','running','retrying','completed','failed','dead_letter','cancelled');
CREATE TYPE stock_code_status AS ENUM ('available','assigned','expired','disabled');
CREATE TYPE supplier_health_status AS ENUM ('healthy','degraded','open','disabled');
CREATE TYPE supplier_order_status AS ENUM ('queued','submitted','processing','partial','completed','failed','cancelled');
CREATE TYPE fulfillment_attempt_status AS ENUM ('queued','running','succeeded','failed','manual_fallback');
CREATE TYPE manual_fulfillment_status AS ENUM ('queued','claimed','in_progress','waiting_customer','delivered','completed','cancelled','sla_breached');
CREATE TYPE manual_fulfillment_priority AS ENUM ('normal','high','vip','urgent');

CREATE TABLE fulfillment_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status fulfillment_job_status NOT NULL DEFAULT 'pending',
  priority integer NOT NULL DEFAULT 100,
  run_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 6,
  locked_by text,
  locked_until timestamptz,
  last_error_code text,
  last_error_safe text,
  result jsonb,
  idempotency_key text NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fulfillment_jobs_kind_ck CHECK (kind ~ '^[a-z][a-z0-9_.-]{2,63}$'),
  CONSTRAINT fulfillment_jobs_aggregate_ck CHECK (aggregate_type ~ '^[a-z][a-z0-9_.-]{1,31}$'),
  CONSTRAINT fulfillment_jobs_payload_ck CHECK (jsonb_typeof(payload)='object'),
  CONSTRAINT fulfillment_jobs_attempts_ck CHECK (attempt_count>=0 AND max_attempts BETWEEN 1 AND 25),
  CONSTRAINT fulfillment_jobs_priority_ck CHECK (priority BETWEEN 0 AND 1000),
  CONSTRAINT fulfillment_jobs_lock_ck CHECK ((locked_by IS NULL)=(locked_until IS NULL))
);
CREATE UNIQUE INDEX fulfillment_jobs_idempotency_uidx ON fulfillment_jobs(kind,idempotency_key);
CREATE INDEX fulfillment_jobs_due_idx ON fulfillment_jobs(priority DESC,run_at,created_at)
  WHERE status IN ('pending','retrying');
CREATE INDEX fulfillment_jobs_running_lease_idx ON fulfillment_jobs(locked_until)
  WHERE status='running';
CREATE INDEX fulfillment_jobs_aggregate_idx ON fulfillment_jobs(aggregate_type,aggregate_id,created_at DESC);

CREATE TABLE fulfillment_job_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES fulfillment_jobs(id) ON DELETE RESTRICT,
  attempt_number integer NOT NULL,
  worker_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  outcome text,
  error_code text,
  error_safe text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fulfillment_job_attempts_number_ck CHECK (attempt_number>0),
  CONSTRAINT fulfillment_job_attempts_duration_ck CHECK (duration_ms IS NULL OR duration_ms>=0),
  CONSTRAINT fulfillment_job_attempts_outcome_ck CHECK (outcome IS NULL OR outcome IN ('completed','retry','failed','dead_letter'))
);
CREATE UNIQUE INDEX fulfillment_job_attempts_identity_uidx ON fulfillment_job_attempts(job_id,attempt_number);
CREATE INDEX fulfillment_job_attempts_job_idx ON fulfillment_job_attempts(job_id,started_at DESC);

CREATE TABLE fulfillment_dead_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL UNIQUE REFERENCES fulfillment_jobs(id) ON DELETE RESTRICT,
  reason_code text NOT NULL,
  reason_safe text NOT NULL,
  payload_snapshot jsonb NOT NULL,
  replayed_job_id uuid REFERENCES fulfillment_jobs(id) ON DELETE SET NULL,
  resolved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fulfillment_dead_letters_payload_ck CHECK (jsonb_typeof(payload_snapshot)='object')
);
CREATE INDEX fulfillment_dead_letters_open_idx ON fulfillment_dead_letters(created_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX fulfillment_dead_letters_replayed_idx ON fulfillment_dead_letters(replayed_job_id) WHERE replayed_job_id IS NOT NULL;
CREATE INDEX fulfillment_dead_letters_resolver_idx ON fulfillment_dead_letters(resolved_by) WHERE resolved_by IS NOT NULL;

CREATE TABLE stock_code_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  filename text NOT NULL,
  total_rows integer NOT NULL,
  imported_rows integer NOT NULL DEFAULT 0,
  duplicate_rows integer NOT NULL DEFAULT 0,
  rejected_rows integer NOT NULL DEFAULT 0,
  imported_by uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  error_report jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_import_counts_ck CHECK (total_rows>=0 AND imported_rows>=0 AND duplicate_rows>=0 AND rejected_rows>=0 AND imported_rows+duplicate_rows+rejected_rows<=total_rows),
  CONSTRAINT stock_import_errors_ck CHECK (jsonb_typeof(error_report)='array')
);
CREATE INDEX stock_import_variant_idx ON stock_code_import_batches(variant_id,created_at DESC);
CREATE INDEX stock_import_actor_idx ON stock_code_import_batches(imported_by,created_at DESC);

CREATE TABLE stock_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  import_batch_id uuid REFERENCES stock_code_import_batches(id) ON DELETE SET NULL,
  payload_ciphertext text NOT NULL,
  payload_hash text NOT NULL,
  display_hint text,
  status stock_code_status NOT NULL DEFAULT 'available',
  expires_at timestamptz,
  assigned_order_item_id uuid REFERENCES order_items(id) ON DELETE RESTRICT,
  assigned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_codes_hash_ck CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT stock_codes_assignment_ck CHECK ((status='assigned')=(assigned_order_item_id IS NOT NULL AND assigned_at IS NOT NULL)),
  CONSTRAINT stock_codes_expiry_ck CHECK (expires_at IS NULL OR expires_at>created_at)
);
CREATE UNIQUE INDEX stock_codes_variant_hash_uidx ON stock_codes(variant_id,payload_hash);
CREATE UNIQUE INDEX stock_codes_assignment_uidx ON stock_codes(id,assigned_order_item_id) WHERE assigned_order_item_id IS NOT NULL;
CREATE INDEX stock_codes_available_pool_idx ON stock_codes(variant_id,expires_at NULLS LAST,created_at)
  WHERE status='available';
CREATE INDEX stock_codes_assignment_item_idx ON stock_codes(assigned_order_item_id) WHERE assigned_order_item_id IS NOT NULL;
CREATE INDEX stock_codes_expiry_idx ON stock_codes(expires_at) WHERE status='available' AND expires_at IS NOT NULL;

CREATE TABLE suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  driver text NOT NULL,
  endpoint text NOT NULL,
  api_key_ciphertext text,
  currency_code text NOT NULL REFERENCES currencies(code) ON UPDATE CASCADE,
  margin_bps integer NOT NULL DEFAULT 0,
  priority integer NOT NULL DEFAULT 100,
  enabled boolean NOT NULL DEFAULT true,
  sandbox_mode boolean NOT NULL DEFAULT false,
  health_status supplier_health_status NOT NULL DEFAULT 'healthy',
  consecutive_failures integer NOT NULL DEFAULT 0,
  success_count bigint NOT NULL DEFAULT 0,
  failure_count bigint NOT NULL DEFAULT 0,
  partial_count bigint NOT NULL DEFAULT 0,
  average_latency_ms integer,
  last_health_check_at timestamptz,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT suppliers_code_ck CHECK (code ~ '^[a-z][a-z0-9_-]{2,47}$'),
  CONSTRAINT suppliers_driver_ck CHECK (driver IN ('smm_panel','reseller_api','mock')),
  CONSTRAINT suppliers_endpoint_ck CHECK (endpoint ~ '^https?://' OR (sandbox_mode AND endpoint ~ '^mock://')),
  CONSTRAINT suppliers_margin_ck CHECK (margin_bps BETWEEN -10000 AND 100000),
  CONSTRAINT suppliers_priority_ck CHECK (priority BETWEEN 0 AND 1000),
  CONSTRAINT suppliers_counts_ck CHECK (consecutive_failures>=0 AND success_count>=0 AND failure_count>=0 AND partial_count>=0),
  CONSTRAINT suppliers_settings_ck CHECK (jsonb_typeof(settings)='object')
);
CREATE UNIQUE INDEX suppliers_code_active_uidx ON suppliers(code) WHERE deleted_at IS NULL;
CREATE INDEX suppliers_routing_idx ON suppliers(enabled,health_status,priority) WHERE deleted_at IS NULL;
CREATE INDEX suppliers_currency_idx ON suppliers(currency_code);

CREATE TABLE supplier_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  external_service_id text NOT NULL,
  cost_amount bigint NOT NULL,
  cost_currency_code text NOT NULL REFERENCES currencies(code) ON UPDATE CASCADE,
  minimum_quantity integer NOT NULL DEFAULT 1,
  maximum_quantity integer,
  quantity_step integer NOT NULL DEFAULT 1,
  priority integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_products_cost_ck CHECK (cost_amount>=0),
  CONSTRAINT supplier_products_quantity_ck CHECK (minimum_quantity>0 AND quantity_step>0 AND (maximum_quantity IS NULL OR maximum_quantity>=minimum_quantity)),
  CONSTRAINT supplier_products_priority_ck CHECK (priority BETWEEN 0 AND 1000),
  CONSTRAINT supplier_products_mapping_ck CHECK (jsonb_typeof(mapping)='object')
);
CREATE UNIQUE INDEX supplier_products_identity_uidx ON supplier_products(supplier_id,variant_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX supplier_products_external_uidx ON supplier_products(supplier_id,external_service_id) WHERE deleted_at IS NULL;
CREATE INDEX supplier_products_routing_idx ON supplier_products(variant_id,active,priority) WHERE deleted_at IS NULL;
CREATE INDEX supplier_products_cost_currency_idx ON supplier_products(cost_currency_code);

CREATE TABLE supplier_circuits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  operation text NOT NULL DEFAULT 'place_order',
  state text NOT NULL DEFAULT 'closed',
  failure_count integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  opened_at timestamptz,
  probe_after timestamptz,
  last_error_safe text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_circuits_operation_ck CHECK (operation IN ('place_order','check_status','get_balance','cancel')),
  CONSTRAINT supplier_circuits_state_ck CHECK (state IN ('closed','open','half_open')),
  CONSTRAINT supplier_circuits_counts_ck CHECK (failure_count>=0 AND success_count>=0 AND version>0)
);
CREATE UNIQUE INDEX supplier_circuits_identity_uidx ON supplier_circuits(supplier_id,operation);
CREATE INDEX supplier_circuits_probe_idx ON supplier_circuits(probe_after) WHERE state='open';

CREATE TABLE supplier_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  supplier_product_id uuid NOT NULL REFERENCES supplier_products(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
  external_order_id text,
  idempotency_key text NOT NULL,
  status supplier_order_status NOT NULL DEFAULT 'queued',
  requested_quantity integer NOT NULL,
  delivered_quantity integer NOT NULL DEFAULT 0,
  target_ciphertext text,
  request_safe jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_safe jsonb NOT NULL DEFAULT '{}'::jsonb,
  cost_amount bigint NOT NULL DEFAULT 0,
  cost_currency_code text NOT NULL REFERENCES currencies(code) ON UPDATE CASCADE,
  placed_at timestamptz,
  completed_at timestamptz,
  last_checked_at timestamptz,
  next_poll_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_orders_quantity_ck CHECK (requested_quantity>0 AND delivered_quantity BETWEEN 0 AND requested_quantity),
  CONSTRAINT supplier_orders_cost_ck CHECK (cost_amount>=0),
  CONSTRAINT supplier_orders_json_ck CHECK (jsonb_typeof(request_safe)='object' AND jsonb_typeof(response_safe)='object')
);
CREATE UNIQUE INDEX supplier_orders_idempotency_uidx ON supplier_orders(idempotency_key);
CREATE UNIQUE INDEX supplier_orders_external_uidx ON supplier_orders(supplier_id,external_order_id) WHERE external_order_id IS NOT NULL;
CREATE INDEX supplier_orders_poll_idx ON supplier_orders(next_poll_at) WHERE status IN ('submitted','processing','partial');
CREATE INDEX supplier_orders_item_idx ON supplier_orders(order_item_id,created_at DESC);
CREATE INDEX supplier_orders_order_idx ON supplier_orders(order_id,created_at DESC);
CREATE INDEX supplier_orders_supplier_status_idx ON supplier_orders(supplier_id,status,created_at DESC);
CREATE INDEX supplier_orders_product_idx ON supplier_orders(supplier_product_id);
CREATE INDEX supplier_orders_cost_currency_idx ON supplier_orders(cost_currency_code);

CREATE TABLE supplier_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_order_id uuid NOT NULL REFERENCES supplier_orders(id) ON DELETE RESTRICT,
  from_status supplier_order_status,
  to_status supplier_order_status NOT NULL,
  delivered_quantity integer NOT NULL DEFAULT 0,
  response_safe jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_order_events_quantity_ck CHECK (delivered_quantity>=0),
  CONSTRAINT supplier_order_events_json_ck CHECK (jsonb_typeof(response_safe)='object')
);
CREATE INDEX supplier_order_events_order_idx ON supplier_order_events(supplier_order_id,created_at,id);

CREATE TABLE fulfillment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
  job_id uuid REFERENCES fulfillment_jobs(id) ON DELETE SET NULL,
  supplier_order_id uuid REFERENCES supplier_orders(id) ON DELETE SET NULL,
  stock_code_id uuid REFERENCES stock_codes(id) ON DELETE SET NULL,
  attempt_number integer NOT NULL,
  status fulfillment_attempt_status NOT NULL DEFAULT 'queued',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  next_retry_at timestamptz,
  error_code text,
  error_safe text,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fulfillment_attempts_number_ck CHECK (attempt_number>0),
  CONSTRAINT fulfillment_attempts_source_ck CHECK (num_nonnulls(supplier_order_id,stock_code_id)<=1)
);
CREATE UNIQUE INDEX fulfillment_attempts_identity_uidx ON fulfillment_attempts(order_item_id,attempt_number);
CREATE INDEX fulfillment_attempts_order_idx ON fulfillment_attempts(order_id,created_at DESC);
CREATE INDEX fulfillment_attempts_retry_idx ON fulfillment_attempts(next_retry_at) WHERE status='failed' AND next_retry_at IS NOT NULL;
CREATE INDEX fulfillment_attempts_job_idx ON fulfillment_attempts(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX fulfillment_attempts_supplier_order_idx ON fulfillment_attempts(supplier_order_id) WHERE supplier_order_id IS NOT NULL;
CREATE INDEX fulfillment_attempts_stock_idx ON fulfillment_attempts(stock_code_id) WHERE stock_code_id IS NOT NULL;

CREATE TABLE manual_fulfillment_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
  fallback_attempt_id uuid REFERENCES fulfillment_attempts(id) ON DELETE SET NULL,
  status manual_fulfillment_status NOT NULL DEFAULT 'queued',
  priority manual_fulfillment_priority NOT NULL DEFAULT 'normal',
  sla_due_at timestamptz NOT NULL,
  claimed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  started_at timestamptz,
  waiting_since timestamptz,
  completed_at timestamptz,
  failure_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manual_tasks_claim_ck CHECK ((claimed_by IS NULL)=(claimed_at IS NULL)),
  CONSTRAINT manual_tasks_version_ck CHECK (version>0),
  CONSTRAINT manual_tasks_context_ck CHECK (jsonb_typeof(failure_context)='object')
);
CREATE UNIQUE INDEX manual_tasks_active_item_uidx ON manual_fulfillment_tasks(order_item_id)
  WHERE status NOT IN ('completed','cancelled');
CREATE UNIQUE INDEX manual_tasks_fallback_uidx ON manual_fulfillment_tasks(fallback_attempt_id) WHERE fallback_attempt_id IS NOT NULL;
CREATE INDEX manual_tasks_queue_idx ON manual_fulfillment_tasks(
  (CASE priority WHEN 'urgent' THEN 4 WHEN 'vip' THEN 3 WHEN 'high' THEN 2 ELSE 1 END) DESC,
  sla_due_at,created_at
) WHERE status IN ('queued','sla_breached');
CREATE INDEX manual_tasks_claimant_idx ON manual_fulfillment_tasks(claimed_by,status) WHERE claimed_by IS NOT NULL;
CREATE INDEX manual_tasks_assignee_idx ON manual_fulfillment_tasks(assigned_to,status) WHERE assigned_to IS NOT NULL;
CREATE INDEX manual_tasks_order_idx ON manual_fulfillment_tasks(order_id,created_at DESC);

CREATE TABLE manual_fulfillment_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES manual_fulfillment_tasks(id) ON DELETE RESTRICT,
  author_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  body_ciphertext text NOT NULL,
  visibility text NOT NULL DEFAULT 'internal',
  attachment_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manual_notes_visibility_ck CHECK (visibility IN ('internal','customer'))
);
CREATE INDEX manual_notes_task_idx ON manual_fulfillment_notes(task_id,created_at,id);
CREATE INDEX manual_notes_author_idx ON manual_fulfillment_notes(author_id,created_at DESC);

CREATE TABLE fulfillment_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  audience text NOT NULL,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fulfillment_notifications_audience_ck CHECK (audience IN ('customer','staff')),
  CONSTRAINT fulfillment_notifications_payload_ck CHECK (jsonb_typeof(payload)='object')
);
CREATE INDEX fulfillment_notifications_profile_idx ON fulfillment_notifications(profile_id,created_at DESC) WHERE profile_id IS NOT NULL;
CREATE INDEX fulfillment_notifications_staff_idx ON fulfillment_notifications(created_at DESC) WHERE audience='staff' AND read_at IS NULL;
CREATE INDEX fulfillment_notifications_order_idx ON fulfillment_notifications(order_id,created_at DESC) WHERE order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.fulfillment_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN NEW.updated_at=statement_timestamp(); RETURN NEW; END;
$$;
REVOKE ALL ON FUNCTION private.fulfillment_touch_updated_at() FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE item text; BEGIN
  FOREACH item IN ARRAY ARRAY['fulfillment_jobs','fulfillment_job_attempts','fulfillment_dead_letters','stock_code_import_batches','stock_codes','suppliers','supplier_products','supplier_circuits','supplier_orders','supplier_order_events','fulfillment_attempts','manual_fulfillment_tasks','manual_fulfillment_notes','fulfillment_notifications']
  LOOP EXECUTE format('CREATE TRIGGER %I_touch BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION private.fulfillment_touch_updated_at()',item,item); END LOOP;
END $$;

CREATE OR REPLACE FUNCTION private.protect_assigned_stock_code()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP='DELETE' AND OLD.status='assigned' THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='assigned_stock_code_immutable';
  END IF;
  IF TG_OP='UPDATE' AND OLD.status='assigned' AND
     (NEW.status,NEW.assigned_order_item_id,NEW.assigned_at,NEW.payload_ciphertext,NEW.payload_hash)
       IS DISTINCT FROM
     (OLD.status,OLD.assigned_order_item_id,OLD.assigned_at,OLD.payload_ciphertext,OLD.payload_hash) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='assigned_stock_code_immutable';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE ALL ON FUNCTION private.protect_assigned_stock_code() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER stock_codes_protect_assignment BEFORE UPDATE OR DELETE ON stock_codes FOR EACH ROW EXECUTE FUNCTION private.protect_assigned_stock_code();

CREATE OR REPLACE FUNCTION private.block_fulfillment_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='fulfillment_event_append_only'; END;
$$;
REVOKE ALL ON FUNCTION private.block_fulfillment_event_mutation() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER supplier_order_events_append_only BEFORE UPDATE OR DELETE ON supplier_order_events FOR EACH ROW EXECUTE FUNCTION private.block_fulfillment_event_mutation();
CREATE TRIGGER manual_notes_append_only BEFORE UPDATE OR DELETE ON manual_fulfillment_notes FOR EACH ROW EXECUTE FUNCTION private.block_fulfillment_event_mutation();

CREATE OR REPLACE FUNCTION claim_fulfillment_jobs(p_worker_id text,p_limit integer DEFAULT 10,p_lease_seconds integer DEFAULT 60)
RETURNS SETOF fulfillment_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF session_user NOT IN ('postgres','supabase_admin') AND coalesce((SELECT auth.jwt()->>'role'='service_role'),false) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='service_role_required';
  END IF;
  IF nullif(trim(p_worker_id),'') IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_lease_seconds NOT BETWEEN 15 AND 900 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_job_claim';
  END IF;
  UPDATE public.fulfillment_jobs SET status='retrying',locked_by=NULL,locked_until=NULL,run_at=statement_timestamp()
    WHERE status='running' AND locked_until<statement_timestamp();
  RETURN QUERY
    WITH candidates AS (
      SELECT id FROM public.fulfillment_jobs
      WHERE status IN ('pending','retrying') AND run_at<=statement_timestamp()
      ORDER BY priority DESC,run_at,created_at
      FOR UPDATE SKIP LOCKED LIMIT p_limit
    ), claimed AS (
      UPDATE public.fulfillment_jobs j SET
        status='running',attempt_count=j.attempt_count+1,locked_by=p_worker_id,
        locked_until=statement_timestamp()+make_interval(secs=>p_lease_seconds)
      FROM candidates c WHERE j.id=c.id RETURNING j.*
    )
    SELECT * FROM claimed ORDER BY priority DESC,run_at,created_at;
END;
$$;
REVOKE ALL ON FUNCTION claim_fulfillment_jobs(text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION claim_fulfillment_jobs(text,integer,integer) TO service_role;

CREATE OR REPLACE FUNCTION finish_fulfillment_job(
  p_job_id uuid,p_worker_id text,p_succeeded boolean,p_result jsonb DEFAULT '{}'::jsonb,
  p_error_code text DEFAULT NULL,p_error_safe text DEFAULT NULL
) RETURNS fulfillment_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target public.fulfillment_jobs; delay_seconds integer;
BEGIN
  IF session_user NOT IN ('postgres','supabase_admin') AND coalesce((SELECT auth.jwt()->>'role'='service_role'),false) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='service_role_required';
  END IF;
  SELECT * INTO target FROM public.fulfillment_jobs WHERE id=p_job_id FOR UPDATE;
  IF target.id IS NULL OR target.status<>'running' OR target.locked_by IS DISTINCT FROM p_worker_id THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='job_lease_invalid';
  END IF;
  IF p_succeeded THEN
    UPDATE public.fulfillment_jobs SET status='completed',result=coalesce(p_result,'{}'::jsonb),locked_by=NULL,locked_until=NULL,completed_at=statement_timestamp()
      WHERE id=p_job_id RETURNING * INTO target;
    INSERT INTO public.fulfillment_job_attempts(job_id,attempt_number,worker_id,finished_at,outcome)
      VALUES(target.id,target.attempt_count,p_worker_id,statement_timestamp(),'completed');
    RETURN target;
  END IF;
  IF nullif(trim(p_error_safe),'') IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='job_error_required'; END IF;
  IF target.attempt_count>=target.max_attempts THEN
    UPDATE public.fulfillment_jobs SET status='dead_letter',last_error_code=p_error_code,last_error_safe=p_error_safe,locked_by=NULL,locked_until=NULL
      WHERE id=p_job_id RETURNING * INTO target;
    INSERT INTO public.fulfillment_dead_letters(job_id,reason_code,reason_safe,payload_snapshot)
      VALUES(target.id,coalesce(p_error_code,'unknown'),p_error_safe,target.payload) ON CONFLICT(job_id) DO NOTHING;
    INSERT INTO public.admin_alerts(severity,alert_type,title,message,resource_type,resource_id,fingerprint)
      VALUES('critical','fulfillment_dead_letter',jsonb_build_object('en','Fulfillment job exhausted','ar','فشل تنفيذ الطلب'),jsonb_build_object('en',p_error_safe,'ar','تحتاج العملية إلى مراجعة يدوية'),'fulfillment_job',target.id,'fulfillment-job:'||target.id)
      ON CONFLICT(fingerprint) WHERE status<>'resolved' DO NOTHING;
    INSERT INTO public.fulfillment_job_attempts(job_id,attempt_number,worker_id,finished_at,outcome,error_code,error_safe)
      VALUES(target.id,target.attempt_count,p_worker_id,statement_timestamp(),'dead_letter',p_error_code,p_error_safe);
  ELSE
    delay_seconds:=least(3600,30*(2^greatest(target.attempt_count-1,0)))+floor(random()*15)::integer;
    UPDATE public.fulfillment_jobs SET status='retrying',last_error_code=p_error_code,last_error_safe=p_error_safe,
      locked_by=NULL,locked_until=NULL,run_at=statement_timestamp()+make_interval(secs=>delay_seconds)
      WHERE id=p_job_id RETURNING * INTO target;
    INSERT INTO public.fulfillment_job_attempts(job_id,attempt_number,worker_id,finished_at,outcome,error_code,error_safe)
      VALUES(target.id,target.attempt_count,p_worker_id,statement_timestamp(),'retry',p_error_code,p_error_safe);
  END IF;
  RETURN target;
END;
$$;
REVOKE ALL ON FUNCTION finish_fulfillment_job(uuid,text,boolean,jsonb,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION finish_fulfillment_job(uuid,text,boolean,jsonb,text,text) TO service_role;

CREATE OR REPLACE FUNCTION assign_stock_code(p_order_item_id uuid)
RETURNS stock_codes LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.order_items; assigned public.stock_codes;
BEGIN
  IF session_user NOT IN ('postgres','supabase_admin') AND coalesce((SELECT auth.jwt()->>'role'='service_role'),false) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='service_role_required';
  END IF;
  SELECT * INTO item FROM public.order_items WHERE id=p_order_item_id FOR UPDATE;
  IF item.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='order_item_not_found'; END IF;
  WITH candidate AS (
    SELECT id FROM public.stock_codes
    WHERE variant_id=item.variant_id AND status='available' AND (expires_at IS NULL OR expires_at>statement_timestamp())
    ORDER BY expires_at NULLS LAST,created_at,id FOR UPDATE SKIP LOCKED LIMIT 1
  )
  UPDATE public.stock_codes s SET status='assigned',assigned_order_item_id=item.id,assigned_at=statement_timestamp()
  FROM candidate c WHERE s.id=c.id AND s.status='available' RETURNING s.* INTO assigned;
  IF assigned.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='stock_code_unavailable'; END IF;
  RETURN assigned;
END;
$$;
REVOKE ALL ON FUNCTION assign_stock_code(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION assign_stock_code(uuid) TO service_role;

CREATE OR REPLACE FUNCTION claim_manual_fulfillment_task(p_task_id uuid,p_staff_id uuid)
RETURNS manual_fulfillment_tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE claimed public.manual_fulfillment_tasks;
BEGIN
  IF (SELECT auth.uid()) IS DISTINCT FROM p_staff_id OR NOT (SELECT private.app_can('fulfillment.manage')) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='fulfillment_permission_required';
  END IF;
  UPDATE public.manual_fulfillment_tasks SET status='claimed',claimed_by=p_staff_id,assigned_to=coalesce(assigned_to,p_staff_id),
    claimed_at=statement_timestamp(),version=version+1
  WHERE id=(SELECT id FROM public.manual_fulfillment_tasks WHERE id=p_task_id AND status IN ('queued','sla_breached') FOR UPDATE SKIP LOCKED)
  RETURNING * INTO claimed;
  IF claimed.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='manual_task_unavailable'; END IF;
  RETURN claimed;
END;
$$;
REVOKE ALL ON FUNCTION claim_manual_fulfillment_task(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION claim_manual_fulfillment_task(uuid,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION create_manual_fulfillment_task(p_order_item_id uuid,p_failure_context jsonb DEFAULT '{}'::jsonb,p_fallback_attempt_id uuid DEFAULT NULL)
RETURNS manual_fulfillment_tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.order_items; target public.orders; task public.manual_fulfillment_tasks; selected_priority public.manual_fulfillment_priority;
BEGIN
  IF session_user NOT IN ('postgres','supabase_admin') AND coalesce((SELECT auth.jwt()->>'role'='service_role'),false) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='service_role_required';
  END IF;
  SELECT * INTO item FROM public.order_items WHERE id=p_order_item_id FOR UPDATE;
  IF item.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='order_item_not_found'; END IF;
  SELECT * INTO target FROM public.orders WHERE id=item.order_id FOR UPDATE;
  selected_priority:=CASE WHEN target.pricing_snapshot->>'tier' IN ('gold','platinum','vip') THEN 'vip'::public.manual_fulfillment_priority ELSE 'normal'::public.manual_fulfillment_priority END;
  INSERT INTO public.manual_fulfillment_tasks(order_id,order_item_id,fallback_attempt_id,priority,sla_due_at,failure_context)
    VALUES(target.id,item.id,p_fallback_attempt_id,selected_priority,statement_timestamp()+CASE WHEN selected_priority='vip' THEN interval '15 minutes' ELSE interval '60 minutes' END,coalesce(p_failure_context,'{}'::jsonb))
    ON CONFLICT(order_item_id) WHERE status NOT IN ('completed','cancelled') DO UPDATE SET failure_context=EXCLUDED.failure_context
    RETURNING * INTO task;
  INSERT INTO public.fulfillment_notifications(order_id,audience,kind,payload)
    VALUES(target.id,'staff','manual_task_created',jsonb_build_object('task_id',task.id,'priority',task.priority));
  IF target.status='paid' THEN PERFORM public.transition_order_status(target.id,'processing',NULL,'system','manual_fulfillment'); END IF;
  RETURN task;
END;
$$;
REVOKE ALL ON FUNCTION create_manual_fulfillment_task(uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION create_manual_fulfillment_task(uuid,jsonb,uuid) TO service_role;

CREATE OR REPLACE FUNCTION complete_manual_delivery(
  p_task_id uuid,p_staff_id uuid,p_kind order_delivery_kind,p_payload_ciphertext text DEFAULT NULL,
  p_display_hint text DEFAULT NULL,p_storage_path text DEFAULT NULL,p_quantity integer DEFAULT 1
) RETURNS order_deliveries LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE task public.manual_fulfillment_tasks; item public.order_items; delivery public.order_deliveries; order_row public.orders; remaining integer;
BEGIN
  IF (SELECT auth.uid()) IS DISTINCT FROM p_staff_id OR NOT (SELECT private.app_can('fulfillment.manage')) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='fulfillment_permission_required';
  END IF;
  SELECT * INTO task FROM public.manual_fulfillment_tasks WHERE id=p_task_id FOR UPDATE;
  IF task.id IS NULL OR task.status NOT IN ('claimed','in_progress','waiting_customer','sla_breached') OR coalesce(task.assigned_to,task.claimed_by) IS DISTINCT FROM p_staff_id THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='manual_task_not_owned';
  END IF;
  SELECT * INTO item FROM public.order_items WHERE id=task.order_item_id FOR UPDATE;
  IF p_quantity<1 OR item.delivered_quantity+p_quantity>item.quantity THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='delivery_quantity_invalid'; END IF;
  IF (p_kind='file' AND p_storage_path IS NULL) OR (p_kind<>'file' AND p_payload_ciphertext IS NULL) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='delivery_payload_required'; END IF;
  INSERT INTO public.order_deliveries(order_id,order_item_id,kind,payload_ciphertext,display_hint,storage_path,delivered_by)
    VALUES(task.order_id,task.order_item_id,p_kind,p_payload_ciphertext,p_display_hint,p_storage_path,p_staff_id) RETURNING * INTO delivery;
  UPDATE public.order_items SET delivered_quantity=delivered_quantity+p_quantity WHERE id=item.id;
  remaining:=item.quantity-item.delivered_quantity-p_quantity;
  UPDATE public.manual_fulfillment_tasks SET status=CASE WHEN remaining=0 THEN 'completed' ELSE 'in_progress' END,
    completed_at=CASE WHEN remaining=0 THEN statement_timestamp() ELSE NULL END,version=version+1 WHERE id=task.id;
  SELECT * INTO order_row FROM public.orders WHERE id=task.order_id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM public.order_items oi WHERE oi.order_id=order_row.id AND oi.delivered_quantity<oi.quantity) THEN
    PERFORM public.transition_order_status(order_row.id,'delivered',p_staff_id,'staff','manual_fulfillment',NULL,jsonb_build_object('en','Your order has been delivered','ar','تم تسليم طلبك'));
  ELSIF EXISTS(SELECT 1 FROM public.order_items oi WHERE oi.order_id=order_row.id AND oi.delivered_quantity>0) AND order_row.status='processing' THEN
    PERFORM public.transition_order_status(order_row.id,'partially_delivered',p_staff_id,'staff','manual_fulfillment');
  END IF;
  INSERT INTO public.fulfillment_notifications(profile_id,order_id,audience,kind,payload)
    VALUES(order_row.profile_id,order_row.id,'customer','delivery_created',jsonb_build_object('delivery_id',delivery.id));
  RETURN delivery;
END;
$$;
REVOKE ALL ON FUNCTION complete_manual_delivery(uuid,uuid,order_delivery_kind,text,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION complete_manual_delivery(uuid,uuid,order_delivery_kind,text,text,text,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION refund_unrecoverable_order(p_order_id uuid,p_reason text)
RETURNS orders LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target public.orders; posted public.wallet_transactions;
BEGIN
  IF session_user NOT IN ('postgres','supabase_admin') AND coalesce((SELECT auth.jwt()->>'role'='service_role'),false) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='service_role_required';
  END IF;
  SELECT * INTO target FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF target.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='order_not_found'; END IF;
  IF target.status='refunded' THEN RETURN target; END IF;
  IF target.profile_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='guest_refund_requires_review'; END IF;
  IF target.paid_amount<=target.refunded_amount THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='order_nothing_to_refund'; END IF;
  posted:=public.wallet_credit(target.profile_id,target.currency_code,target.paid_amount-target.refunded_amount,'refund','fulfillment-refund:'||target.id,'order',target.id,p_reason,jsonb_build_object('source','unrecoverable_fulfillment'));
  UPDATE public.orders SET refunded_amount=paid_amount WHERE id=target.id;
  target:=public.transition_order_status(target.id,'refunded',NULL,'system','fulfillment_failure',p_reason,jsonb_build_object('en','Your payment was refunded to your wallet','ar','تم رد المبلغ إلى محفظتك'),jsonb_build_object('wallet_transaction_id',posted.id));
  INSERT INTO public.fulfillment_notifications(profile_id,order_id,audience,kind,payload)
    VALUES(target.profile_id,target.id,'customer','order_refunded',jsonb_build_object('amount',target.refunded_amount,'currency',target.currency_code));
  RETURN target;
END;
$$;
REVOKE ALL ON FUNCTION refund_unrecoverable_order(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION refund_unrecoverable_order(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION private.enqueue_paid_order_fulfillment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.status='paid' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.fulfillment_jobs(kind,aggregate_type,aggregate_id,payload,priority,idempotency_key)
      VALUES('fulfill.order','order',NEW.id,jsonb_build_object('order_id',NEW.id),CASE WHEN NEW.pricing_snapshot->>'tier' IN ('gold','platinum','vip') THEN 300 ELSE 100 END,'order:'||NEW.id)
      ON CONFLICT(kind,idempotency_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.enqueue_paid_order_fulfillment() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER orders_enqueue_fulfillment AFTER UPDATE OF status ON orders FOR EACH ROW EXECUTE FUNCTION private.enqueue_paid_order_fulfillment();

CREATE OR REPLACE FUNCTION expire_stock_codes_and_alert()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE expired_count integer; alert_count integer; breached_count integer;
BEGIN
  IF session_user NOT IN ('postgres','supabase_admin') AND coalesce((SELECT auth.jwt()->>'role'='service_role'),false) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='service_role_required';
  END IF;
  UPDATE public.stock_codes SET status='expired' WHERE status='available' AND expires_at<=statement_timestamp();
  GET DIAGNOSTICS expired_count=ROW_COUNT;
  UPDATE public.manual_fulfillment_tasks SET status='sla_breached',version=version+1
    WHERE status='queued' AND sla_due_at<=statement_timestamp();
  GET DIAGNOSTICS breached_count=ROW_COUNT;
  INSERT INTO public.admin_alerts(severity,alert_type,title,message,resource_type,resource_id,fingerprint)
  SELECT 'warning','stock_low',jsonb_build_object('en','Low code stock','ar','مخزون الأكواد منخفض'),
    jsonb_build_object('en','Available stock is below the configured threshold','ar','المخزون المتاح أقل من الحد المحدد'),
    'product_variant',v.id,'stock-low:'||v.id
  FROM public.product_variants v
  LEFT JOIN public.stock_codes s ON s.variant_id=v.id AND s.status='available' AND (s.expires_at IS NULL OR s.expires_at>statement_timestamp())
  WHERE v.active AND v.deleted_at IS NULL AND coalesce((v.attributes->>'low_stock_threshold')::integer,5)>0
  GROUP BY v.id HAVING count(s.id)<coalesce((v.attributes->>'low_stock_threshold')::integer,5)
  ON CONFLICT(fingerprint) WHERE status<>'resolved' DO NOTHING;
  GET DIAGNOSTICS alert_count=ROW_COUNT;
  RETURN jsonb_build_object('expired',expired_count,'alerts',alert_count,'sla_breaches',breached_count);
END;
$$;
REVOKE ALL ON FUNCTION expire_stock_codes_and_alert() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION expire_stock_codes_and_alert() TO service_role;

CREATE OR REPLACE VIEW supplier_reliability WITH (security_invoker=true) AS
SELECT s.id,s.code,s.name,s.health_status,s.success_count,s.failure_count,s.partial_count,s.average_latency_ms,
  CASE WHEN s.success_count+s.failure_count+s.partial_count=0 THEN 10000 ELSE round(10000.0*(s.success_count+0.5*s.partial_count)/(s.success_count+s.failure_count+s.partial_count))::integer END AS reliability_bps,
  coalesce(sum(so.cost_amount) FILTER(WHERE so.status IN ('completed','partial')),0)::bigint AS tracked_cost_amount,
  s.currency_code
FROM suppliers s LEFT JOIN supplier_orders so ON so.supplier_id=s.id
WHERE s.deleted_at IS NULL GROUP BY s.id;

CREATE OR REPLACE VIEW fulfillment_profit_summary WITH (security_invoker=true) AS
SELECT o.id AS order_id,o.order_number,o.currency_code,o.total_amount,
  coalesce(sum(so.cost_amount) FILTER(WHERE so.cost_currency_code=o.currency_code),0)::bigint AS supplier_cost_amount,
  o.total_amount-coalesce(sum(so.cost_amount) FILTER(WHERE so.cost_currency_code=o.currency_code),0)::bigint AS gross_profit_amount
FROM orders o LEFT JOIN supplier_orders so ON so.order_id=o.id
GROUP BY o.id;

CREATE OR REPLACE VIEW fulfiller_performance WITH (security_invoker=true) AS
SELECT coalesce(completed_by.assigned_to,completed_by.claimed_by) AS profile_id,
  count(*) FILTER(WHERE status='completed')::bigint AS completed_tasks,
  count(*) FILTER(WHERE sla_due_at<coalesce(completed_at,statement_timestamp()))::bigint AS sla_breaches,
  coalesce(avg(extract(epoch FROM (completed_at-claimed_at))) FILTER(WHERE completed_at IS NOT NULL AND claimed_at IS NOT NULL),0)::numeric(12,2) AS average_completion_seconds
FROM manual_fulfillment_tasks completed_by
WHERE coalesce(assigned_to,claimed_by) IS NOT NULL GROUP BY coalesce(assigned_to,claimed_by);

DO $$ DECLARE item text; BEGIN
  FOREACH item IN ARRAY ARRAY['fulfillment_jobs','fulfillment_job_attempts','fulfillment_dead_letters','stock_code_import_batches','stock_codes','suppliers','supplier_products','supplier_circuits','supplier_orders','supplier_order_events','fulfillment_attempts','manual_fulfillment_tasks','manual_fulfillment_notes','fulfillment_notifications']
  LOOP EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',item); END LOOP;
END $$;

CREATE POLICY fulfillment_jobs_staff_read ON fulfillment_jobs FOR SELECT TO authenticated USING ((SELECT private.app_can('fulfillment.manage')));
CREATE POLICY fulfillment_job_attempts_staff_read ON fulfillment_job_attempts FOR SELECT TO authenticated USING ((SELECT private.app_can('fulfillment.manage')));
CREATE POLICY fulfillment_dead_letters_staff_read ON fulfillment_dead_letters FOR SELECT TO authenticated USING ((SELECT private.app_can('fulfillment.manage')));
CREATE POLICY stock_import_staff_read ON stock_code_import_batches FOR SELECT TO authenticated USING ((SELECT private.app_can('fulfillment.manage')));
CREATE POLICY stock_codes_staff_read ON stock_codes FOR SELECT TO authenticated USING ((SELECT private.app_can('fulfillment.manage')));
CREATE POLICY suppliers_staff_read ON suppliers FOR SELECT TO authenticated USING ((SELECT private.app_can('fulfillment.manage')));
CREATE POLICY supplier_products_staff_read ON supplier_products FOR SELECT TO authenticated USING ((SELECT private.app_can('fulfillment.manage')));
CREATE POLICY supplier_circuits_staff_read ON supplier_circuits FOR SELECT TO authenticated USING ((SELECT private.app_can('fulfillment.manage')));
CREATE POLICY supplier_orders_staff_read ON supplier_orders FOR SELECT TO authenticated USING ((SELECT private.app_can('fulfillment.manage')));
CREATE POLICY supplier_order_events_staff_read ON supplier_order_events FOR SELECT TO authenticated USING ((SELECT private.app_can('fulfillment.manage')));
CREATE POLICY fulfillment_attempts_staff_read ON fulfillment_attempts FOR SELECT TO authenticated USING ((SELECT private.app_can('fulfillment.manage')));
CREATE POLICY manual_tasks_staff_read ON manual_fulfillment_tasks FOR SELECT TO authenticated USING ((SELECT private.app_can('fulfillment.manage')));
CREATE POLICY manual_notes_staff_read ON manual_fulfillment_notes FOR SELECT TO authenticated USING ((SELECT private.app_can('fulfillment.manage')));
CREATE POLICY fulfillment_notifications_owner_read ON fulfillment_notifications FOR SELECT TO authenticated USING (
  profile_id=(SELECT auth.uid()) OR (audience='staff' AND (SELECT private.app_can('fulfillment.manage')))
);

REVOKE ALL ON fulfillment_jobs,fulfillment_job_attempts,fulfillment_dead_letters,stock_code_import_batches,stock_codes,suppliers,supplier_products,supplier_circuits,supplier_orders,supplier_order_events,fulfillment_attempts,manual_fulfillment_tasks,manual_fulfillment_notes,fulfillment_notifications FROM anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON fulfillment_jobs,fulfillment_job_attempts,fulfillment_dead_letters,stock_code_import_batches,stock_codes,suppliers,supplier_products,supplier_circuits,supplier_orders,supplier_order_events,fulfillment_attempts,manual_fulfillment_tasks,manual_fulfillment_notes,fulfillment_notifications FROM authenticated;
GRANT SELECT ON fulfillment_jobs,fulfillment_job_attempts,fulfillment_dead_letters,stock_code_import_batches,stock_codes,suppliers,supplier_products,supplier_circuits,supplier_orders,supplier_order_events,fulfillment_attempts,manual_fulfillment_tasks,manual_fulfillment_notes,fulfillment_notifications TO authenticated;
GRANT ALL ON fulfillment_jobs,fulfillment_job_attempts,fulfillment_dead_letters,stock_code_import_batches,stock_codes,suppliers,supplier_products,supplier_circuits,supplier_orders,supplier_order_events,fulfillment_attempts,manual_fulfillment_tasks,manual_fulfillment_notes,fulfillment_notifications TO service_role;
REVOKE ALL ON supplier_reliability,fulfillment_profit_summary,fulfiller_performance FROM anon;
GRANT SELECT ON supplier_reliability,fulfillment_profit_summary,fulfiller_performance TO authenticated,service_role;

COMMENT ON FUNCTION assign_stock_code(uuid) IS 'Atomically assigns exactly one unexpired code using FOR UPDATE SKIP LOCKED; concurrent workers cannot reuse a code.';
COMMENT ON FUNCTION claim_fulfillment_jobs(text,integer,integer) IS 'Claims due jobs using a short lease and non-blocking SKIP LOCKED semantics.';
COMMENT ON TABLE stock_codes IS 'Encrypted-at-rest code inventory. Ciphertext is decrypted only by trusted server code after assignment.';
