import { z } from 'zod';
import { config } from './config.js';
import { SYSTEM_PROMPT, USER_PROMPT } from './prompt.js';
import { VisionResponseSchema } from './schema.js';

export interface TokenUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  cachedPromptTokens: number | null;
  totalTokens: number | null;
}

export interface CallResult {
  content: string;
  usage: TokenUsage;
  latencyMs: number;
  finishReason: string | null;
  provider: string | null;
  upstreamModel: string | null;
}

export class CallError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'CallError';
  }
}

function buildResponseFormat(): unknown {
  if (config.responseFormat === 'json_object') {
    return { type: 'json_object' };
  }
  try {
    return {
      type: 'json_schema',
      json_schema: {
        name: 'mandir_visual_observation',
        strict: false,
        schema: z.toJSONSchema(VisionResponseSchema, { io: 'output' }),
      },
    };
  } catch {
    // Generating the JSON Schema is not worth failing the run over.
    return { type: 'json_object' };
  }
}

export async function callVisionModel(dataUrl: string): Promise<CallResult> {
  if (!config.apiKey) {
    throw new CallError('OPENROUTER_API_KEY is not set. Copy .env.example to .env.', false);
  }

  const body: Record<string, unknown> = {
    model: config.model,
    temperature: 0,
    max_tokens: config.maxOutputTokens,
    response_format: buildResponseFormat(),
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
  };

  if (config.denyDataCollection) {
    // See docs/decisions.md D-08. Unverified against current OpenRouter documentation.
    body.provider = { data_collection: 'deny' };
  }

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'Scan My Mandir vision spike',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new CallError(`network or timeout failure: ${reason}`, true);
  }
  const latencyMs = Date.now() - startedAt;

  const text = await response.text();

  if (!response.ok) {
    // 429 and 5xx are transient; 4xx client errors are not worth retrying.
    const retryable = response.status === 429 || response.status >= 500;
    throw new CallError(
      `HTTP ${response.status}: ${text.slice(0, 500)}`,
      retryable,
      response.status,
    );
  }

  let payload: any;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new CallError(`response body was not JSON: ${text.slice(0, 300)}`, true);
  }

  if (payload?.error) {
    throw new CallError(`provider error: ${JSON.stringify(payload.error).slice(0, 500)}`, false);
  }

  const choice = payload?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== 'string' || content.trim() === '') {
    throw new CallError('response contained no message content', true);
  }

  return {
    content,
    latencyMs,
    finishReason: choice?.finish_reason ?? null,
    provider: payload?.provider ?? null,
    upstreamModel: payload?.model ?? null,
    usage: {
      promptTokens: payload?.usage?.prompt_tokens ?? null,
      completionTokens: payload?.usage?.completion_tokens ?? null,
      cachedPromptTokens: payload?.usage?.prompt_tokens_details?.cached_tokens ?? null,
      totalTokens: payload?.usage?.total_tokens ?? null,
    },
  };
}

/** Strips code fences that models add even when told not to. */
export function extractJson(content: string): string {
  const trimmed = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  if (fenced?.[1]) return fenced[1].trim();

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace > 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}
