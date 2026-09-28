import fs from 'node:fs/promises';
import path from 'node:path';
import { config, paths } from './config.js';
import { ALL_CANDIDATE_LABELS } from './schema.js';
import { formatInr, formatUsd } from './cost.js';
import { DRY_RUN_MARKER } from './fixture.js';
import type { EvalRecord } from './types.js';
import { PROMPT_VERSION, SCHEMA_VERSION } from './prompt.js';

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(',');
}

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function loadRecords(): Promise<EvalRecord[]> {
  let files: string[];
  try {
    files = await fs.readdir(paths.raw);
  } catch {
    return [];
  }
  const records: EvalRecord[] = [];
  for (const file of files.filter((name) => name.endsWith('.json')).sort()) {
    const text = await fs.readFile(path.join(paths.raw, file), 'utf8');
    records.push(JSON.parse(text) as EvalRecord);
  }
  return records;
}

export async function writeReports(): Promise<void> {
  await fs.mkdir(paths.out, { recursive: true });
  const records = await loadRecords();
  if (records.length === 0) {
    console.log('No results in out/raw — nothing to report.');
    return;
  }

  const isDryRun = records.every((r) => r.source === DRY_RUN_MARKER);
  const hasDryRun = records.some((r) => r.source === DRY_RUN_MARKER);
  const valid = records.filter((r) => r.parsed !== null);
  const latencies = [...records.map((r) => r.latencyMs)].sort((a, b) => a - b);

  const allObjects = valid.flatMap((r) => (r.parsed ? r.parsed.objects.map((o) => ({ photo: r.photo, ...o })) : []));
  const labelCounts = new Map<string, number>();
  for (const obj of allObjects) {
    labelCounts.set(obj.label, (labelCounts.get(obj.label) ?? 0) + 1);
  }
  const outOfCatalog = [...labelCounts.keys()].filter((label) => !ALL_CANDIDATE_LABELS.includes(label));

  const costs = records.map((r) => r.cost).filter((c) => c.measured);
  // Billed usage, summed across attempts, is what a provider actually charges for.
  const promptTokens = records.map((r) => r.billedUsage?.promptTokens ?? 0).filter((n) => n > 0);
  const completionTokens = records.map((r) => r.billedUsage?.completionTokens ?? 0).filter((n) => n > 0);

  const withBox = allObjects.filter((o) => o.bounding_box !== null).length;
  const needsVerification = allObjects.filter((o) => o.verification_required).length;
  const groups = allObjects.filter((o) => o.member_labels !== null && o.member_labels.length > 0).length;
  const unusable = valid.filter((r) => r.parsed && !r.parsed.image_quality.usable).length;
  const notMandir = valid.filter((r) => r.parsed && !r.parsed.image_quality.looks_like_home_mandir).length;
  const retried = records.filter((r) => r.attempts > 1).length;
  const violations = records.flatMap((r) => r.contractViolations);

  const confidenceBuckets = { 'below 0.4': 0, '0.4 to 0.7': 0, '0.7 to 0.9': 0, '0.9 and above': 0 };
  for (const obj of allObjects) {
    if (obj.model_confidence < 0.4) confidenceBuckets['below 0.4'] += 1;
    else if (obj.model_confidence < 0.7) confidenceBuckets['0.4 to 0.7'] += 1;
    else if (obj.model_confidence < 0.9) confidenceBuckets['0.7 to 0.9'] += 1;
    else confidenceBuckets['0.9 and above'] += 1;
  }

  const meanInr = mean(costs.map((c) => c.inr));

  const lines: string[] = [];
  lines.push('# Vision spike results');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Prompt version: ${PROMPT_VERSION}; schema version: ${SCHEMA_VERSION}; response format: ${config.responseFormat}`);
  lines.push('');

  if (hasDryRun) {
    lines.push(
      isDryRun
        ? `> **${DRY_RUN_MARKER}.** Every row below came from a canned fixture. No model was called. These are not measurements of anything and must not be quoted as recognition quality, latency, or cost.`
        : `> **Warning:** this report mixes real results with ${DRY_RUN_MARKER} rows. Delete out/raw and re-run before drawing conclusions.`,
    );
    lines.push('');
  }

  lines.push('## Run');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('|---|---|');
  lines.push(`| Photos processed | ${records.length} |`);
  lines.push(`| Model requested | ${config.model} |`);
  lines.push(`| Upstream models seen | ${[...new Set(records.map((r) => r.upstreamModel ?? 'unknown'))].join(', ')} |`);
  lines.push(`| Providers seen | ${[...new Set(records.map((r) => r.provider ?? 'unknown'))].join(', ')} |`);
  lines.push(`| Response format | ${config.responseFormat} |`);
  lines.push(`| Resize | ${config.resize ? `${config.resizeMaxEdge}px longest edge` : 'off'} |`);
  lines.push('');

  lines.push('## Reliability');
  lines.push('');
  lines.push('| Measure | Value |');
  lines.push('|---|---|');
  lines.push(`| Schema-valid responses | ${valid.length} of ${records.length} |`);
  lines.push(`| Needed more than one attempt | ${retried} |`);
  lines.push(`| Contract violations | ${violations.length} |`);
  lines.push(`| Reported unusable image | ${unusable} |`);
  lines.push(`| Reported not a home mandir | ${notMandir} |`);
  lines.push('');
  if (violations.length > 0) {
    lines.push('Violation detail:');
    lines.push('');
    for (const violation of [...new Set(violations)].slice(0, 40)) {
      lines.push(`- ${violation}`);
    }
    lines.push('');
  }

  lines.push('## Latency');
  lines.push('');
  lines.push('| Measure | Milliseconds |');
  lines.push('|---|---|');
  lines.push(`| Mean | ${Math.round(mean(latencies))} |`);
  lines.push(`| Median | ${percentile(latencies, 0.5)} |`);
  lines.push(`| p95 | ${percentile(latencies, 0.95)} |`);
  lines.push(`| Max | ${latencies.at(-1) ?? 0} |`);
  lines.push('');
  lines.push('Architecture section 15 sets a provisional p95 target of 30 seconds for the vision stage, measured separately from queue wait.');
  lines.push('');

  lines.push('## Measured cost');
  lines.push('');
  lines.push(
    `Rates applied: $${config.usdPerMillionInput}/1M input, $${config.usdPerMillionOutput}/1M output, ` +
      `$${config.usdPerMillionCachedInput}/1M cached input, ${config.creditFeePercent}% credit fee, ₹${config.inrPerUsd}/USD. ` +
      'Override these in .env when rates change.',
  );
  lines.push('');
  lines.push('| Measure | Value |');
  lines.push('|---|---|');
  lines.push(`| Mean billed prompt tokens | ${Math.round(mean(promptTokens))} |`);
  lines.push(`| Mean billed completion tokens | ${Math.round(mean(completionTokens))} |`);
  lines.push(`| Mean cost per scan | ${formatUsd(mean(costs.map((c) => c.usd)))} / ${formatInr(meanInr)} |`);
  lines.push(`| Max cost per scan | ${formatInr(Math.max(0, ...costs.map((c) => c.inr)))} |`);
  lines.push(`| Projected 1,000 scans | ₹${(meanInr * 1000).toFixed(2)} |`);
  lines.push('');
  lines.push(
    'Token counts are summed across every attempt, including responses rejected by schema ' +
      'validation, because a provider bills for those too. If the model emits reasoning tokens ' +
      'they are included in the billed completion count.',
  );
  lines.push('');
  lines.push('This is the vision call only. It excludes fixed infrastructure, storage, egress, and store fees — see docs/decisions.md D-07.');
  lines.push('');

  lines.push('## What was detected');
  lines.push('');
  lines.push('| Measure | Value |');
  lines.push('|---|---|');
  lines.push(`| Total objects | ${allObjects.length} |`);
  lines.push(`| Objects per usable photo | ${valid.length ? (allObjects.length / valid.length).toFixed(1) : '0'} |`);
  lines.push(`| With a bounding box | ${withBox} of ${allObjects.length} |`);
  lines.push(`| Flagged verification_required | ${needsVerification} of ${allObjects.length} |`);
  lines.push(`| Group depictions | ${groups} |`);
  lines.push(`| Distinct labels used | ${labelCounts.size} |`);
  lines.push(`| Labels outside candidate catalog | ${outOfCatalog.length ? outOfCatalog.join(', ') : 'none'} |`);
  lines.push('');
  lines.push('Bounding box availability decides whether the detected-items screen can show overlays at all (architecture section 7).');
  lines.push('');

  lines.push('### Self-reported confidence spread');
  lines.push('');
  lines.push('| Bucket | Objects |');
  lines.push('|---|---|');
  for (const [bucket, count] of Object.entries(confidenceBuckets)) {
    lines.push(`| ${bucket} | ${count} |`);
  }
  lines.push('');
  lines.push('These are raw model numbers. They are not calibrated probabilities and must not gate recommendations until checked against the scored ground truth (PRD section 10).');
  lines.push('');

  lines.push('### Label frequency');
  lines.push('');
  lines.push('| Label | Count |');
  lines.push('|---|---|');
  for (const [label, count] of [...labelCounts.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${label}${ALL_CANDIDATE_LABELS.includes(label) ? '' : ' (off-catalog)'} | ${count} |`);
  }
  lines.push('');

  lines.push('## Still required from you');
  lines.push('');
  lines.push('This harness cannot judge correctness. Only you know what is actually in these photos.');
  lines.push('');
  lines.push('1. Fill in `scoring-sheet.csv` — mark each detected object correct or wrong, and give the real label when wrong.');
  lines.push('2. Fill in `missed-objects.csv` — list objects present in a photo that the model never reported. Without this there is no recall figure.');
  lines.push('3. Only then decide the launch label catalog (P0-06) and the acceptance thresholds (P0-08).');
  lines.push('');

  await fs.writeFile(path.join(paths.out, 'summary.md'), lines.join('\n'), 'utf8');

  const perPhoto = [
    csvRow([
      'photo', 'source', 'schema_valid', 'attempts', 'latency_ms', 'usable', 'looks_like_home_mandir',
      'objects', 'findings', 'billed_prompt_tokens', 'billed_completion_tokens', 'cost_inr',
      'contract_violations', 'image_note',
    ]),
    ...records.map((r) =>
      csvRow([
        r.photo, r.source, r.parsed !== null, r.attempts, r.latencyMs,
        r.parsed?.image_quality.usable ?? '', r.parsed?.image_quality.looks_like_home_mandir ?? '',
        r.parsed?.objects.length ?? '', r.parsed?.visual_findings.length ?? '',
        r.billedUsage?.promptTokens ?? '', r.billedUsage?.completionTokens ?? '',
        r.cost.measured ? r.cost.inr.toFixed(4) : '', r.contractViolations.length, r.image?.note ?? '',
      ]),
    ),
  ];
  await fs.writeFile(path.join(paths.out, 'per-photo.csv'), perPhoto.join('\r\n'), 'utf8');

  const scoring = [
    csvRow([
      'photo', 'observation_id', 'category', 'model_label', 'representation_type', 'group_id',
      'member_labels', 'model_confidence', 'verification_required', 'has_bounding_box',
      'VERDICT_correct_wrong_partial', 'ACTUAL_label', 'NOTES',
    ]),
    ...allObjects.map((o) =>
      csvRow([
        o.photo, o.observation_id, o.category, o.label, o.representation_type, o.group_id ?? '',
        o.member_labels ? o.member_labels.join('|') : '', o.model_confidence, o.verification_required,
        o.bounding_box !== null, '', '', '',
      ]),
    ),
  ];
  await fs.writeFile(path.join(paths.out, 'scoring-sheet.csv'), scoring.join('\r\n'), 'utf8');

  const missed = [
    csvRow(['photo', 'MISSED_label', 'MISSED_representation_type', 'WHY_it_matters', 'NOTES']),
    ...records.map((r) => csvRow([r.photo, '', '', '', ''])),
  ];
  const missedPath = path.join(paths.out, 'missed-objects.csv');
  try {
    await fs.access(missedPath);
    // Never overwrite manual scoring work.
  } catch {
    await fs.writeFile(missedPath, missed.join('\r\n'), 'utf8');
  }

  console.log(`Wrote out/summary.md, out/per-photo.csv, out/scoring-sheet.csv${hasDryRun ? `  (${DRY_RUN_MARKER})` : ''}`);
  if (!isDryRun && costs.length > 0) {
    console.log(`Mean measured cost per scan: ${formatInr(meanInr)}   p95 latency: ${percentile(latencies, 0.95)} ms`);
  }
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  await writeReports();
}
