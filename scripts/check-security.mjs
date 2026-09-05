import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

function walk(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const resolved = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(resolved) : [resolved];
  });
}

const sourceFiles = walk(path.join(root, 'src')).filter((file) =>
  /\.(?:ts|tsx|js|jsx)$/.test(file)
);
const failures = [];
const publicSecret = /NEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|PRIVATE|SERVICE_ROLE|PASSWORD|TOKEN(?!_ID))/g;

for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(publicSecret)) {
    failures.push(`${path.relative(root, file)} exposes suspicious variable ${match[0]}`);
  }
  if (
    /^['"]use client['"];?/m.test(source) &&
    /SUPABASE_(?:SECRET|SERVICE_ROLE)|STRIPE_SECRET|APP_ENCRYPTION_KEY/.test(source)
  ) {
    failures.push(`${path.relative(root, file)} references a server secret from a client module`);
  }
}

const routeFiles = sourceFiles.filter(
  (file) => file.includes(`${path.sep}app${path.sep}api${path.sep}`) && file.endsWith('route.ts')
);
const authorizationMarkers = [
  'getAuthContext',
  'requireUser',
  'requirePermission',
  'CRON_SECRET',
  'getPaymentIdentity',
  'processPaymentWebhook',
  'withResellerApi',
  'authenticateReseller',
  'verifyApiRequest',
  'WHATSAPP_APP_SECRET',
  'TELEGRAM_WEBHOOK_SECRET',
  'webhookSecret'
];
for (const file of routeFiles) {
  const source = fs.readFileSync(file, 'utf8');
  if (!/export\s+async\s+function\s+(?:POST|PUT|PATCH|DELETE)/.test(source)) continue;
  if (!authorizationMarkers.some((marker) => source.includes(marker))) {
    failures.push(
      `${path.relative(root, file)} has a mutation without an authorization/signature marker`
    );
  }
}

if (failures.length) {
  console.error(
    'Security static audit failed:\n' + failures.map((failure) => `- ${failure}`).join('\n')
  );
  process.exit(1);
}
console.log(`Security static audit passed (${routeFiles.length} API routes checked).`);
