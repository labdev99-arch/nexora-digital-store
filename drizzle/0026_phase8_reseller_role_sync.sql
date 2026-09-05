-- Keep reseller accounts synchronized when administrators grant or remove the reseller role.
CREATE OR REPLACE FUNCTION private.sync_reseller_account_from_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target_profile uuid := coalesce(NEW.profile_id, OLD.profile_id);
DECLARE bronze_tier uuid;
BEGIN
  IF TG_OP <> 'DELETE' AND NEW.role = 'reseller' THEN
    SELECT id INTO bronze_tier FROM public.reseller_tiers
    WHERE code = 'bronze' AND active AND deleted_at IS NULL LIMIT 1;
    INSERT INTO public.reseller_accounts(profile_id,status,current_tier_id,approved_by,approved_at)
    VALUES(target_profile,'active',bronze_tier,NEW.granted_by,statement_timestamp())
    ON CONFLICT(profile_id) DO UPDATE SET
      status = 'active', deleted_at = NULL, approved_by = EXCLUDED.approved_by,
      approved_at = coalesce(public.reseller_accounts.approved_at, EXCLUDED.approved_at);
  END IF;
  IF TG_OP <> 'INSERT' AND OLD.role = 'reseller'
     AND NOT EXISTS (
       SELECT 1 FROM public.profile_roles
       WHERE profile_id = target_profile AND role = 'reseller'
         AND id IS DISTINCT FROM OLD.id
         AND (expires_at IS NULL OR expires_at > statement_timestamp())
     ) THEN
    UPDATE public.reseller_accounts SET status = 'suspended' WHERE profile_id = target_profile;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.sync_reseller_account_from_role() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER profile_roles_sync_reseller_account
  AFTER INSERT OR UPDATE OF role, expires_at OR DELETE ON public.profile_roles
  FOR EACH ROW EXECUTE FUNCTION private.sync_reseller_account_from_role();
