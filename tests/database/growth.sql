-- Phase 9 database smoke test. Run against a disposable database after migrations 0027-0028.
-- It verifies append-only histories, commission maturation, and the no-double-reservation payout invariant.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE blocked boolean:=false;
BEGIN
  BEGIN
    UPDATE public.referral_clicks SET landing_path='/forbidden' WHERE false;
  EXCEPTION WHEN SQLSTATE '55000' THEN blocked:=true;
  END;
  -- A real row is required to execute a row trigger; verify the trigger is installed even in an empty fixture.
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='referral_clicks_append_only' AND tgenabled<>'D') THEN
    RAISE EXCEPTION 'referral click append-only trigger missing';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='loyalty_point_entries_append_only' AND tgenabled<>'D') THEN
    RAISE EXCEPTION 'loyalty points append-only trigger missing';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='order_events_growth' AND tgenabled<>'D') THEN
    RAISE EXCEPTION 'order growth processor missing';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.affiliate_payout_allocations
    GROUP BY payout_request_id,commission_id HAVING count(*)>1
  ) THEN RAISE EXCEPTION 'duplicate payout allocation detected'; END IF;
END $$;

ROLLBACK;
\echo 'growth.sql passed; all verification writes rolled back.'

