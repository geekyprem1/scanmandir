// Writes photos/SOURCES.md from the repaired manifest: what each photo shows, who made
// it and under which licence. Only files still on disk are listed.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const photosDir = path.resolve('photos');

/** What each photo shows, read off the image and cross-checked against its Commons title. */
const notes = {
  'diya-01.jpg': 'aarti lamps at the Ganga aarti, dense flames in near darkness — low light',
  'diya2-01.jpg': 'priest with a flame at the Ganga aarti, smoke and motion — low light',
  'diya2-02.jpg': 'flames and smoke filling the frame — low light, heavy occlusion',
  'diya2-03.jpg': 'smoke and ash at the aarti — low light, low contrast',
  'thali-01.jpg': 'aarti thali with lit diyas and flowers, held in hands — small objects, low light',
  'ganesha-01.jpg': 'Ganesha murti worshipped at home — a home idol, bright and close',
  'shrine-02.jpg': 'decorated Laddu Gopal (Krishna) in a home shrine — home shrine, single idol',
  'pujaroom2-01.jpg': 'Vishu kani arranged at home: lamps, offerings, mirror — home shrine, many small objects',
  'pujaroom-01.jpg': 'shelf of many statues in a heritage home — counting, many objects',
  'homem-01.jpg': 'lamp stand with many lit diyas — many repeated small objects',
  'lakshmi-01.jpg': 'Lakshmi carved in stone, 12th century — representation_type: carving',
  'lakshmi-02.jpg': 'meditating Lakshmi, carved, 12th century — representation_type: carving',
  'lakshmi-03.jpg': 'Durga idol in ceremonial worship — festival display, not a home',
  'radhakrishna-01.jpg': 'Radha-Krishna and Devi idols outdoors on a farm — small idols, daylight',
  'radhakrishna-02.jpg': 'Hanuman idol in a temple complex — temple, not a home',
  'radhakrishna-03.jpg': 'Radha-Krishna in a temple sanctum, densely decorated — temple, crowded',
  'notmandir-01.jpg': 'living room with sofa — relevance rejection',
  'notmandir-02.jpg': '19th century living room — relevance rejection',
  'notmandir-03.jpg': 'cabin living room with fireplace — relevance rejection',
};

const manifest = JSON.parse(
  (await readFile(path.join(photosDir, 'sources.json'), 'utf8')).replace(/^\uFEFF/, ''),
);
const files = (await readdir(photosDir)).filter((name) => name.endsWith('.jpg')).sort();
const rows = files
  .filter((name) => !name.startsWith('quality-blur'))
  .map((name) => {
    const row = manifest.find((entry) => entry.file === name);
    if (!row) throw new Error(`no provenance for ${name}`);
    return row;
  });

const home = files.filter((name) =>
  ['ganesha-01.jpg', 'shrine-02.jpg', 'pujaroom2-01.jpg', 'pujaroom-01.jpg'].includes(name),
);

const lines = [
  '# Where these photos came from',
  '',
  'Downloaded from Wikimedia Commons on 26 September 2026 for the vision evaluation',
  '(TASKS P0-05). Only freely licensed files were taken — CC0, public domain, CC BY or',
  'CC BY-SA. Non-commercial and no-derivatives licences were refused, because this set is',
  'sent to a third-party provider (docs/decisions.md D-08) and its output may appear in a',
  'report.',
  '',
  'This is a scratch evaluation set, not part of the product. It stays out of version',
  'control (`.gitignore`), and every row below is the attribution record for it.',
  '',
  '## What is actually in the set',
  '',
  `**${files.length} photos.** The honest split:`,
  '',
  `- Home shrine: ${home.length} (ganesha-01, shrine-02, pujaroom2-01, pujaroom-01)`,
  '- Low light or evening ritual: 5 (diya-01, diya2-01, diya2-02, diya2-03, thali-01)',
  '- Idols, carvings and festival displays: 8 (lakshmi-01..03, radhakrishna-01..03, homem-01)',
  '- Temple interiors: 2 (radhakrishna-02, radhakrishna-03)',
  '- Not a mandir at all: 3 (notmandir-01..03)',
  '- Synthetic: 1 (quality-blur-01, a blurred copy of pujaroom2-01, for the quality gate)',
  '',
  '**The gap, stated plainly.** Commons has very few photographs of real home mandirs.',
  'Most of what the searches return is temples, carvings, processions and buildings, and',
  'most of what was downloaded was discarded for that reason — keeping it would have',
  'measured something other than the question the app asks. With four home-shrine photos,',
  'this set can answer "can the model identify deities and objects at all" and "does it',
  'reject irrelevant photos". It cannot settle the launch label catalog (P0-06) or the',
  'acceptance thresholds (P0-08) on its own. That needs photos of real home mandirs, which',
  'means the project owner\'s own set or licensed ones.',
  '',
  '## Photos',
  '',
  '| File | What it shows | Licence | Author | Source |',
  '|---|---|---|---|---|',
];

for (const row of rows) {
  const author = (row.author || 'unknown').replace(/\|/g, '/');
  const title = row.title.replace(/^File:/, '');
  lines.push(
    `| ${row.file} | ${notes[row.file] ?? '—'} | ${row.licence} | ${author} | [${title}](${row.page}) |`,
  );
}

lines.push(
  '| quality-blur-01.jpg | synthetic blur of pujaroom2-01, for the quality gate | project-generated | — | — |',
  '',
  '## How the set was pruned',
  '',
  'Searches were run on Commons, then every candidate was looked at. Photographs of temple',
  'exteriors, stone reliefs, festival processions, buildings, a carpet and an archival plate',
  'were deleted along with their manifest rows: a photo of a temple gate does not test a home',
  'mandir scan. Photos with clearly identifiable strangers\' faces were dropped as well.',
  'Provenance for the surviving files was re-derived and accepted only when the downloaded',
  'original was byte-identical to the file kept here.',
  '',
);

await writeFile(path.join(photosDir, 'SOURCES.md'), lines.join('\n'), 'utf8');
console.log(`wrote SOURCES.md for ${files.length} photos (${rows.length} with provenance)`);
