import fs from 'node:fs/promises';

const required = [
  'public/sw.js',
  'public/icons/icon-192.png',
  'public/icons/icon-512.png',
  'public/icons/maskable-512.png',
  'public/splash/splash-640x1136.png',
  'public/splash/splash-1170x2532.png',
  'public/splash/splash-1290x2796.png',
  'src/app/manifest.ts',
  'src/app/[locale]/offline/page.tsx'
];
for (const file of required) await fs.access(file);
const sw = await fs.readFile('public/sw.js', 'utf8');
for (const capability of [
  "addEventListener('install'",
  "addEventListener('fetch'",
  "addEventListener('sync'",
  "addEventListener('push'",
  'SAFE_QUEUE_PATHS'
])
  if (!sw.includes(capability)) throw new Error(`PWA capability missing: ${capability}`);
const manifest = await fs.readFile('src/app/manifest.ts', 'utf8');
for (const field of ['display_override', 'share_target', 'shortcuts', 'maskable'])
  if (!manifest.includes(field)) throw new Error(`Manifest field missing: ${field}`);
console.log('PWA static audit passed.');
