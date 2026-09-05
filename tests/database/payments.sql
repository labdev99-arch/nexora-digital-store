-- Run on a disposable migrated database. Verifies atomic settlement and replay.
BEGIN;

DO $$
DECLARE
  owner uuid;
  method record;
  payment uuid;
  first_tx uuid;
  replay_tx uuid;
  before_balance bigint;
  after_balance bigint;
BEGIN
  SELECT id INTO owner FROM profiles LIMIT 1;
  IF owner IS NULL THEN RAISE NOTICE 'Skipped payment test: no profile exists'; RETURN; END IF;
  FOR method IN SELECT id,code FROM payment_methods WHERE code IN ('stripe','whish','omt','crypto','bank_transfer','cash') LOOP
    payment := gen_random_uuid();
    INSERT INTO payments(id,profile_id,payment_method_id,provider_code,status,currency_code,requested_amount,fee_amount,payable_amount,payment_reference,provider_payment_id,idempotency_key,sandbox_mode)
    VALUES(payment,owner,method.id,method.code,'under_review','USD',1000,0,1000,'TEST-'||left(payment::text,8),'test_'||payment::text,'test-'||payment::text,true);

    SELECT coalesce(cached_balance,0) INTO before_balance FROM wallets
    WHERE owner_id=owner AND currency_code='USD' AND account_type='customer';
    SELECT wallet_transaction_id INTO first_tx FROM settle_wallet_topup(payment,1000,'evt-'||payment::text,NULL);
    SELECT wallet_transaction_id INTO replay_tx FROM settle_wallet_topup(payment,1000,'evt-replay-'||payment::text,NULL);
    IF first_tx IS NULL OR first_tx <> replay_tx THEN RAISE EXCEPTION '% settlement replay created a different transaction',method.code; END IF;
    SELECT cached_balance INTO after_balance FROM wallets
    WHERE owner_id=owner AND currency_code='USD' AND account_type='customer';
    IF after_balance - coalesce(before_balance,0) <> 1000 THEN RAISE EXCEPTION '% credited an incorrect amount',method.code; END IF;
    IF (SELECT count(*) FROM wallet_transactions WHERE reference_type='payment' AND reference_id=payment) <> 1 THEN
      RAISE EXCEPTION '% settlement was not idempotent',method.code;
    END IF;
  END LOOP;
END $$;

ROLLBACK;
