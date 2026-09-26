import fs from 'node:fs/promises';
import path from 'node:path';
import { config, paths, SUPPORTED_IMAGE_EXTENSIONS } from './config.js';
import { prepareImage, type PreparedImage } from './image.js';
import { callVisionModel, CallError, extractJson, type CallResult, type TokenUsage } from './openrouter.js';
import { VisionResponseSchema, contractViolations, type VisionResponse } from './schema.js';
import { computeCost } from './cost.js';
import { dryRunResult, DRY_RUN_MARKER } from './fixture.js';
import { writeReports } from './report.js';
import type { EvalRecord } from './types.js';

interface Options {
  dryRun: boolean;
  force: boolean;
  only: string | null;
}

function parseArgs(argv: string[]): Options {
  const only = argv.find((a) => a.startsWith('--only='))?.slice('--only='.length) ?? null;
  return {
    dryRun: argv.includes('--dry-run'),
    force: argv.includes('--force'),
    only,
  };
}

function slug(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '_');
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Sums usage across attempts. A provider bills for a rejected response too. */
function addUsage(total: TokenUsage, next: TokenUsage): TokenUsage {
  const add = (a: number | null, b: number | null): number | null =>
    a === null && b === null ? null : (a ?? 0) + (b ?? 0);
  return {
    promptTokens: add(total.promptTokens, next.promptTokens),
    completionTokens: add(total.completionTokens, next.completionTokens),
    cachedPromptTokens: add(total.cachedPromptTokens, next.cachedPromptTokens),
    totalTokens: add(total.totalTokens, next.totalTokens),
  };
}

const EMPTY_USAGE: TokenUsage = {
  promptTokens: null,
  completionTokens: null,
  cachedPromptTokens: null,
  totalTokens: null,
};

async function listPhotos(only: string | null): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(paths.photos);
  } catch {
    return [];
  }
  const allowed = SUPPORTED_IMAGE_EXTENSIONS as readonly string[];
  return entries
    .filter((name) => allowed.includes(path.extname(name).toLowerCase()))
    .filter((name) => (only ? name.toLowerCase().includes(only.toLowerCase()) : true))
    .sort();
}

/** Bounded retry over transient failures and schema-invalid responses, per ARCHITECTURE.md section 7. */
async function attemptCall(
  dataUrl: string | null,
  dryRun: boolean,
): Promise<{
  result: CallResult;
  attempts: number;
  errors: string[];
  parsed: VisionResponse | null;
  schemaErrors: string[];
  billedUsage: TokenUsage;
}> {
  const errors: string[] = [];
  let lastResult: CallResult | null = null;
  let lastSchemaErrors: string[] = [];
  let billedUsage: TokenUsage = EMPTY_USAGE;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    let result: CallResult;
    try {
      result = dryRun || dataUrl === null ? dryRunResult() : await callVisionModel(dataUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`attempt ${attempt}: ${message}`);
      const retryable = error instanceof CallError ? error.retryable : false;
      if (!retryable || attempt === config.maxAttempts) {
        throw error;
      }
      await sleep(Math.min(8000, 500 * 2 ** (attempt - 1)) + Math.random() * 250);
      continue;
    }

    lastResult = result;
    billedUsage = addUsage(billedUsage, result.usage);

    const validation = VisionResponseSchema.safeParse(safeJsonParse(extractJson(result.content)));
    if (validation.success) {
      return {
        result,
        attempts: attempt,
        errors,
        parsed: validation.data,
        schemaErrors: [],
        billedUsage,
      };
    }

    lastSchemaErrors = validation.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    errors.push(`attempt ${attempt}: schema invalid — ${lastSchemaErrors.slice(0, 3).join('; ')}`);

    if (attempt === config.maxAttempts) break;
    await sleep(Math.min(8000, 500 * 2 ** (attempt - 1)) + Math.random() * 250);
  }

  if (!lastResult) throw new CallError('no response captured', false);
  return {
    result: lastResult,
    attempts: config.maxAttempts,
    errors,
    parsed: null,
    schemaErrors: lastSchemaErrors,
    billedUsage,
  };
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  await fs.mkdir(paths.raw, { recursive: true });

  let photos = await listPhotos(options.only);
  let synthetic = false;

  if (photos.length === 0) {
    if (!options.dryRun) {
      console.error(
        [
          'No photos found.',
          `Put 20-30 mandir photos (.jpg/.jpeg/.png/.webp) in: ${paths.photos}`,
          'Only use photos you own or have permission to use.',
          'To verify the pipeline without photos, run: npm run eval:dry',
        ].join('\n'),
      );
      process.exitCode = 1;
      return;
    }
    synthetic = true;
    photos = ['synthetic_001.jpg', 'synthetic_002.jpg', 'synthetic_003.jpg'];
    console.log('No photos present. Dry run using synthetic names to exercise the pipeline.\n');
  }

  if (options.dryRun) {
    console.log(`DRY RUN — no API calls. Output is ${DRY_RUN_MARKER}, not a measurement.\n`);
  } else {
    console.log(`Model: ${config.model}   photos: ${photos.length}   resize: ${config.resize ? `${config.resizeMaxEdge}px` : 'off'}`);
    console.log(`Provider data_collection deny: ${config.denyDataCollection}\n`);
  }

  for (const [index, photo] of photos.entries()) {
    const target = path.join(paths.raw, `${slug(photo)}.json`);
    const position = `[${index + 1}/${photos.length}]`;

    if (!options.force) {
      try {
        await fs.access(target);
        console.log(`${position} ${photo} — cached, skipping`);
        continue;
      } catch {
        // not cached, continue
      }
    }

    let image: PreparedImage | null = null;
    if (!synthetic) {
      try {
        image = await prepareImage(path.join(paths.photos, photo));
      } catch (error) {
        console.log(`${position} ${photo} — could not read image: ${String(error)}`);
        continue;
      }
    }

    try {
      const { result, attempts, errors, parsed, schemaErrors, billedUsage } = await attemptCall(
        image?.dataUrl ?? null,
        options.dryRun,
      );

      const record: EvalRecord = {
        photo,
        source: options.dryRun ? DRY_RUN_MARKER : 'openrouter',
        model: config.model,
        upstreamModel: result.upstreamModel,
        provider: result.provider,
        requestedAt: new Date().toISOString(),
        attempts,
        attemptErrors: errors,
        latencyMs: result.latencyMs,
        finishReason: result.finishReason,
        image: image
          ? {
              byteLength: image.byteLength,
              width: image.width,
              height: image.height,
              resized: image.resized,
              note: image.note,
            }
          : null,
        usage: result.usage,
        billedUsage,
        cost: computeCost(billedUsage),
        rawContent: result.content,
        parsed,
        schemaErrors,
        contractViolations: parsed ? contractViolations(parsed) : [],
      };

      await fs.writeFile(target, JSON.stringify(record, null, 2), 'utf8');

      const objects = parsed?.objects.length ?? 0;
      const status = parsed ? `${objects} objects` : `SCHEMA INVALID (${schemaErrors.length} issues)`;
      const violations = record.contractViolations.length;
      console.log(
        `${position} ${photo} — ${status}, ${result.latencyMs} ms, attempts ${attempts}` +
          (violations ? `, ${violations} contract violations` : ''),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`${position} ${photo} — FAILED: ${message}`);
      if (error instanceof CallError && !error.retryable && error.status === undefined) {
        // Configuration problem rather than a per-photo problem; stop early.
        process.exitCode = 1;
        return;
      }
    }
  }

  console.log('');
  await writeReports();
}

await main();
