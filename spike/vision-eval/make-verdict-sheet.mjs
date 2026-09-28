// Builds verdict sheets: each photo next to the objects the model reported for it.
//
// Scoring happens by eye, and the eye needs the claim and the photo in the same place.
// One read per sheet instead of one read per photo.

import sharp from 'sharp';
import { readdir, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const photosDir = path.resolve('photos');
const runName = process.env.EVAL_RUN ?? '';
if (runName && !/^[a-zA-Z0-9_-]+$/.test(runName)) {
  throw new Error('EVAL_RUN must contain only letters, numbers, underscores or hyphens');
}
const outDir = path.resolve('out', ...(runName ? [runName] : []));
const rawDir = path.join(outDir, 'raw');

const TILE = 560;
const TEXT = 150;
const COLS = 2;
const PER_SHEET = 6;

const escape = (value) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const files = (await readdir(photosDir)).filter((name) => name.endsWith('.jpg')).sort();
await mkdir(outDir, { recursive: true });

for (let sheet = 0; sheet * PER_SHEET < files.length; sheet += 1) {
  const batch = files.slice(sheet * PER_SHEET, (sheet + 1) * PER_SHEET);
  const rows = Math.ceil(batch.length / COLS);
  const composites = [];

  for (const [index, name] of batch.entries()) {
    const stem = name.replace(/\.jpg$/, '');
    const record = JSON.parse(
      (await readFile(path.join(rawDir, `${stem}.json`), 'utf8')).replace(/^\uFEFF/, ''),
    );
    const objects = record.parsed?.objects ?? [];
    const lines = objects
      .slice(0, 7)
      .map((o) => `${o.observation_id.replace('obs_', '')} ${o.label} ${o.model_confidence}`);
    if (objects.length > 7) lines.push(`+${objects.length - 7} more`);

    const tile = await sharp(path.join(photosDir, name))
      .resize(TILE, TILE, { fit: 'cover' })
      .jpeg()
      .toBuffer();

    const header = `${name}  (${objects.length} obj, usable=${record.parsed?.image_quality?.usable}, home=${record.parsed?.image_quality?.looks_like_home_mandir})`;
    const text = `<svg width="${TILE}" height="${TEXT}"><rect width="${TILE}" height="${TEXT}" fill="black"/><text x="8" y="20" font-family="monospace" font-size="15" fill="#ffd479">${escape(header)}</text>${lines
      .map(
        (line, lineIndex) =>
          `<text x="8" y="${42 + lineIndex * 16}" font-family="monospace" font-size="14" fill="white">${escape(line)}</text>`,
      )
      .join('')}</svg>`;

    const left = (index % COLS) * TILE;
    const top = Math.floor(index / COLS) * (TILE + TEXT);
    composites.push({ input: tile, left, top });
    composites.push({ input: Buffer.from(text), left, top: top + TILE });
  }

  const sheetPath = path.join(outDir, `verdict-${sheet + 1}.jpg`);
  await sharp({
    create: {
      width: COLS * TILE,
      height: rows * (TILE + TEXT),
      channels: 3,
      background: { r: 24, g: 24, b: 24 },
    },
  })
    .composite(composites)
    .jpeg({ quality: 84 })
    .toFile(sheetPath);

  console.log(`wrote ${sheetPath} (${batch.length} photos)`);
}
