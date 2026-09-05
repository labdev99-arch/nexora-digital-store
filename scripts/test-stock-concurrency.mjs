import {createHash, randomUUID} from 'node:crypto';
import pg from 'pg';

if (process.env.FULFILLMENT_TEST_DATABASE !== '1') {
  throw new Error(
    'Refusing to mutate inventory outside a disposable database. Set FULFILLMENT_TEST_DATABASE=1.'
  );
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
if (!process.env.FULFILLMENT_TEST_ORDER_ITEM_ID)
  throw new Error('FULFILLMENT_TEST_ORDER_ITEM_ID is required.');

const pool = new pg.Pool({connectionString: process.env.DATABASE_URL, max: 100});
const itemId = process.env.FULFILLMENT_TEST_ORDER_ITEM_ID;
const itemResult = await pool.query('select variant_id from order_items where id=$1', [itemId]);
const variantId = itemResult.rows[0]?.variant_id;
if (!variantId) throw new Error('Test order item not found.');

const prefix = `phase6-${randomUUID()}`;
for (let index = 0; index < 50; index += 1) {
  const code = `${prefix}-${index}`;
  await pool.query(
    `insert into stock_codes(variant_id,payload_ciphertext,payload_hash,display_hint)
     values($1,$2,$3,$4)`,
    [variantId, `test:${code}`, createHash('sha256').update(code).digest('hex'), `test-${index}`]
  );
}

const attempts = await Promise.all(
  Array.from({length: 100}, () =>
    pool
      .query('select (assign_stock_code($1)).id as id', [itemId])
      .then((result) => ({ok: true, id: result.rows[0].id}))
      .catch((error) => ({ok: false, error: String(error.message)}))
  )
);
const successes = attempts.filter((result) => result.ok);
const uniqueIds = new Set(successes.map((result) => result.id));
const unavailable = attempts.filter(
  (result) => !result.ok && result.error.includes('stock_code_unavailable')
).length;
if (successes.length !== 50 || uniqueIds.size !== 50 || unavailable !== 50) {
  throw new Error(
    `Atomic assignment failed: success=${successes.length}, unique=${uniqueIds.size}, unavailable=${unavailable}`
  );
}
const duplicated = await pool.query(
  `select count(*)::integer as count from (
     select id from stock_codes where payload_ciphertext like $1 and status='assigned' group by id having count(*)>1
   ) duplicate_codes`,
  [`test:${prefix}%`]
);
if (duplicated.rows[0].count !== 0) throw new Error('A stock code was assigned more than once.');
console.log(
  JSON.stringify({parallelWorkers: 100, assigned: 50, rejected: 50, uniqueAssignments: 50})
);
await pool.end();
