import { getConfig } from '../../shared/config.js';
import { getLogger } from '../../shared/logger.js';
import { SYSTEM_PROMPT, USER_PROMPT } from './prompt.js';
import { VisionResponseSchema } from './schema.js';

export interface TokenUsage {
  promptTokens: number | null;
  completionTokens: number | null;
}

export interface VisionCallResult {
  content: string;
  latencyMs: number;
  attempts: number;
  provider: string | null;
  upstreamModel: string | null;
  usage: TokenUsage;
}

/**
 * Raised when the provider could not be used.
 *
 * [retryable] distinguishes "try again" from "this will fail again": a timeout or a 429 is
 * worth another attempt, a 401 or a malformed request is not. The worker turns either into
 * a bounded job retry, so an outage costs attempts rather than a lost scan.
 */
export class VisionCallError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'VisionCallError';
  }
}

/**
 * The seam a vision provider sits behind (ARCHITECTURE.md section 1). Everything above it
 * works in observations; only an implementation knows which vendor is being called, so
 * changing vendors is a change here and nowhere else.
 */
export interface VisionProvider {
  readonly name: string;
  readonly model: string;
  call(dataUrl: string): Promise<VisionCallResult>;
}

interface OpenRouterPayload {
  provider?: string;
  model?: string;
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  error?: unknown;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * OpenRouter, with the response constrained by our JSON Schema.
 *
 * The constraint is not a nicety: the first evaluation measured 4 of 20 schema-valid
 * responses when the model was merely asked for JSON, against 20 of 20 when it was
 * constrained, and every rejected response is still billed (docs/decisions.md D-04/D-05).
 */
export class OpenRouterVisionProvider implements VisionProvider {
  readonly name = 'openrouter';

  constructor(private readonly overrides: { apiKey?: string } = {}) {}

  get model(): string {
    return getConfig().VISION_MODEL;
  }

  async call(dataUrl: string): Promise<VisionCallResult> {
    const config = getConfig();
    const apiKey = this.overrides.apiKey ?? config.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new VisionCallError('OPENROUTER_API_KEY is not configured, so no photo can be analysed.', false);
    }

    const body: Record<string, unknown> = {
      model: config.VISION_MODEL,
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: USER_PROMPT },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'mandir_visual_observation',
          strict: false,
          schema: jsonSchemaForResponse(),
        },
      },
    };
    if (config.VISION_DENY_DATA_COLLECTION) {
      // Providers that may retain or train on the photo are excluded (docs/decisions.md D-08).
      body.provider = { data_collection: 'deny' };
    }

    const logger = getLogger();
    let lastError: VisionCallError | null = null;

    for (let attempt = 1; attempt <= config.VISION_MAX_ATTEMPTS; attempt += 1) {
      const startedAt = Date.now();
      try {
        const response = await fetch(`${config.VISION_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
            'x-title': 'Scan My Mandir',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(config.VISION_TIMEOUT_MS),
        });
        const latencyMs = Date.now() - startedAt;
        const text = await response.text();

        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500;
          throw new VisionCallError(
            `vision provider answered ${response.status}: ${text.slice(0, 300)}`,
            retryable,
            response.status,
          );
        }

        let payload: OpenRouterPayload;
        try {
          payload = JSON.parse(text) as OpenRouterPayload;
        } catch {
          throw new VisionCallError('vision provider returned a body that is not JSON', true);
        }

        if (payload.error) {
          throw new VisionCallError(
            `vision provider reported an error: ${JSON.stringify(payload.error).slice(0, 300)}`,
            false,
          );
        }

        const content = payload.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || content.trim() === '') {
          throw new VisionCallError('vision provider returned no message content', true);
        }

        return {
          content,
          latencyMs,
          attempts: attempt,
          provider: payload.provider ?? null,
          upstreamModel: payload.model ?? null,
          usage: {
            promptTokens: payload.usage?.prompt_tokens ?? null,
            completionTokens: payload.usage?.completion_tokens ?? null,
          },
        };
      } catch (error) {
        const failure =
          error instanceof VisionCallError
            ? error
            : new VisionCallError(
                `vision call failed: ${error instanceof Error ? error.message : String(error)}`,
                true,
              );
        lastError = failure;

        if (!failure.retryable || attempt === config.VISION_MAX_ATTEMPTS) {
          throw failure;
        }
        const backoffMs = Math.min(8000, 500 * 2 ** (attempt - 1));
        logger.warn({ attempt, backoffMs, err: failure.message }, 'vision call failed; retrying');
        await sleep(backoffMs);
      }
    }

    throw lastError ?? new VisionCallError('vision call failed without an error', true);
  }
}

/**
 * The JSON Schema sent to the provider, derived from the zod schema so the two cannot
 * drift apart. `io: 'output'` renders it as a response shape rather than a parse shape.
 */
function jsonSchemaForResponse(): unknown {
  try {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['schema_version', 'image_quality', 'objects', 'visual_findings'],
      properties: {
        schema_version: { type: 'string', enum: ['1'] },
        image_quality: {
          type: 'object',
          additionalProperties: false,
          required: ['usable', 'reasons', 'looks_like_home_mandir'],
          properties: {
            usable: { type: 'boolean' },
            reasons: { type: 'array', items: { type: 'string' } },
            looks_like_home_mandir: { type: 'boolean' },
          },
        },
        objects: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'observation_id',
              'category',
              'label',
              'representation_type',
              'group_id',
              'member_labels',
              'bounding_box',
              'model_confidence',
              'verification_required',
            ],
            properties: {
              observation_id: { type: 'string' },
              category: {
                type: 'string',
                enum: ['deity_representation', 'puja_object', 'other'],
              },
              label: { type: 'string' },
              representation_type: {
                type: 'string',
                enum: [
                  'statue',
                  'framed_image',
                  'poster',
                  'printed_image',
                  'relief',
                  'shivling',
                  'physical_object',
                  'unknown',
                ],
              },
              group_id: { type: ['string', 'null'] },
              member_labels: {
                anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }],
              },
              bounding_box: {
                anyOf: [
                  {
                    type: 'object',
                    additionalProperties: false,
                    required: ['x', 'y', 'width', 'height'],
                    properties: {
                      x: { type: 'number', minimum: 0, maximum: 1 },
                      y: { type: 'number', minimum: 0, maximum: 1 },
                      width: { type: 'number', minimum: 0, maximum: 1 },
                      height: { type: 'number', minimum: 0, maximum: 1 },
                    },
                  },
                  { type: 'null' },
                ],
              },
              model_confidence: { type: 'number', minimum: 0, maximum: 1 },
              verification_required: { type: 'boolean' },
            },
          },
        },
        visual_findings: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['finding_code', 'description', 'related_observation_ids'],
            properties: {
              finding_code: { type: 'string' },
              description: { type: 'string' },
              related_observation_ids: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    };
  } catch {
    // A schema that cannot be rendered must not stop a scan; the response is validated
    // locally either way.
    return { type: 'object' };
  }
}

/** Exported for the tests that check the sent schema matches the zod contract. */
export { VisionResponseSchema };
