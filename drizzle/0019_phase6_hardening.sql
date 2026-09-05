-- Phase 6 least-privilege hardening.
-- Manual fulfillment mutations are callable only by trusted server code after
-- the route handler has authenticated the staff member and checked permissions.

CREATE INDEX IF NOT EXISTS stock_codes_import_batch_idx
  ON public.stock_codes(import_batch_id)
  WHERE import_batch_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_manual_fulfillment_task(
  p_task_id uuid,
  p_staff_id uuid
) RETURNS public.manual_fulfillment_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claimed public.manual_fulfillment_tasks;
BEGIN
  IF session_user NOT IN ('postgres', 'supabase_admin')
     AND coalesce((SELECT auth.jwt()->>'role' = 'service_role'), false) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service_role_required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_staff_id) THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'staff_profile_not_found';
  END IF;

  UPDATE public.manual_fulfillment_tasks
  SET status = 'claimed',
      claimed_by = p_staff_id,
      assigned_to = coalesce(assigned_to, p_staff_id),
      claimed_at = statement_timestamp(),
      version = version + 1
  WHERE id = (
    SELECT id
    FROM public.manual_fulfillment_tasks
    WHERE id = p_task_id
      AND status IN ('queued', 'sla_breached')
    FOR UPDATE SKIP LOCKED
  )
  RETURNING * INTO claimed;

  IF claimed.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'manual_task_unavailable';
  END IF;

  RETURN claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_manual_fulfillment_task(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_manual_fulfillment_task(uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.complete_manual_delivery(
  p_task_id uuid,
  p_staff_id uuid,
  p_kind public.order_delivery_kind,
  p_payload_ciphertext text DEFAULT NULL,
  p_display_hint text DEFAULT NULL,
  p_storage_path text DEFAULT NULL,
  p_quantity integer DEFAULT 1
) RETURNS public.order_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  task public.manual_fulfillment_tasks;
  item public.order_items;
  delivery public.order_deliveries;
  order_row public.orders;
  remaining integer;
BEGIN
  IF session_user NOT IN ('postgres', 'supabase_admin')
     AND coalesce((SELECT auth.jwt()->>'role' = 'service_role'), false) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service_role_required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_staff_id) THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'staff_profile_not_found';
  END IF;

  SELECT * INTO task
  FROM public.manual_fulfillment_tasks
  WHERE id = p_task_id
  FOR UPDATE;

  IF task.id IS NULL
     OR task.status NOT IN ('claimed', 'in_progress', 'waiting_customer', 'sla_breached')
     OR coalesce(task.assigned_to, task.claimed_by) IS DISTINCT FROM p_staff_id THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'manual_task_not_owned';
  END IF;

  SELECT * INTO item
  FROM public.order_items
  WHERE id = task.order_item_id
  FOR UPDATE;

  IF p_quantity < 1 OR item.delivered_quantity + p_quantity > item.quantity THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'delivery_quantity_invalid';
  END IF;

  IF (p_kind = 'file' AND p_storage_path IS NULL)
     OR (p_kind <> 'file' AND p_payload_ciphertext IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'delivery_payload_required';
  END IF;

  INSERT INTO public.order_deliveries(
    order_id,
    order_item_id,
    kind,
    payload_ciphertext,
    display_hint,
    storage_path,
    delivered_by
  ) VALUES (
    task.order_id,
    task.order_item_id,
    p_kind,
    p_payload_ciphertext,
    p_display_hint,
    p_storage_path,
    p_staff_id
  )
  RETURNING * INTO delivery;

  UPDATE public.order_items
  SET delivered_quantity = delivered_quantity + p_quantity
  WHERE id = item.id;

  remaining := item.quantity - item.delivered_quantity - p_quantity;

  UPDATE public.manual_fulfillment_tasks
  SET status = CASE WHEN remaining = 0 THEN 'completed' ELSE 'in_progress' END,
      completed_at = CASE WHEN remaining = 0 THEN statement_timestamp() ELSE NULL END,
      version = version + 1
  WHERE id = task.id;

  SELECT * INTO order_row
  FROM public.orders
  WHERE id = task.order_id
  FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1
    FROM public.order_items oi
    WHERE oi.order_id = order_row.id
      AND oi.delivered_quantity < oi.quantity
  ) THEN
    PERFORM public.transition_order_status(
      order_row.id,
      'delivered',
      p_staff_id,
      'staff',
      'manual_fulfillment',
      NULL,
      jsonb_build_object(
        'en', 'Your order has been delivered',
        'ar', 'تم تسليم طلبك'
      )
    );
  ELSIF EXISTS (
    SELECT 1
    FROM public.order_items oi
    WHERE oi.order_id = order_row.id
      AND oi.delivered_quantity > 0
  ) AND order_row.status = 'processing' THEN
    PERFORM public.transition_order_status(
      order_row.id,
      'partially_delivered',
      p_staff_id,
      'staff',
      'manual_fulfillment'
    );
  END IF;

  INSERT INTO public.fulfillment_notifications(
    profile_id,
    order_id,
    audience,
    kind,
    payload
  ) VALUES (
    order_row.profile_id,
    order_row.id,
    'customer',
    'delivery_created',
    jsonb_build_object('delivery_id', delivery.id)
  );

  RETURN delivery;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_manual_delivery(
  uuid,
  uuid,
  public.order_delivery_kind,
  text,
  text,
  text,
  integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_manual_delivery(
  uuid,
  uuid,
  public.order_delivery_kind,
  text,
  text,
  text,
  integer
) TO service_role;

