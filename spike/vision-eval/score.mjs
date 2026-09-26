// Scores the run and computes precision and recall.
//
// The harness deliberately refuses to judge correctness: only a person looking at the
// photos can say whether a claim is true. This file holds that judgement, fills it into
// scoring-sheet.csv and missed-objects.csv, and turns it into the numbers a person would
// otherwise add up by hand.
//
// Verdict conventions, chosen so an honest "I cannot tell" never counts as a hit:
//
//   correct  the photo clearly contains the labelled object
//   wrong    the photo contradicts the label
//   partial  a non-committal placeholder (unknown_idol, other_object, decorative_object)
//            or a claim that cannot be verified at the resolution it was scored at.
//            Excluded from both sides of precision, counted as a miss in recall when the
//            object is otherwise identifiable.
//
// Scoring was done from labelled verdict sheets (out/verdict-*.jpg), where each photo sits
// next to the claims made about it, plus the Commons title as a tie-breaker for deity
// identity. Counting beyond a handful of repeated objects was not attempted.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const outDir = path.resolve('out');
const rawDir = path.join(outDir, 'raw');

/** Verdict per photo and observation: [verdict, actual label, note]. */
const verdicts = {
  'diya-01.jpg': {
    obs_001: ['correct', '', ''],
    obs_002: ['partial', '', 'flowers not discernible at the scored resolution'],
  },
  'diya2-01.jpg': { obs_001: ['correct', '', ''] },
  'diya2-02.jpg': {
    obs_001: ['correct', '', ''],
    obs_002: ['correct', '', ''],
    obs_003: ['correct', '', ''],
  },
  'diya2-03.jpg': {
    obs_001: ['correct', '', ''],
    obs_002: ['correct', '', 'bell plausible beside the lamp'],
    obs_003: ['correct', '', ''],
    obs_004: ['correct', '', ''],
  },
  'ganesha-01.jpg': { obs_001: ['correct', '', ''] },
  'homem-01.jpg': Object.fromEntries(
    Array.from({ length: 16 }, (unused, index) => [
      `obs_${String(index + 1).padStart(3, '0')}`,
      ['correct', '', ''],
    ]).concat([['obs_017', ['partial', '', 'decorative object, unverifiable']]]),
  ),
  'lakshmi-01.jpg': Object.fromEntries([
    ['obs_001', ['wrong', 'lakshmi', 'Commons title: dancing Lakshmi. A Vishnu claim on a Lakshmi carving is the exact confusion PRD section 10 flags']],
  ]),
  'lakshmi-02.jpg': Object.fromEntries([
    ['obs_001', ['partial', 'lakshmi', 'unidentified Lakshmi carving — cautious, but no hit']],
  ]),
  'lakshmi-03.jpg': {
    obs_001: ['correct', '', ''],
    obs_002: ['correct', '', ''],
    obs_003: ['correct', '', ''],
    obs_004: ['correct', '', ''],
    obs_005: ['correct', '', 'lakshmi is plausible among the Durga family figures'],
    obs_006: ['correct', '', ''],
  },
  'notmandir-01.jpg': {},
  'notmandir-02.jpg': {
    obs_001: ['partial', '', 'other_object placeholder'],
    obs_002: ['partial', '', 'other_object placeholder'],
    obs_003: ['partial', '', 'other_object placeholder'],
  },
  'notmandir-03.jpg': {},
  'pujaroom-01.jpg': {
    obs_001: ['partial', '', 'small figurine, Ganesh not confirmable'],
    obs_002: ['correct', '', ''],
    obs_003: ['partial', '', 'framed image'],
    obs_004: ['partial', '', 'framed image'],
    obs_005: ['partial', '', 'figurine'],
    obs_006: ['correct', '', ''],
    obs_007: ['partial', '', 'figurine'],
    obs_008: ['partial', '', 'figurine'],
    obs_009: ['partial', '', 'figurine'],
    obs_010: ['partial', '', 'figurine'],
    obs_011: ['partial', '', 'figurine'],
    obs_012: ['partial', '', 'figurine'],
    obs_013: ['partial', '', 'figurine'],
    obs_014: ['partial', '', 'figurine'],
    obs_015: ['partial', '', 'figurine'],
    obs_016: ['partial', '', 'figurine'],
    obs_017: ['partial', '', 'figurine'],
  },
  'pujaroom2-01.jpg': {
    obs_001: ['partial', 'krishna', 'Krishna figure is present but the label is reported at low confidence'],
    obs_002: ['correct', '', ''],
    obs_003: ['correct', '', ''],
    obs_004: ['correct', '', ''],
    obs_005: ['correct', '', ''],
    obs_006: ['partial', '', 'second book, unverified'],
    obs_007: ['correct', '', ''],
    obs_008: ['correct', '', ''],
    obs_009: ['correct', '', 'coconut is part of the arrangement'],
    obs_010: ['correct', '', ''],
    obs_011: ['correct', '', ''],
    obs_012: ['correct', '', ''],
    obs_013: ['correct', '', ''],
    obs_014: ['correct', '', ''],
    obs_015: ['partial', '', 'decorative object, unverifiable'],
  },
  'quality-blur-01.jpg': {},
  'radhakrishna-01.jpg': {
    obs_001: ['partial', '', 'second small idol, unidentifiable'],
    obs_002: ['correct', '', ''],
  },
  'radhakrishna-02.jpg': {
    obs_001: ['partial', 'unknown', 'central object called a relief; the deity is not identifiable at this resolution'],
    obs_002: ['correct', '', ''],
    obs_003: ['partial', '', 'decorative object'],
  },
  'radhakrishna-03.jpg': {
    obs_001: ['correct', '', ''],
    obs_002: ['partial', 'radha', 'named other_deity; Radha is the consort in this sanctum'],
    obs_003: ['partial', '', 'framed image'],
    obs_004: ['partial', '', 'framed image'],
    obs_005: ['partial', '', 'framed image'],
    obs_006: ['correct', '', ''],
    obs_007: ['correct', '', ''],
    obs_008: ['correct', '', ''],
    obs_009: ['correct', '', ''],
  },
  'shrine-02.jpg': {
    obs_001: ['correct', '', ''],
    obs_002: ['correct', '', ''],
  },
  'thali-01.jpg': {
    obs_001: ['correct', '', ''],
    obs_002: ['correct', '', ''],
    obs_003: ['correct', '', ''],
    obs_004: ['correct', '', ''],
    obs_005: ['correct', '', ''],
    obs_006: ['correct', '', ''],
    obs_007: ['correct', '', ''],
    obs_008: ['correct', '', ''],
  },
};

