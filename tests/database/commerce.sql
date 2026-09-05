-- Run after 0016_phase5_commerce.sql. The block rolls back no production data;
-- the surrounding transaction rolls every synthetic row back.
BEGIN;
DO $$
DECLARE
  test_cart uuid := gen_random_uuid();
  test_order uuid := gen_random_uuid();
  test_coupon uuid := gen_random_uuid();
  failed_as_expected boolean := false;
  first_claim uuid;
  replay_claim uuid;
BEGIN
  INSERT INTO carts(id,guest_token_hash,currency_code,locale_code,status)
  VALUES(test_cart,encode(extensions.digest(gen_random_uuid()::text,'sha256'),'hex'),'USD','en','active');
  INSERT INTO orders(id,profile_id,guest_email,guest_access_token_hash,cart_id,checkout_idempotency_key,currency_code,locale_code,country_code,terms_accepted_at,subtotal_amount,total_amount,pricing_snapshot)
  VALUES(test_order,NULL,'phase5-test@example.invalid',encode(extensions.digest(gen_random_uuid()::text,'sha256'),'hex'),test_cart,'phase5-database-test','USD','en','LB',now(),1000,1000,'{}');
  BEGIN
    PERFORM transition_order_status(test_order,'completed',NULL,'test','database_test');
  EXCEPTION WHEN SQLSTATE '55000' THEN failed_as_expected := true;
  END;
  IF NOT failed_as_expected THEN RAISE EXCEPTION 'illegal order transition was accepted'; END IF;
  PERFORM transition_order_status(test_order,'awaiting_payment',NULL,'test','database_test');
  INSERT INTO coupons(id,code,kind,value_amount,currency_code,usage_limit,per_user_limit,minimum_cart_amount,active)
  VALUES(test_coupon,'PHASE5SQLTEST','fixed',100,'USD',1,1,100,true);
  SELECT id INTO first_claim FROM claim_order_coupon(test_coupon,test_order,NULL,100,'USD');
  SELECT id INTO replay_claim FROM claim_order_coupon(test_coupon,test_order,NULL,100,'USD');
  IF first_claim IS DISTINCT FROM replay_claim THEN RAISE EXCEPTION 'coupon replay was not idempotent'; END IF;
  IF (SELECT count(*) FROM order_events WHERE order_id=test_order)<>2 THEN RAISE EXCEPTION 'order events were not recorded'; END IF;
END $$;
ROLLBACK;
