import { PROMPT_VERSION, SCHEMA_VERSION } from './prompt.js';
import {
  VisionResponseSchema,
  contractViolations,
  normalizeAnalysis,
  type ImageQuality,
  type Observation,
  type VisionResponse,
  type VisualFinding,
} from './schema.js';
import { VisionCallError, type VisionProvider } from './provider.js';

export interface AnalysisRun {
  model: string;
  provider: string | null;
  upstreamModel: string | null;
  promptVersion: string;
  schemaVersion: string;
  latencyMs: number;
  attempts: number;
  promptTokens: number | null;
  completionTokens: number | null;
}

export interface AnalysisResult {
  imageQuality: ImageQuality;
  observations: Observation[];
  findings: VisualFinding[];
  /** Every change normalization had to make (TASKS P5-03). */
  normalization: string[];
  /** Rules the response broke without being changed, counted per run. */
  contractViolationList: string[];
  response: VisionResponse;
  run: AnalysisRun;
}

/**
 * Raised when a response arrived but cannot be used. Retryable, because the next attempt
 * is a fresh sample and the first evaluation showed a model can return a valid response on
 * a second try — and because the job's attempt budget is what bounds the cost.
 */
export class UnusableVisionResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnusableVisionResponseError';
  }
}

/** Strips code fences a model adds even when told not to. */
export function extractJson(content: string): string {
  const trimmed = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  if (fenced?.[1]) return fenced[1].trim();

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

/**
 * One image in, observations out (ARCHITECTURE.md section 7).
 *
 * The provider is injected so the evaluator, the tests and production can differ without
 * touching this function. What it guarantees: nothing reaches storage that has not passed
 * the schema, every deviation is recorded rather than hidden, and a response that cannot
 * be used raises instead of degrading into a plausible-looking empty result.
 */
export async function analyzeImage(
  bytes: Buffer,
  options: { provider: VisionProvider; contentType?: string },
): Promise<AnalysisResult> {
  const contentType = options.contentType ?? 'image/jpeg';
  const dataUrl = `data:${contentType};base64,${bytes.toString('base64')}`;

  const call = await options.provider.call(dataUrl);

  let decoded: unknown;
  try {
    decoded = JSON.parse(extractJson(call.content));
  } catch {
    throw new UnusableVisionResponseError(`vision response was not JSON: ${call.content.slice(0, 200)}`);
  }

  const parsed = VisionResponseSchema.safeParse(decoded);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new UnusableVisionResponseError(`vision response did not match the schema: ${issues}`);
  }

  const normalized = normalizeAnalysis(parsed.data);

  return {
    imageQuality: normalized.imageQuality,
    observations: normalized.observations,
    findings: normalized.findings,
    normalization: normalized.normalization,
    contractViolationList: contractViolations(parsed.data),
    response: parsed.data,
    run: {
      model: options.provider.model,
      provider: call.provider,
      upstreamModel: call.upstreamModel,
      promptVersion: PROMPT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      latencyMs: call.latencyMs,
      attempts: call.attempts,
      promptTokens: call.usage.promptTokens,
      completionTokens: call.usage.completionTokens,
    },
  };
}

export { VisionCallError };