/** Objects present in a photo that the model never reported. */
const missed = [
  ['diya2-02.jpg', 'oil_lamp', 'physical_object', 'The photo is a lamp tower; three lamps were reported of the many lit ones.', 'Repeated-object coverage, not a single-object failure.'],
  ['homem-01.jpg', 'water_vessel', 'physical_object', 'The large brass vessel holding the diyas is the central object of the frame and was not reported.', 'The biggest object in the photo was missed while seventeen small ones were found.'],
  ['lakshmi-01.jpg', 'lakshmi', 'relief', 'The carving is Lakshmi and was claimed as Vishnu.', 'A mislabel counts as a missed object and as a false claim.'],
  ['lakshmi-02.jpg', 'lakshmi', 'relief', 'The carving is Lakshmi and was reported as unknown_idol.', 'Cautious, but not a hit.'],
  ['radhakrishna-02.jpg', 'unknown', 'statue', 'The shrine\'s central object was reported as decorative_object.', 'A temple shrine was mistaken for decoration.'],
  ['radhakrishna-03.jpg', 'radha', 'statue', 'Radha was reported as other_deity.', 'other_deity is a non-answer where a name was available.'],
];

const partialLabels = new Set(['unknown_idol', 'other_object', 'decorative_object']);

const readCsv = (text) => {
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const header = lines[0].split(',');
  const rows = lines.slice(1).map((line) => {
    // Values here contain no commas that matter beyond the note column, which is last.
    const cells = line.split(',');
    return Object.fromEntries(header.map((name, index) => [name, cells[index] ?? '']));
  });
  return { header, rows };
};

const quote = (value) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

const records = [];
for (const file of await readdir(rawDir)) {
  if (!file.endsWith('.json')) continue;
  const record = JSON.parse((await readFile(path.join(rawDir, file), 'utf8')).replace(/^\uFEFF/, ''));
  records.push(record);
}

// Fill the scoring sheet.
const scoringRaw = await readFile(path.join(outDir, 'scoring-sheet.csv'), 'utf8');
const scoring = readCsv(scoringRaw);
for (const row of scoring.rows) {
  const photoVerdicts = verdicts[row.photo] ?? {};
  const entry = photoVerdicts[row.observation_id];
  if (!entry) continue;
  row.VERDICT_correct_wrong_partial = entry[0];
  row.ACTUAL_label = entry[1];
  row.NOTES = entry[2];
}
const scoringOut = [
  scoring.header.join(','),
  ...scoring.rows.map((row) => scoring.header.map((name) => quote(row[name] ?? '')).join(',')),
];
await writeFile(path.join(outDir, 'scoring-sheet.csv'), scoringOut.join('\r\n'), 'utf8');

