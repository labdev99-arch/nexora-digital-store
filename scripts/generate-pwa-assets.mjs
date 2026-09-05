import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const output = path.resolve('public/splash');
await fs.mkdir(output, {recursive: true});
const sizes = [
  [640, 1136],
  [1170, 2532],
  [1290, 2796]
];
for (const [width, height] of sizes) {
  const logo = Math.round(Math.min(width, height) * 0.24);
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="rgb(139,92,246)"/><stop offset="1" stop-color="rgb(34,211,238)"/></linearGradient></defs><rect width="100%" height="100%" fill="rgb(10,10,15)"/><rect x="${(width - logo) / 2}" y="${(height - logo) / 2}" width="${logo}" height="${logo}" rx="${logo * 0.25}" fill="url(#g)"/><path d="M${width / 2 - logo * 0.24} ${height / 2 + logo * 0.25}V${height / 2 - logo * 0.25}L${width / 2 + logo * 0.24} ${height / 2 + logo * 0.25}V${height / 2 - logo * 0.25}" fill="none" stroke="white" stroke-width="${logo * 0.08}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  await sharp(Buffer.from(svg))
    .png()
    .toFile(path.join(output, `splash-${width}x${height}.png`));
}
