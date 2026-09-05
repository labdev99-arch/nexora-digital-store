-- Phase 10 advisor remediation: cover foreign keys and collapse overlapping policies.

CREATE INDEX notification_events_locale_idx ON public.notification_events(locale_code);
CREATE INDEX support_ticket_attachments_uploader_idx ON public.support_ticket_attachments(uploaded_by);
CREATE INDEX support_ticket_messages_author_idx ON public.support_ticket_messages(author_id) WHERE author_id IS NOT NULL;

DROP POLICY IF EXISTS support_tickets_staff_read ON public.support_tickets;

DROP POLICY IF EXISTS reviews_authenticated_read ON public.reviews;
DROP POLICY IF EXISTS reviews_owner_read ON public.reviews;
CREATE POLICY reviews_authenticated_read ON public.reviews FOR SELECT TO authenticated
  USING (
    (status='approved' AND deleted_at IS NULL)
    OR profile_id=(SELECT auth.uid())
    OR (SELECT private.app_can('reviews.manage'))
  );

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id uuid)
RETURNS public.in_app_notifications LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result public.in_app_notifications;
BEGIN
  UPDATE public.in_app_notifications SET read_at=coalesce(read_at,now())
  WHERE id=p_notification_id AND profile_id=auth.uid() RETURNING * INTO result;
  IF result.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='notification_not_found'; END IF;
  RETURN result;
END
$$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read() RETURNS bigint
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE n bigint;
BEGIN
  UPDATE public.in_app_notifications SET read_at=now()
  WHERE profile_id=auth.uid() AND read_at IS NULL;
  GET DIAGNOSTICS n=ROW_COUNT;
  RETURN n;
END
$$;

REVOKE ALL ON FUNCTION public.mark_notification_read(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;
