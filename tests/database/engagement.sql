-- Phase 10 database smoke test. Run after migrations 0030-0032.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'notification_events','notification_deliveries','in_app_notifications',
    'support_ticket_messages','support_ticket_attachments','knowledge_articles',
    'knowledge_faqs','review_replies','product_review_aggregates'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class
      WHERE oid=format('public.%I',table_name)::regclass AND relrowsecurity
    ) THEN RAISE EXCEPTION 'RLS missing on %',table_name; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=table_name
    ) THEN RAISE EXCEPTION 'policy missing on %',table_name; END IF;
  END LOOP;

  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='order_events_notifications' AND tgenabled<>'D')
    THEN RAISE EXCEPTION 'order notification trigger missing'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='reviews_phase10_aggregate' AND tgenabled<>'D')
    THEN RAISE EXCEPTION 'review aggregate trigger missing'; END IF;
  IF (SELECT count(*) FROM pg_publication_tables WHERE pubname='supabase_realtime'
      AND tablename IN ('in_app_notifications','support_ticket_messages','support_tickets','wallets')) <> 4
    THEN RAISE EXCEPTION 'Realtime publication incomplete'; END IF;
END $$;

ROLLBACK;
\echo 'engagement.sql passed; all verification writes rolled back.'
