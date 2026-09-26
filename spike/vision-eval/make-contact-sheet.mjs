// Builds contact sheets so a human can check what the downloaded set actually contains.
// Not part of the evaluation: the harness never reads these.

import sharp from 'sharp';
import { readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';

const photosDir = path.resolve('photos');
const outDir = path.resolve('out');

const TILE = 300;
const COLS = 5;
const PER_SHEET = 15;

const files = (await readdir(photosDir)).filter((name) => name.endsWith('.jpg')).sort();
await mkdir(outDir, { recursive: true });

for (let sheet = 0; sheet * PER_SHEET < files.length; sheet += 1) {
  const batch = files.slice(sheet * PER_SHEET, (sheet + 1) * PER_SHEET);
  const rows = Math.ceil(batch.length / COLS);

  const composites = [];
  for (const [index, name] of batch.entries()) {
    const tile = await sharp(path.join(photosDir, name))
      .resize(TILE, TILE, { fit: 'cover' })
      .jpeg()
      .toBuffer();

    const label = `<svg width="${TILE}" height="26"><rect width="${TILE}" height="26" fill="black" opacity="0.65"/><text x="6" y="18" font-family="monospace" font-size="15" fill="white">${name}</text></svg>`;

    const left = (index % COLS) * TILE;
    const top = Math.floor(index / COLS) * TILE;
    composites.push({ input: tile, left, top });
    composites.push({ input: Buffer.from(label), left, top: top + TILE - 26 });
  }

  const sheetPath = path.join(outDir, `contact-${sheet + 1}.jpg`);
  await sharp({
    create: {
      width: COLS * TILE,
      height: rows * TILE,
      channels: 3,
      background: { r: 32, g: 32, b: 32 },
    },
  })
    .composite(composites)
    .jpeg({ quality: 80 })
    .toFile(sheetPath);

  console.log(`wrote ${sheetPath} (${batch.length} photos)`);
}
