-- Phase 9 trusted mutation surface and event processors.

CREATE OR REPLACE FUNCTION private.growth_staff(p_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT session_user IN ('postgres','supabase_admin')
    OR coalesce((SELECT auth.jwt()->>'role'='service_role'),false)
    OR coalesce((SELECT private.app_can(p_permission)),false);
$$;
REVOKE ALL ON FUNCTION private.growth_staff(text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.apply_for_affiliate(p_message text DEFAULT NULL)
RETURNS public.affiliate_accounts LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result public.affiliate_accounts; generated text; currency text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required'; END IF;
  SELECT currency_code INTO currency FROM public.profiles WHERE id=auth.uid();
  IF currency IS NULL THEN RAISE EXCEPTION USING ERRCODE='23503',MESSAGE='profile_not_found'; END IF;
  SELECT * INTO result FROM public.affiliate_accounts WHERE profile_id=auth.uid() AND deleted_at IS NULL;
  IF result.id IS NOT NULL THEN RETURN result; END IF;
  LOOP
    generated := upper(substr(encode(gen_random_bytes(8),'hex'),1,10));
    EXIT WHEN NOT EXISTS(SELECT 1 FROM public.affiliate_accounts WHERE referral_code=generated);
  END LOOP;
  INSERT INTO public.affiliate_accounts(profile_id,referral_code,payout_currency_code,application_message,parent_affiliate_id)
  VALUES(auth.uid(),generated,currency,nullif(trim(p_message),''),(SELECT affiliate_account_id FROM public.referral_attributions WHERE referred_profile_id=auth.uid())) RETURNING * INTO result;
  INSERT INTO public.audit_logs(actor_id,actor_type,action,resource_type,resource_id,after)
  VALUES(auth.uid(),'user','affiliate.applied','affiliate_account',result.id,jsonb_build_object('status',result.status));
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_for_affiliate(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_for_affiliate(text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.sync_affiliate_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.status='active' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
    INSERT INTO public.profile_roles(profile_id,role,granted_by)
    VALUES(NEW.profile_id,'affiliate',auth.uid()) ON CONFLICT(profile_id,role) DO UPDATE SET expires_at=NULL,updated_at=statement_timestamp();
  ELSIF TG_OP='UPDATE' AND OLD.status='active' AND NEW.status<>'active' THEN
    DELETE FROM public.profile_roles WHERE profile_id=NEW.profile_id AND role='affiliate';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.sync_affiliate_role() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER affiliate_accounts_role_sync AFTER INSERT OR UPDATE OF status ON public.affiliate_accounts
  FOR EACH ROW EXECUTE FUNCTION private.sync_affiliate_role();

CREATE OR REPLACE FUNCTION public.create_affiliate_link(p_name text,p_destination_path text,p_campaign text DEFAULT NULL)
RETURNS public.affiliate_links LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE account public.affiliate_accounts; result public.affiliate_links; generated text;
BEGIN
  SELECT * INTO account FROM public.affiliate_accounts WHERE profile_id=auth.uid() AND status='active' AND deleted_at IS NULL FOR UPDATE;
  IF account.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active_affiliate_required'; END IF;
  IF char_length(trim(p_name)) NOT BETWEEN 1 AND 120 OR p_destination_path NOT LIKE '/%' OR p_destination_path LIKE '//%' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='affiliate_link_invalid';
  END IF;
  generated:=lower(account.referral_code)||'-'||substr(encode(gen_random_bytes(6),'hex'),1,8);
  INSERT INTO public.affiliate_links(affiliate_account_id,slug,name,destination_path,campaign)
  VALUES(account.id,generated,trim(p_name),p_destination_path,nullif(trim(p_campaign),'')) RETURNING * INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.create_affiliate_link(text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_affiliate_link(text,text,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.claim_referral_attribution(p_click_id uuid)
RETURNS public.referral_attributions LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE click public.referral_clicks; account public.affiliate_accounts; existing public.referral_attributions;
  result public.referral_attributions; model public.referral_attribution_model; device_count int:=0; ip_count int:=0;
  device_limit int:=3; ip_limit int:=5; score int:=0; fraud public.referral_fraud_status:='clear';
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required'; END IF;
  SELECT * INTO existing FROM public.referral_attributions WHERE referred_profile_id=auth.uid();
  IF existing.id IS NOT NULL THEN RETURN existing; END IF;
  SELECT * INTO click FROM public.referral_clicks WHERE id=p_click_id AND occurred_at>now()-interval '90 days';
  IF click.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='referral_click_invalid_or_expired'; END IF;
  SELECT * INTO account FROM public.affiliate_accounts WHERE id=click.affiliate_account_id AND status='active' AND deleted_at IS NULL;
  IF account.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='affiliate_inactive'; END IF;
  SELECT coalesce((value#>>'{}')::public.referral_attribution_model,'last_touch') INTO model FROM public.growth_settings WHERE key='referral.attribution_model';
  SELECT coalesce((value->>'signups_per_device_24h')::int,3),coalesce((value->>'signups_per_ip_24h')::int,5)
    INTO device_limit,ip_limit FROM public.growth_settings WHERE key='fraud.velocity';
  IF account.profile_id=auth.uid() THEN score:=100; fraud:='blocked'; END IF;
  IF click.device_hash IS NOT NULL THEN
    SELECT count(*) INTO device_count FROM public.referral_attributions a JOIN public.referral_clicks c ON c.id=a.click_id
      WHERE c.device_hash=click.device_hash AND a.attributed_at>now()-interval '24 hours';
    IF device_count>=device_limit THEN score:=greatest(score,75); fraud:='review'; END IF;
  END IF;
  IF click.ip_hash IS NOT NULL THEN
    SELECT count(*) INTO ip_count FROM public.referral_attributions a JOIN public.referral_clicks c ON c.id=a.click_id
      WHERE c.ip_hash=click.ip_hash AND a.attributed_at>now()-interval '24 hours';
    IF ip_count>=ip_limit THEN score:=greatest(score,60); fraud:='review'; END IF;
  END IF;
  INSERT INTO public.referral_attributions(referred_profile_id,affiliate_account_id,affiliate_link_id,parent_affiliate_account_id,click_id,attribution_model,fraud_status,fraud_score)
  VALUES(auth.uid(),account.id,click.affiliate_link_id,account.parent_affiliate_id,click.id,coalesce(model,'last_touch'),fraud,score)
  RETURNING * INTO result;
  UPDATE public.profiles SET referred_by=account.profile_id,updated_at=statement_timestamp() WHERE id=auth.uid() AND referred_by IS NULL;
  IF account.profile_id=auth.uid() THEN
    INSERT INTO public.referral_fraud_signals(attribution_id,affiliate_account_id,signal_kind,severity,score,evidence)
    VALUES(result.id,account.id,'self_referral','critical',100,jsonb_build_object('profile_id',auth.uid()));
  END IF;
  IF device_count>=device_limit THEN
    INSERT INTO public.referral_fraud_signals(attribution_id,affiliate_account_id,signal_kind,severity,score,evidence)
    VALUES(result.id,account.id,'velocity','high',75,jsonb_build_object('dimension','device','count_24h',device_count+1));
  END IF;
  IF ip_count>=ip_limit THEN
    INSERT INTO public.referral_fraud_signals(attribution_id,affiliate_account_id,signal_kind,severity,score,evidence)
    VALUES(result.id,account.id,'ip_cluster','medium',60,jsonb_build_object('count_24h',ip_count+1));
  END IF;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_referral_attribution(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.claim_referral_attribution(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.pick_affiliate_rule(p_product_id uuid,p_category_id uuid,p_level smallint)
RETURNS public.affiliate_commission_rules LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT r FROM public.affiliate_commission_rules r
  WHERE r.level=p_level AND r.active AND r.deleted_at IS NULL
    AND (r.starts_at IS NULL OR r.starts_at<=now()) AND (r.ends_at IS NULL OR r.ends_at>now())
    AND (r.product_id=p_product_id OR r.category_id=p_category_id OR (r.product_id IS NULL AND r.category_id IS NULL))
  ORDER BY CASE WHEN r.product_id=p_product_id THEN 3 WHEN r.category_id=p_category_id THEN 2 ELSE 1 END DESC,r.priority DESC,r.created_at DESC
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION private.pick_affiliate_rule(uuid,uuid,smallint) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.ensure_loyalty_account(p_profile_id uuid)
RETURNS public.loyalty_accounts LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result public.loyalty_accounts;
BEGIN
  INSERT INTO public.loyalty_accounts(profile_id,current_tier_id)
  VALUES(p_profile_id,(SELECT id FROM public.customer_tiers WHERE active AND deleted_at IS NULL ORDER BY minimum_lifetime_spend,sort_order LIMIT 1))
  ON CONFLICT(profile_id) DO NOTHING;
  SELECT * INTO result FROM public.loyalty_accounts WHERE profile_id=p_profile_id FOR UPDATE;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION private.ensure_loyalty_account(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.growth_wallet_credit(
  p_owner_id uuid,p_currency_code text,p_amount bigint,p_type public.wallet_transaction_type,
  p_idempotency_key text,p_reference_type text,p_reference_id uuid,p_reason text,p_metadata jsonb
) RETURNS public.wallet_transactions LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE source public.wallets; destination public.wallets;
BEGIN
  IF p_type::text NOT IN ('commission','bonus') OR p_amount<=0 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='growth_wallet_credit_invalid';
  END IF;
  source:=private.ensure_wallet(NULL,p_currency_code,'platform_cash','cash:'||p_currency_code);
  destination:=private.ensure_wallet(p_owner_id,p_currency_code,'customer','available');
  RETURN private.post_wallet_transfer('wallet.credit',p_idempotency_key,source.id,destination.id,p_type,p_amount,p_currency_code,p_reference_type,p_reference_id,p_reason,p_owner_id,p_metadata);
END;
$$;
REVOKE ALL ON FUNCTION private.growth_wallet_credit(uuid,text,bigint,public.wallet_transaction_type,text,text,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.award_order_growth(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target public.orders; attribution public.referral_attributions; item record; account public.affiliate_accounts;
  recipient public.affiliate_accounts; rule public.affiliate_commission_rules; commission bigint; hold_days int:=14;
  inserted public.affiliate_commissions; loyalty public.loyalty_accounts; earn public.loyalty_rules;
  points bigint:=0; line_points bigint:=0; tier_multiplier int:=10000; seasonal_multiplier int:=10000; expiry_days int:=365;
  streak int:=1; last_date date; referral_rule public.loyalty_rules; referral_loyalty public.loyalty_accounts;
  level_no integer;
BEGIN
  SELECT * INTO target FROM public.orders WHERE id=p_order_id AND profile_id IS NOT NULL;
  IF target.id IS NULL THEN RETURN; END IF;
  SELECT * INTO attribution FROM public.referral_attributions WHERE referred_profile_id=target.profile_id;
  SELECT coalesce((value#>>'{}')::int,14) INTO hold_days FROM public.growth_settings WHERE key='affiliate.holding_days';
  IF attribution.id IS NOT NULL AND attribution.fraud_status<>'blocked' THEN
    FOR item IN SELECT oi.*,p.category_id FROM public.order_items oi JOIN public.products p ON p.id=oi.product_id WHERE oi.order_id=target.id LOOP
      FOR level_no IN 1..2 LOOP
        recipient:=NULL; rule:=NULL; inserted:=NULL;
        SELECT * INTO recipient FROM public.affiliate_accounts WHERE id=CASE WHEN level_no=1 THEN attribution.affiliate_account_id ELSE attribution.parent_affiliate_account_id END AND status='active' AND deleted_at IS NULL;
        IF recipient.id IS NULL THEN CONTINUE; END IF;
        SELECT * INTO rule FROM private.pick_affiliate_rule(item.product_id,item.category_id,level_no::smallint);
        IF rule.id IS NULL THEN
          IF level_no=2 THEN CONTINUE; END IF;
          commission:=CASE WHEN recipient.fixed_commission_amount>0 THEN recipient.fixed_commission_amount ELSE (item.total_amount*recipient.commission_bps)/10000 END;
        ELSE
          IF rule.commission_kind='fixed' AND rule.currency_code<>target.currency_code THEN CONTINUE; END IF;
          commission:=CASE WHEN rule.commission_kind='fixed' THEN rule.value_amount ELSE (item.total_amount*rule.value_amount)/10000 END;
        END IF;
        IF commission<=0 THEN CONTINUE; END IF;
        INSERT INTO public.affiliate_commissions(affiliate_account_id,referred_profile_id,order_id,order_item_id,rule_id,level,basis_amount,amount,currency_code,status,available_at,fraud_snapshot)
        VALUES(recipient.id,target.profile_id,target.id,item.id,rule.id,level_no,item.total_amount,commission,target.currency_code,
          CASE WHEN attribution.fraud_status='review' THEN 'held_review' ELSE 'pending' END,
          now()+make_interval(days=>coalesce(rule.holding_days,hold_days)),jsonb_build_object('status',attribution.fraud_status,'score',attribution.fraud_score))
        ON CONFLICT(order_item_id,affiliate_account_id,level) DO NOTHING RETURNING * INTO inserted;
        IF inserted.id IS NOT NULL THEN
          INSERT INTO public.affiliate_commission_events(commission_id,to_status,amount,currency_code,reason)
          VALUES(inserted.id,inserted.status,inserted.amount,inserted.currency_code,'order_qualified');
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  loyalty:=private.ensure_loyalty_account(target.profile_id);
  SELECT coalesce(t.points_multiplier_bps,10000) INTO tier_multiplier FROM public.customer_tiers t WHERE t.id=loyalty.current_tier_id;
  SELECT coalesce(max(multiplier_bps),10000) INTO seasonal_multiplier FROM public.loyalty_rules
    WHERE rule_kind='seasonal_multiplier' AND active AND deleted_at IS NULL AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>now());
  points:=0;
  FOR item IN SELECT oi.total_amount,p.category_id FROM public.order_items oi JOIN public.products p ON p.id=oi.product_id WHERE oi.order_id=target.id LOOP
    SELECT * INTO earn FROM public.loyalty_rules WHERE rule_kind='earn' AND amount_minor>0 AND active AND deleted_at IS NULL
      AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>now())
      AND (configuration->>'category_id'=item.category_id::text OR configuration->>'category_id' IS NULL)
      ORDER BY CASE WHEN configuration->>'category_id'=item.category_id::text THEN 1 ELSE 0 END DESC,created_at DESC LIMIT 1;
    IF earn.id IS NOT NULL THEN
      expiry_days:=coalesce((earn.configuration->>'expiry_days')::int,expiry_days);
      line_points:=(item.total_amount/earn.amount_minor)*earn.points_value;
      points:=points+line_points;
    END IF;
  END LOOP;
  points:=(points*coalesce(tier_multiplier,10000)/10000)*coalesce(seasonal_multiplier,10000)/10000;
  IF points>0 THEN
    INSERT INTO public.loyalty_point_entries(loyalty_account_id,entry_kind,points,source_type,source_id,idempotency_key,expires_at,metadata)
    VALUES(loyalty.id,'purchase',points,'order',target.id,'loyalty:purchase:'||target.id,now()+make_interval(days=>expiry_days),jsonb_build_object('profile_id',target.profile_id,'order_number',target.order_number,'tier_multiplier_bps',tier_multiplier,'seasonal_multiplier_bps',seasonal_multiplier))
    ON CONFLICT(idempotency_key) DO NOTHING;
  END IF;
  SELECT streak_days,last_activity_date INTO streak,last_date FROM public.loyalty_accounts WHERE id=loyalty.id;
  IF last_date IS NULL OR last_date<current_date THEN
    streak:=CASE WHEN last_date=current_date-1 THEN streak+1 ELSE 1 END;
    UPDATE public.loyalty_accounts SET streak_days=streak,last_activity_date=current_date,updated_at=statement_timestamp() WHERE id=loyalty.id;
    INSERT INTO public.loyalty_streak_events(profile_id,activity_date,streak_days,order_id) VALUES(target.profile_id,current_date,streak,target.id) ON CONFLICT DO NOTHING;
    SELECT * INTO earn FROM public.loyalty_rules WHERE rule_kind='streak' AND active AND deleted_at IS NULL AND coalesce((configuration->>'days')::int,0)=streak LIMIT 1;
    IF earn.id IS NOT NULL AND earn.points_value>0 THEN
      INSERT INTO public.loyalty_point_entries(loyalty_account_id,entry_kind,points,source_type,source_id,idempotency_key,metadata)
      VALUES(loyalty.id,'streak_bonus',earn.points_value,'order',target.id,'loyalty:streak:'||target.profile_id||':'||current_date,jsonb_build_object('profile_id',target.profile_id,'streak_days',streak)) ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  IF attribution.id IS NOT NULL AND attribution.fraud_status='clear' AND NOT EXISTS(SELECT 1 FROM public.orders o WHERE o.profile_id=target.profile_id AND o.id<>target.id AND o.status IN ('delivered','completed')) THEN
    SELECT * INTO referral_rule FROM public.loyalty_rules WHERE code='referral.qualified' AND active AND deleted_at IS NULL;
    SELECT * INTO account FROM public.affiliate_accounts WHERE id=attribution.affiliate_account_id;
    IF referral_rule.id IS NOT NULL AND account.profile_id IS NOT NULL THEN
      referral_loyalty:=private.ensure_loyalty_account(account.profile_id);
      INSERT INTO public.loyalty_point_entries(loyalty_account_id,entry_kind,points,source_type,source_id,idempotency_key,metadata)
      VALUES(referral_loyalty.id,'referral_bonus',referral_rule.points_value,'order',target.id,'loyalty:referral:'||attribution.id,jsonb_build_object('profile_id',account.profile_id,'referred_profile_id',target.profile_id)) ON CONFLICT DO NOTHING;
    END IF;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.award_order_growth(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.reverse_order_growth(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row record;
BEGIN
  FOR row IN SELECT * FROM public.affiliate_commissions WHERE order_id=p_order_id AND status<>'reversed' LOOP
    INSERT INTO public.affiliate_commission_events(commission_id,from_status,to_status,amount,currency_code,reason)
    VALUES(row.id,row.status,'reversed',row.amount,row.currency_code,'order_refunded');
    UPDATE public.affiliate_commissions SET status='reversed',reversed_at=now(),updated_at=statement_timestamp() WHERE id=row.id;
  END LOOP;
  FOR row IN SELECT loyalty_account_id,sum(points) points FROM public.loyalty_point_entries WHERE source_type='order' AND source_id=p_order_id AND points>0 GROUP BY loyalty_account_id LOOP
    INSERT INTO public.loyalty_point_entries(loyalty_account_id,entry_kind,points,source_type,source_id,idempotency_key,metadata)
    SELECT row.loyalty_account_id,'refund_reversal',-row.points,'order',p_order_id,'loyalty:refund:'||p_order_id||':'||row.loyalty_account_id,
      jsonb_build_object('profile_id',a.profile_id) FROM public.loyalty_accounts a WHERE a.id=row.loyalty_account_id
    ON CONFLICT(idempotency_key) DO NOTHING;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION private.reverse_order_growth(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.process_growth_order_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.to_status IN ('delivered','completed') THEN PERFORM private.award_order_growth(NEW.order_id); END IF;
  IF NEW.to_status='refunded' THEN PERFORM private.reverse_order_growth(NEW.order_id); END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.process_growth_order_event() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER order_events_growth AFTER INSERT ON public.order_events FOR EACH ROW EXECUTE FUNCTION private.process_growth_order_event();

CREATE OR REPLACE FUNCTION private.award_review_points()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE account public.loyalty_accounts; rule public.loyalty_rules;
BEGIN
  IF NEW.status='approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    SELECT * INTO rule FROM public.loyalty_rules WHERE code='review.approved' AND active AND deleted_at IS NULL;
    IF rule.id IS NOT NULL AND rule.points_value>0 THEN
      account:=private.ensure_loyalty_account(NEW.profile_id);
      INSERT INTO public.loyalty_point_entries(loyalty_account_id,entry_kind,points,source_type,source_id,idempotency_key,metadata)
      VALUES(account.id,'review_bonus',rule.points_value,'review',NEW.id,'loyalty:review:'||NEW.id,jsonb_build_object('profile_id',NEW.profile_id,'product_id',NEW.product_id)) ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.award_review_points() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER reviews_loyalty_bonus AFTER UPDATE OF status ON public.reviews FOR EACH ROW EXECUTE FUNCTION private.award_review_points();

CREATE OR REPLACE FUNCTION public.request_affiliate_payout(p_amount bigint,p_currency_code text,p_destination_kind text,p_destination jsonb DEFAULT '{}'::jsonb)
RETURNS public.affiliate_payout_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE account public.affiliate_accounts; result public.affiliate_payout_requests; available bigint:=0; reserved bigint:=0; needed bigint; row record; take bigint; minimum bigint:=0;
BEGIN
  SELECT * INTO account FROM public.affiliate_accounts WHERE profile_id=auth.uid() AND status='active' AND deleted_at IS NULL FOR UPDATE;
  IF account.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active_affiliate_required'; END IF;
  IF p_amount<=0 OR p_destination_kind NOT IN ('wallet','external') OR jsonb_typeof(coalesce(p_destination,'{}'))<>'object' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='payout_invalid'; END IF;
  SELECT coalesce((value->>p_currency_code)::bigint,0) INTO minimum FROM public.growth_settings WHERE key='affiliate.minimum_payout';
  IF p_amount<minimum THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='payout_below_minimum'; END IF;
  SELECT coalesce(sum(amount),0) INTO available FROM public.affiliate_commissions WHERE affiliate_account_id=account.id AND currency_code=p_currency_code AND status='available';
  SELECT coalesce(sum(pa.amount),0) INTO reserved FROM public.affiliate_payout_allocations pa JOIN public.affiliate_payout_requests pr ON pr.id=pa.payout_request_id WHERE pr.affiliate_account_id=account.id AND pr.currency_code=p_currency_code AND pr.status NOT IN ('rejected','cancelled');
  IF p_amount>available-reserved THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='affiliate_available_balance_insufficient'; END IF;
  INSERT INTO public.affiliate_payout_requests(affiliate_account_id,destination_kind,amount,currency_code,destination)
  VALUES(account.id,p_destination_kind,p_amount,p_currency_code,coalesce(p_destination,'{}')) RETURNING * INTO result;
  needed:=p_amount;
  FOR row IN SELECT c.id,c.amount-coalesce((SELECT sum(pa.amount) FROM public.affiliate_payout_allocations pa JOIN public.affiliate_payout_requests pr ON pr.id=pa.payout_request_id WHERE pa.commission_id=c.id AND pr.status NOT IN ('rejected','cancelled')),0) free_amount FROM public.affiliate_commissions c WHERE c.affiliate_account_id=account.id AND c.currency_code=p_currency_code AND c.status='available' ORDER BY c.available_at,c.id FOR UPDATE LOOP
    EXIT WHEN needed=0; take:=least(needed,row.free_amount); IF take>0 THEN INSERT INTO public.affiliate_payout_allocations(payout_request_id,commission_id,amount) VALUES(result.id,row.id,take); needed:=needed-take; END IF;
  END LOOP;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.request_affiliate_payout(bigint,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_affiliate_payout(bigint,text,text,jsonb) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.redeem_loyalty_points(p_kind public.loyalty_redemption_kind,p_idempotency_key text)
RETURNS public.loyalty_redemptions LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE account public.loyalty_accounts; cfg jsonb; needed bigint; amount bigint; currency text; bps int; expiry_days int; result public.loyalty_redemptions; posted public.wallet_transactions;
BEGIN
  IF auth.uid() IS NULL OR nullif(trim(p_idempotency_key),'') IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required'; END IF;
  SELECT * INTO result FROM public.loyalty_redemptions WHERE idempotency_key=p_idempotency_key AND profile_id=auth.uid(); IF result.id IS NOT NULL THEN RETURN result; END IF;
  account:=private.ensure_loyalty_account(auth.uid());
  SELECT value INTO cfg FROM public.growth_settings WHERE key=CASE WHEN p_kind='wallet_credit' THEN 'loyalty.wallet_redemption' ELSE 'loyalty.discount_redemption' END;
  needed:=coalesce((cfg->>'points')::bigint,0); IF needed<=0 OR account.cached_points<needed THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='loyalty_points_insufficient'; END IF;
  IF p_kind='wallet_credit' THEN
    amount:=(cfg->>'amount_minor')::bigint; currency:=cfg->>'currency';
    INSERT INTO public.loyalty_redemptions(profile_id,kind,points_spent,amount_minor,currency_code,idempotency_key)
    VALUES(auth.uid(),p_kind,needed,amount,currency,p_idempotency_key) RETURNING * INTO result;
    INSERT INTO public.loyalty_point_entries(loyalty_account_id,entry_kind,points,source_type,source_id,idempotency_key,metadata)
    VALUES(account.id,'wallet_redemption',-needed,'loyalty_redemption',result.id,'loyalty:redeem:'||p_idempotency_key,jsonb_build_object('profile_id',auth.uid()));
    posted:=private.growth_wallet_credit(auth.uid(),currency,amount,'bonus','loyalty-wallet:'||p_idempotency_key,'loyalty_redemption',result.id,'loyalty points redemption',jsonb_build_object('points',needed));
    UPDATE public.loyalty_redemptions SET wallet_transaction_id=posted.id,updated_at=statement_timestamp() WHERE id=result.id RETURNING * INTO result;
  ELSE
    bps:=(cfg->>'discount_bps')::int; expiry_days:=coalesce((cfg->>'expires_days')::int,30);
    INSERT INTO public.loyalty_redemptions(profile_id,kind,points_spent,discount_bps,discount_expires_at,idempotency_key)
    VALUES(auth.uid(),p_kind,needed,bps,now()+make_interval(days=>expiry_days),p_idempotency_key) RETURNING * INTO result;
    INSERT INTO public.loyalty_point_entries(loyalty_account_id,entry_kind,points,source_type,source_id,idempotency_key,metadata)
    VALUES(account.id,'discount_redemption',-needed,'loyalty_redemption',result.id,'loyalty:redeem:'||p_idempotency_key,jsonb_build_object('profile_id',auth.uid()));
  END IF;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.redeem_loyalty_points(public.loyalty_redemption_kind,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.redeem_loyalty_points(public.loyalty_redemption_kind,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.claim_loyalty_discount(p_redemption_id uuid,p_profile_id uuid,p_order_id uuid)
RETURNS public.loyalty_redemptions LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target public.loyalty_redemptions; result public.loyalty_redemptions;
BEGIN
  IF NOT (coalesce(auth.uid()=p_profile_id,false) OR private.growth_staff('orders.manage')) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='loyalty_discount_owner_required';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.orders WHERE id=p_order_id AND profile_id=p_profile_id) THEN
    RAISE EXCEPTION USING ERRCODE='23503',MESSAGE='loyalty_discount_order_mismatch';
  END IF;
  SELECT * INTO target FROM public.loyalty_redemptions WHERE id=p_redemption_id AND profile_id=p_profile_id FOR UPDATE;
  IF target.id IS NULL OR target.kind<>'discount' OR target.status<>'active' OR target.discount_expires_at<=now() THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='loyalty_discount_unavailable';
  END IF;
  UPDATE public.loyalty_redemptions SET status='used',used_order_id=p_order_id,updated_at=statement_timestamp()
  WHERE id=target.id RETURNING * INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_loyalty_discount(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_loyalty_discount(uuid,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.review_affiliate_payout(p_request_id uuid,p_status public.affiliate_payout_status,p_reason text)
RETURNS public.affiliate_payout_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target public.affiliate_payout_requests; account public.affiliate_accounts; posted public.wallet_transactions; row record;
BEGIN
  IF NOT private.growth_staff('affiliate.manage') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='affiliate_manage_required'; END IF;
  IF p_status NOT IN ('reviewing','approved','processing','paid','rejected','cancelled') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='payout_status_invalid'; END IF;
  SELECT * INTO target FROM public.affiliate_payout_requests WHERE id=p_request_id FOR UPDATE;
  IF target.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='payout_not_found'; END IF;
  SELECT * INTO account FROM public.affiliate_accounts WHERE id=target.affiliate_account_id;
  IF p_status='paid' AND target.destination_kind='wallet' AND target.wallet_transaction_id IS NULL THEN
    posted:=private.growth_wallet_credit(account.profile_id,target.currency_code,target.amount,'commission','affiliate-payout:'||target.id,'affiliate_payout',target.id,'affiliate commission payout',jsonb_build_object('affiliate_account_id',account.id));
    target.wallet_transaction_id:=posted.id;
  END IF;
  UPDATE public.affiliate_payout_requests SET status=p_status,review_reason=nullif(trim(p_reason),''),reviewed_by=auth.uid(),reviewed_at=now(),wallet_transaction_id=target.wallet_transaction_id,paid_at=CASE WHEN p_status='paid' THEN now() ELSE paid_at END,updated_at=statement_timestamp() WHERE id=target.id RETURNING * INTO target;
  IF p_status='paid' THEN
    FOR row IN SELECT commission_id,sum(amount) amount FROM public.affiliate_payout_allocations WHERE payout_request_id=target.id GROUP BY commission_id LOOP
      IF row.amount >= (SELECT amount FROM public.affiliate_commissions WHERE id=row.commission_id) THEN
        UPDATE public.affiliate_commissions SET status='paid',paid_at=now(),payout_request_id=target.id,updated_at=statement_timestamp() WHERE id=row.commission_id;
        INSERT INTO public.affiliate_commission_events(commission_id,from_status,to_status,amount,currency_code,reason,actor_id)
        SELECT id,'available','paid',amount,currency_code,'payout_completed',auth.uid() FROM public.affiliate_commissions WHERE id=row.commission_id;
      END IF;
    END LOOP;
  END IF;
  INSERT INTO public.audit_logs(actor_id,actor_type,action,resource_type,resource_id,after,reason)
  VALUES(auth.uid(),'user','affiliate.payout.'||p_status,'affiliate_payout',target.id,jsonb_build_object('status',p_status,'amount',target.amount,'currency',target.currency_code),p_reason);
  RETURN target;
END;
$$;
REVOKE ALL ON FUNCTION public.review_affiliate_payout(uuid,public.affiliate_payout_status,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.review_affiliate_payout(uuid,public.affiliate_payout_status,text) TO service_role;

CREATE OR REPLACE FUNCTION public.run_growth_maintenance()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE matured int:=0; expired int:=0; changed int:=0; row record; expiry_entry record; badge record; badge_entry public.loyalty_point_entries; new_tier uuid; spend bigint; expiry_points bigint; metric_value bigint; threshold_value bigint;
BEGIN
  IF NOT private.growth_staff('loyalty.manage') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='loyalty_manage_required'; END IF;
  FOR row IN SELECT * FROM public.affiliate_commissions WHERE status='pending' AND available_at<=now() FOR UPDATE SKIP LOCKED LOOP
    UPDATE public.affiliate_commissions SET status='available',updated_at=statement_timestamp() WHERE id=row.id;
    INSERT INTO public.affiliate_commission_events(commission_id,from_status,to_status,amount,currency_code,reason) VALUES(row.id,'pending','available',row.amount,row.currency_code,'holding_period_completed');
    matured:=matured+1;
  END LOOP;
  FOR row IN SELECT a.id,a.profile_id FROM public.loyalty_accounts a FOR UPDATE LOOP
    FOR expiry_entry IN SELECT e.id,e.points FROM public.loyalty_point_entries e
      WHERE e.loyalty_account_id=row.id AND e.points>0 AND e.expires_at<=now()
        AND NOT EXISTS(SELECT 1 FROM public.loyalty_point_entries x WHERE x.idempotency_key='loyalty:expiry:'||e.id)
      ORDER BY e.expires_at,e.id LOOP
      expiry_points:=least(expiry_entry.points,greatest((SELECT cached_points FROM public.loyalty_accounts WHERE id=row.id),0));
      IF expiry_points>0 THEN
      INSERT INTO public.loyalty_point_entries(loyalty_account_id,entry_kind,points,source_type,idempotency_key,metadata)
        VALUES(row.id,'expiry',-expiry_points,'maintenance','loyalty:expiry:'||expiry_entry.id,jsonb_build_object('profile_id',row.profile_id,'expired_entry_id',expiry_entry.id)) ON CONFLICT DO NOTHING;
        expired:=expired+1;
      END IF;
    END LOOP;
    SELECT coalesce(sum(round(o.total_amount::numeric*power(10,c.rate_scale)::numeric/nullif(c.exchange_rate_minor,0)::numeric)),0)::bigint INTO spend
      FROM public.orders o JOIN public.currencies c ON c.code=o.currency_code
      WHERE o.profile_id=row.profile_id AND o.status IN ('delivered','completed') AND o.deleted_at IS NULL;
    SELECT id INTO new_tier FROM public.customer_tiers WHERE active AND deleted_at IS NULL AND minimum_lifetime_spend<=spend ORDER BY minimum_lifetime_spend DESC,sort_order DESC LIMIT 1;
    IF new_tier IS DISTINCT FROM (SELECT current_tier_id FROM public.loyalty_accounts WHERE id=row.id) THEN
      INSERT INTO public.vip_tier_events(profile_id,from_tier_id,to_tier_id,lifetime_spend,reason) SELECT row.profile_id,current_tier_id,new_tier,spend,'automatic_calculation' FROM public.loyalty_accounts WHERE id=row.id;
      UPDATE public.loyalty_accounts SET current_tier_id=new_tier,updated_at=statement_timestamp() WHERE id=row.id;
      INSERT INTO public.fulfillment_notifications(profile_id,audience,kind,payload) VALUES(row.profile_id,'customer','vip.tier_changed',jsonb_build_object('tier_id',new_tier));
      changed:=changed+1;
    END IF;
    FOR badge IN SELECT * FROM public.loyalty_badges b WHERE b.active AND b.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM public.loyalty_badge_awards a WHERE a.profile_id=row.profile_id AND a.badge_id=b.id) LOOP
      threshold_value:=coalesce((badge.criteria->>'threshold')::bigint,0);
      metric_value:=CASE badge.criteria->>'metric'
        WHEN 'lifetime_points' THEN (SELECT lifetime_earned FROM public.loyalty_accounts WHERE id=row.id)
        WHEN 'order_count' THEN (SELECT count(*) FROM public.orders o WHERE o.profile_id=row.profile_id AND o.status IN ('delivered','completed'))
        WHEN 'referrals' THEN (SELECT count(*) FROM public.referral_attributions a JOIN public.affiliate_accounts f ON f.id=a.affiliate_account_id WHERE f.profile_id=row.profile_id AND a.fraud_status='clear')
        WHEN 'streak' THEN (SELECT streak_days FROM public.loyalty_accounts WHERE id=row.id)
        ELSE 0 END;
      IF threshold_value>0 AND metric_value>=threshold_value THEN
        badge_entry:=NULL;
        IF badge.reward_points>0 THEN
          INSERT INTO public.loyalty_point_entries(loyalty_account_id,entry_kind,points,source_type,source_id,idempotency_key,metadata)
          VALUES(row.id,'badge_bonus',badge.reward_points,'badge',badge.id,'loyalty:badge:'||row.profile_id||':'||badge.id,jsonb_build_object('profile_id',row.profile_id,'metric_value',metric_value))
          ON CONFLICT(idempotency_key) DO UPDATE SET idempotency_key=excluded.idempotency_key RETURNING * INTO badge_entry;
        END IF;
        INSERT INTO public.loyalty_badge_awards(profile_id,badge_id,points_entry_id) VALUES(row.profile_id,badge.id,badge_entry.id) ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('matured_commissions',matured,'expired_accounts',expired,'tier_changes',changed,'ran_at',now());
END;
$$;
REVOKE ALL ON FUNCTION public.run_growth_maintenance() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.run_growth_maintenance() TO service_role;

DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='growth-maintenance-nightly') THEN
    PERFORM cron.schedule('growth-maintenance-nightly','17 2 * * *',$job$SELECT public.run_growth_maintenance();$job$);
  END IF;
END $$;

COMMENT ON FUNCTION public.claim_referral_attribution(uuid) IS 'Locks one immutable, server-side referral attribution to the authenticated profile and emits fraud signals.';
COMMENT ON FUNCTION public.request_affiliate_payout(bigint,text,text,jsonb) IS 'Atomically reserves matured commissions through payout allocations to prevent double withdrawal.';
COMMENT ON FUNCTION public.redeem_loyalty_points(public.loyalty_redemption_kind,text) IS 'Idempotently redeems points for a wallet credit or a single-use discount grant.';
