import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

export const paths = {
  root: path.resolve(here, '..'),
  photos: path.resolve(here, '..', 'photos'),
  out: path.resolve(here, '..', 'out'),
  raw: path.resolve(here, '..', 'out', 'raw'),
};

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${name} must be a number, got: ${raw}`);
  }
  return parsed;
}

/**
 * Rates are defaults recorded in docs/decisions.md entry D-05 as of 26 September 2026.
 * GPT-6 Luna launched 22 September and its price was cut on 23 September, so these
 * move. Override them in .env rather than editing this file, and re-check the
 * OpenRouter model page before trusting any cost figure produced by this harness.
 */
export const config = {
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  baseUrl: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
  model: process.env.MODEL ?? 'openai/gpt-6-luna',

  /** 'json_object' measures real-world malformed-output rate. 'json_schema' constrains the model instead. */
  responseFormat: (process.env.RESPONSE_FORMAT ?? 'json_object') as 'json_object' | 'json_schema',

  /**
   * Excludes providers that may retain or train on submitted data.
   * See docs/decisions.md D-08 — this is an unverified default, not a guarantee.
   * Confirm against current OpenRouter provider-routing documentation before
   * sending any photo you do not own.
   */
  denyDataCollection: (process.env.DENY_DATA_COLLECTION ?? 'true') !== 'false',

  /** Bounded retry budget, per ARCHITECTURE.md section 7. */
  maxAttempts: num('MAX_ATTEMPTS', 3),
  requestTimeoutMs: num('REQUEST_TIMEOUT_MS', 90_000),
  maxOutputTokens: num('MAX_OUTPUT_TOKENS', 4_000),

  /** Matches the normalized derivative described in ARCHITECTURE.md section 6. */
  resizeMaxEdge: num('RESIZE_MAX_EDGE', 1024),
  resize: (process.env.RESIZE ?? 'true') !== 'false',

  usdPerMillionInput: num('USD_PER_MILLION_INPUT', 0.1),
  usdPerMillionOutput: num('USD_PER_MILLION_OUTPUT', 0.5),
  usdPerMillionCachedInput: num('USD_PER_MILLION_CACHED_INPUT', 0.01),
  /** OpenRouter charges a fee on credit top-ups rather than a per-token markup. */
  creditFeePercent: num('CREDIT_FEE_PERCENT', 5.5),
  inrPerUsd: num('INR_PER_USD', 95.9),
} as const;

export const SUPPORTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const;
