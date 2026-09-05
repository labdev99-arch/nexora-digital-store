import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const budgets = JSON.parse(fs.readFileSync('performance-budget.json', 'utf8'));
const chunkDirectory = path.join('.next', 'static', 'chunks');
if (!fs.existsSync(chunkDirectory)) {
  console.log('No .next build found; runtime bundle budget check skipped.');
  process.exit(0);
}

const files = fs.readdirSync(chunkDirectory).filter((file) => file.endsWith('.js'));
const sizes = files.map((file) => ({
  file,
  bytes: fs.statSync(path.join(chunkDirectory, file)).size
}));
const largest = sizes.sort((a, b) => b.bytes - a.bytes)[0];
const total = sizes.reduce((sum, item) => sum + item.bytes, 0);
const failures = [];
if (largest && largest.bytes > budgets.javascript.maxChunkBytes)
  failures.push(`largest chunk ${largest.file} is ${largest.bytes} bytes`);
if (total > budgets.javascript.totalSharedBytes)
  failures.push(`total shared chunks are ${total} bytes`);
if (failures.length) {
  console.error(
    'Performance budget failed:\n' + failures.map((failure) => `- ${failure}`).join('\n')
  );
  process.exit(1);
}
console.log(`Performance budget passed: ${sizes.length} chunks, ${total} total bytes.`);
