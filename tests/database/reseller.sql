-- Run after 0023_phase8_reseller_api.sql on a disposable database.
BEGIN;
DO $$
DECLARE target_profile uuid; target_account uuid; target_tier uuid; target_key uuid;
DECLARE replay_blocked boolean := false; rate_blocked boolean := false; idem_blocked boolean := false;
BEGIN
  SELECT id INTO target_profile FROM profiles ORDER BY created_at LIMIT 1;
  IF target_profile IS NULL THEN RAISE EXCEPTION 'Phase 8 DB test requires one profile'; END IF;
  SELECT id INTO target_tier FROM reseller_tiers WHERE code='bronze';
  INSERT INTO reseller_accounts(profile_id,status,current_tier_id,approved_at)
  VALUES(target_profile,'active',target_tier,now())
  ON CONFLICT(profile_id) DO UPDATE SET status='active'
  RETURNING id INTO target_account;
  INSERT INTO reseller_api_keys(
    reseller_account_id,name,key_prefix,key_hash,signing_secret_ciphertext,
    environment,scopes,rate_limit_per_minute
  ) VALUES(
    target_account,'SQL test','nx_test_0123456789abcdef',repeat('a',64),'test',
    'sandbox',ARRAY['catalog:read'],1
  ) RETURNING id INTO target_key;
  PERFORM claim_reseller_api_request(target_key,'nonce-test-0001',now(),'127.0.0.1');
  BEGIN
    PERFORM claim_reseller_api_request(target_key,'nonce-test-0001',now(),'127.0.0.1');
  EXCEPTION WHEN unique_violation THEN replay_blocked:=true;
  END;
  IF NOT replay_blocked THEN RAISE EXCEPTION 'nonce replay was accepted'; END IF;
  BEGIN
    PERFORM claim_reseller_api_request(target_key,'nonce-test-0002',now(),'127.0.0.1');
  EXCEPTION WHEN SQLSTATE '54000' THEN rate_blocked:=true;
  END;
  IF NOT rate_blocked THEN RAISE EXCEPTION 'rate limit was bypassed'; END IF;
  INSERT INTO reseller_api_idempotency(reseller_account_id,scope,idempotency_key,request_hash)
  VALUES(target_account,'orders.create','sql-idempotency-test',repeat('b',64));
  BEGIN
    INSERT INTO reseller_api_idempotency(reseller_account_id,scope,idempotency_key,request_hash)
    VALUES(target_account,'orders.create','sql-idempotency-test',repeat('c',64));
  EXCEPTION WHEN unique_violation THEN idem_blocked:=true;
  END;
  IF NOT idem_blocked THEN RAISE EXCEPTION 'idempotency uniqueness was bypassed'; END IF;
END $$;
ROLLBACK;