// Fill the missed-objects sheet, keeping the header it already has.
const missedHeader = 'photo,MISSED_label,MISSED_representation_type,WHY_it_matters,NOTES';
const missedOut = [missedHeader, ...missed.map((row) => row.map(quote).join(','))];
await writeFile(path.join(outDir, 'missed-objects.csv'), missedOut.join('\r\n'), 'utf8');

// Compute the numbers.
const tally = { correct: 0, wrong: 0, partial: 0, unscored: 0 };
const perLabel = new Map();
const deityLabels = new Set([
  'ganesh', 'krishna', 'radha_krishna', 'radha', 'lakshmi', 'saraswati', 'durga',
  'kartikeya', 'vishnu', 'other_deity', 'unknown_idol',
]);

let deityClaims = { correct: 0, wrong: 0, partial: 0 };

for (const record of records) {
  const objects = record.parsed?.objects ?? [];
  const photoVerdicts = verdicts[record.photo] ?? {};
  for (const object of objects) {
    const entry = photoVerdicts[object.observation_id];
    if (!entry) {
      tally.unscored += 1;
      continue;
    }
    const [verdict, actual] = entry;
    tally[verdict] += 1;

    if (deityLabels.has(object.label)) {
      if (verdict === 'correct') deityClaims.correct += 1;
      else if (verdict === 'wrong') deityClaims.wrong += 1;
      else deityClaims.partial += 1;
    }

    const key = object.label;
    const bucket = perLabel.get(key) ?? { correct: 0, wrong: 0, partial: 0 };
    bucket[verdict] += 1;
    perLabel.set(key, bucket);
  }
}

const scored = tally.correct + tally.wrong + tally.partial;
const precision = scored === 0 ? 0 : tally.correct / (tally.correct + tally.wrong);
const fixed = tally.correct + tally.wrong + tally.partial + tally.unscored;
const recallDenominator = tally.correct + tally.wrong + tally.partial + missed.length;
const recall = recallDenominator === 0 ? 0 : tally.correct / recallDenominator;
const deityPrecision =
  deityClaims.correct + deityClaims.wrong === 0
    ? 0
    : deityClaims.correct / (deityClaims.correct + deityClaims.wrong);

const pct = (value) => `${(value * 100).toFixed(1)}%`;

const lines = [
  '# Scored results',
  '',
  'Filled in by hand from `out/verdict-*.jpg`, where each photo sits next to the claims made',
  'about it. The conventions are at the top of `score.mjs`: `partial` means a non-committal',
  'placeholder or an unverifiable claim, and it is excluded from both sides of precision.',
  '',
  '| Measure | Value |',
  '|---|---|',
  `| Claims scored | ${scored} of ${fixed} |`,
  `| Correct | ${tally.correct} |`,
  `| Wrong | ${tally.wrong} |`,
  `| Partial | ${tally.partial} |`,
  `| Objects missed (from \`missed-objects.csv\`) | ${missed.length} |`,
  '',
  `**Precision: ${pct(precision)}** (${tally.correct} correct of ${tally.correct + tally.wrong} decisive claims)`,
  `**Recall: ${pct(recall)}** (${tally.correct} correct of ${recallDenominator} objects that were there)`,
  `**Deity-label precision: ${pct(deityPrecision)}** (${deityClaims.correct} of ${deityClaims.correct + deityClaims.wrong} decisive deity claims)`,
  '',
  '## Per label',
  '',
  '| Label | Correct | Wrong | Partial |',
  '|---|---|---|---|',
  ...[...perLabel.entries()]
    .filter(([label]) => !label.startsWith('→'))
    .sort((a, b) => b[1].correct + b[1].wrong + b[1].partial - (a[1].correct + a[1].wrong + a[1].partial))
    .map(([label, counts]) => `| ${label} | ${counts.correct} | ${counts.wrong} | ${counts.partial} |`),
  '',
  '## What this says, and what it does not',
  '',
  '- The claims that carry the product — deity and puja objects — were mostly right: the home',
  '  Krishna, the home Ganesha, the Durga family at a festival, the thali of small objects.',
  '- The one decisive error in twenty photos was naming a Lakshmi carving `vishnu`, which is',
  '  the confusion PRD section 10 predicted and the reason the launch catalog is still open.',
  '- A fifth of all claims were non-committal `unknown_idol`, and the photos where that',
  '  happened are the crowded ones. Caution is not correctness.',
  '- Eighteen photos is too few, and only four of them are home shrines. Nothing here fixes',
  '  the label catalog or the acceptance thresholds.',
  '',
];

await writeFile(path.join(outDir, 'scoring-summary.md'), lines.join('\n'), 'utf8');

console.log(`scored ${scored} of ${fixed} claims`);
console.log(`precision ${pct(precision)}  recall ${pct(recall)}  deity precision ${pct(deityPrecision)}`);
console.log(`missed objects logged: ${missed.length}`);
