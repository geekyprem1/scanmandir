import type { PreparedImage } from './image.js';
import type { TokenUsage } from './openrouter.js';
import type { CostBreakdown } from './cost.js';
import type { VisionResponse } from './schema.js';

/** One photo's result, cached as out/raw/<photo>.json so re-runs cost nothing. */
export interface EvalRecord {
  photo: string;
  source: string;
  promptVersion: string;
  schemaVersion: string;
  responseFormat: string;
  model: string;
  upstreamModel: string | null;
  provider: string | null;
  requestedAt: string;
  attempts: number;
  attemptErrors: string[];
  latencyMs: number;
  finishReason: string | null;
  image: Omit<PreparedImage, 'dataUrl'> | null;
  /** Usage of the final attempt only. */
  usage: TokenUsage;
  /**
   * Usage summed across every attempt, including ones that failed schema validation.
   * A provider bills for a rejected response too, so this — not [usage] — is what cost
   * is computed from.
   */
  billedUsage: TokenUsage;
  cost: CostBreakdown;
  rawContent: string;
  parsed: VisionResponse | null;
  schemaErrors: string[];
  contractViolations: string[];
}
