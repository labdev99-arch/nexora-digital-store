import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const root = process.cwd();
const migrationDirectory = path.join(root, 'drizzle');
const files = fs
  .readdirSync(migrationDirectory)
  .filter((file) => /^\d+.*\.sql$/.test(file))
  .sort();
const sql = files
  .map((file) => fs.readFileSync(path.join(migrationDirectory, file), 'utf8'))
  .join('\n');

const tables = new Set(
  [...sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+(?!AS\b)(?:(?:public\.)?"?([a-z0-9_]+)"?)/gi)]
    .map((match) => match[1])
    .filter((table) => table !== '__drizzle_migrations')
);
const rlsEnabled = new Set(
  [
    ...sql.matchAll(
      /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?"?([a-z0-9_]+)"?\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi
    )
  ].map((match) => match[1])
);

for (const block of sql.matchAll(
  /FOREACH\s+\w+\s+IN\s+ARRAY\s+ARRAY\[([^\]]+)\][\s\S]{0,500}?ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi
)) {
  for (const item of block[1].matchAll(/'([a-z0-9_]+)'/gi)) rlsEnabled.add(item[1]);
}

const policyTables = new Set(
  [...sql.matchAll(/CREATE\s+POLICY\s+[a-z0-9_"]+\s+ON\s+(?:public\.)?"?([a-z0-9_]+)"?/gi)].map(
    (match) => match[1]
  )
);

const staticFailures = [...tables]
  .filter((table) => !rlsEnabled.has(table) || !policyTables.has(table))
  .map((table) => ({table, rls: rlsEnabled.has(table), policy: policyTables.has(table)}));

if (staticFailures.length) {
  console.error('RLS migration audit failed:');
  for (const failure of staticFailures)
    console.error(`- ${failure.table}: rls=${failure.rls}, policy=${failure.policy}`);
  process.exit(1);
}

const databaseUrl = process.env.SECURITY_AUDIT_DATABASE_URL || process.env.DATABASE_URL;
if (databaseUrl && !databaseUrl.includes('localhost:54322/postgres')) {
  const client = new pg.Client({connectionString: databaseUrl, ssl: {rejectUnauthorized: false}});
  await client.connect();
  try {
    const result = await client.query(`
      SELECT n.nspname AS schema_name, c.relname AS table_name,
             c.relrowsecurity AS rls_enabled, count(p.polname)::int AS policy_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_policy p ON p.polrelid = c.oid
      WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
        AND c.relname <> '__drizzle_migrations'
      GROUP BY n.nspname, c.relname, c.relrowsecurity
      HAVING NOT c.relrowsecurity OR count(p.polname) = 0
      ORDER BY c.relname
    `);
    if (result.rows.length) {
      console.error('Live RLS audit failed:', result.rows);
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

if (!process.exitCode) console.log(`RLS audit passed for ${tables.size} tables.`);
