-- Run on staging with: psql "$DATABASE_URL" -f tests/database/query-performance.sql
-- Capture plans before and after every launch-index change. Never run ANALYZE on production peak traffic.
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id,status,total_amount,currency_code FROM orders WHERE profile_id=(SELECT id FROM profiles LIMIT 1) AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 50;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id FROM orders WHERE status='processing' AND deleted_at IS NULL ORDER BY created_at LIMIT 100;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM order_items WHERE order_id=(SELECT id FROM orders LIMIT 1) AND deleted_at IS NULL;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM order_events WHERE order_id=(SELECT id FROM orders LIMIT 1) ORDER BY created_at;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM payments WHERE profile_id=(SELECT id FROM profiles LIMIT 1) AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 50;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM payments WHERE status='pending' ORDER BY created_at LIMIT 100;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT currency_code,cached_balance FROM wallets WHERE owner_id=(SELECT id FROM profiles LIMIT 1) AND deleted_at IS NULL;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM wallet_transactions WHERE debit_wallet_id=(SELECT id FROM wallets LIMIT 1) OR credit_wallet_id=(SELECT id FROM wallets LIMIT 1) ORDER BY created_at DESC LIMIT 100;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id,slug,name FROM products WHERE status='active' AND deleted_at IS NULL ORDER BY sort_order,id LIMIT 24;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM products WHERE category_id=(SELECT id FROM categories LIMIT 1) AND status='active' AND deleted_at IS NULL LIMIT 24;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM product_variants WHERE product_id=(SELECT id FROM products LIMIT 1) AND deleted_at IS NULL;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM carts WHERE profile_id=(SELECT id FROM profiles LIMIT 1) AND status='active' AND deleted_at IS NULL;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM cart_items WHERE cart_id=(SELECT id FROM carts LIMIT 1) AND deleted_at IS NULL;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM manual_fulfillment_tasks WHERE status='queued' AND deleted_at IS NULL ORDER BY priority DESC,sla_due_at LIMIT 100;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM fulfillment_jobs WHERE status='queued' AND run_at<=now() ORDER BY priority DESC,run_at LIMIT 100;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM supplier_orders WHERE status IN ('submitted','processing','partial') ORDER BY next_poll_at LIMIT 100;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM support_tickets WHERE profile_id=(SELECT id FROM profiles LIMIT 1) AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 50;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM notification_deliveries WHERE status='queued' ORDER BY next_attempt_at LIMIT 100;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM reseller_webhook_deliveries WHERE status='pending' ORDER BY next_attempt_at LIMIT 100;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT product_id,score_bps FROM profile_recommendations WHERE profile_id=(SELECT id FROM profiles LIMIT 1) AND expires_at>now() ORDER BY score_bps DESC LIMIT 12;
