-- Run after 0018_phase6_fulfillment.sql on a disposable or transaction-safe database.
BEGIN;
DO $$
DECLARE
  item record;
  source_variant record;
  test_order uuid := gen_random_uuid();
  test_item uuid := gen_random_uuid();
  test_code uuid;
  assigned stock_codes;
  replay_failed boolean := false;
  job fulfillment_jobs;
BEGIN
  SELECT oi.id,oi.variant_id INTO item FROM order_items oi ORDER BY oi.created_at LIMIT 1;
  IF item.id IS NULL THEN
    SELECT v.id AS variant_id,v.product_id,v.sku,v.name,p.name AS product_name
      INTO source_variant
      FROM product_variants v JOIN products p ON p.id=v.product_id
      WHERE v.deleted_at IS NULL ORDER BY v.created_at LIMIT 1;
    IF source_variant.variant_id IS NULL THEN RAISE EXCEPTION 'Phase 6 DB test requires one catalog variant'; END IF;
    INSERT INTO orders(id,profile_id,guest_email,guest_access_token_hash,checkout_idempotency_key,currency_code,locale_code,country_code,terms_accepted_at,subtotal_amount,total_amount,pricing_snapshot)
    VALUES(test_order,NULL,'phase6-test@example.invalid',encode(extensions.digest(gen_random_uuid()::text,'sha256'),'hex'),'phase6-database-test','USD','en','LB',now(),100,100,'{}');
    INSERT INTO order_items(id,order_id,product_id,variant_id,sku,product_name,variant_name,quantity,base_amount,total_amount,fulfillment_mode)
    VALUES(test_item,test_order,source_variant.product_id,source_variant.variant_id,source_variant.sku,source_variant.product_name,source_variant.name,1,100,100,'auto');
    item.id:=test_item;
    item.variant_id:=source_variant.variant_id;
  END IF;
  INSERT INTO stock_codes(variant_id,payload_ciphertext,payload_hash,display_hint)
  VALUES(item.variant_id,'test:ciphertext',encode(extensions.digest(gen_random_uuid()::text,'sha256'),'hex'),'test') RETURNING id INTO test_code;
  assigned:=assign_stock_code(item.id);
  IF assigned.id IS DISTINCT FROM test_code OR assigned.status<>'assigned' THEN RAISE EXCEPTION 'atomic code assignment failed'; END IF;
  BEGIN
    UPDATE stock_codes SET assigned_order_item_id=NULL WHERE id=test_code;
  EXCEPTION WHEN SQLSTATE '55000' THEN replay_failed:=true;
  END;
  IF NOT replay_failed THEN RAISE EXCEPTION 'stock assignment constraint was bypassed'; END IF;
  INSERT INTO fulfillment_jobs(kind,aggregate_type,aggregate_id,idempotency_key)
  VALUES('test.job','order_item',item.id,'phase6-db-test') RETURNING * INTO job;
  IF (SELECT count(*) FROM claim_fulfillment_jobs('sql-test',1,60) WHERE id=job.id)<>1 THEN RAISE EXCEPTION 'job claim failed'; END IF;
  PERFORM finish_fulfillment_job(job.id,'sql-test',false,'{}','retryable','test retry');
  IF (SELECT status FROM fulfillment_jobs WHERE id=job.id)<>'retrying' THEN RAISE EXCEPTION 'job retry scheduling failed'; END IF;
END $$;
ROLLBACK;
