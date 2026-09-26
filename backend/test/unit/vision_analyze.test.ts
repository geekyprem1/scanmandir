import { afterEach, describe, expect, it, vi } from 'vitest';
import { UnusableVisionResponseError, analyzeImage, extractJson } from '../../src/modules/vision/analyze.js';
import {
  OpenRouterVisionProvider,
  VisionCallError,
  type VisionProvider,
} from '../../src/modules/vision/provider.js';

const VALID_RESPONSE = JSON.stringify({
  schema_version: '1',
  image_quality: { usable: true, reasons: [], looks_like_home_mandir: true },
  objects: [
    {
      observation_id: 'obs_001',
      category: 'deity_representation',
      label: 'ganesh',
      representation_type: 'statue',
      group_id: null,
      member_labels: null,
      bounding_box: { x: 0.2, y: 0.3, width: 0.4, height: 0.4 },
      model_confidence: 0.93,
      verification_required: false,
    },
  ],
  visual_findings: [],
});

function openRouterBody(content: string): string {
  return JSON.stringify({
    provider: 'OpenAI',
    model: 'openai/gpt-6-luna',
    choices: [{ message: { content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 2078, completion_tokens: 1230 },
  });
}

function stubFetch(handler: (call: number) => Response | Promise<Response>): { calls: RequestInit[] } {
  const calls: RequestInit[] = [];
  let count = 0;
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    calls.push(init);
    count += 1;
    return handler(count);
  });
  return { calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OpenRouterVisionProvider', () => {
  it('constrains the response and excludes data-collecting providers', async () => {
    const { calls } = stubFetch(() => new Response(openRouterBody(VALID_RESPONSE), { status: 200 }));
    const provider = new OpenRouterVisionProvider({ apiKey: 'test-key' });

    const result = await provider.call('data:image/jpeg;base64,AAAA');

    const body = JSON.parse(String(calls[0]?.body)) as {
      temperature: number;
      response_format: { type: string };
      provider: { data_collection: string };
      messages: unknown[];
    };
    expect(body.temperature).toBe(0);
    // The evaluation measured 20 of 20 valid responses under a constrained schema against
    // 4 of 20 without one, so this is the setting that matters most (D-04).
    expect(body.response_format.type).toBe('json_schema');
    expect(body.provider.data_collection).toBe('deny');
    expect(body.messages).toHaveLength(2);

    expect(result.content).toBe(VALID_RESPONSE);
    expect(result.usage.promptTokens).toBe(2078);
    expect(result.attempts).toBe(1);
    expect(result.provider).toBe('OpenAI');
  });

  it('retries a throttle and succeeds on the next attempt', async () => {
    const { calls } = stubFetch((call) =>
      call === 1
        ? new Response('slow down', { status: 429 })
        : new Response(openRouterBody(VALID_RESPONSE), { status: 200 }),
    );

    const result = await new OpenRouterVisionProvider({ apiKey: 'k' }).call('data:image/jpeg;base64,AA');

    expect(calls).toHaveLength(2);
    expect(result.attempts).toBe(2);
  });

  it('stops at the attempt budget instead of retrying forever', async () => {
    const { calls } = stubFetch(() => new Response('boom', { status: 500 }));

    await expect(
      new OpenRouterVisionProvider({ apiKey: 'k' }).call('data:image/jpeg;base64,AA'),
    ).rejects.toBeInstanceOf(VisionCallError);
    // Default budget is three attempts; the point is that it is bounded, not that it is three.
    expect(calls.length).toBeLessThanOrEqual(3);
  });

  it('does not retry a rejected key', async () => {
    const { calls } = stubFetch(() => new Response('nope', { status: 401 }));

    await expect(
      new OpenRouterVisionProvider({ apiKey: 'bad' }).call('data:image/jpeg;base64,AA'),
    ).rejects.toMatchObject({ retryable: false, status: 401 });
    expect(calls).toHaveLength(1);
  });

  it('refuses to call without a key rather than failing obscurely later', async () => {
    await expect(new OpenRouterVisionProvider({ apiKey: '' }).call('x')).rejects.toMatchObject({
      retryable: false,
    });
  });

  it('treats a body that is not JSON as retryable', async () => {
    stubFetch(() => new Response('<html>gateway</html>', { status: 200 }));

    await expect(
      new OpenRouterVisionProvider({ apiKey: 'k' }).call('data:image/jpeg;base64,AA'),
    ).rejects.toMatchObject({ retryable: true });
  });
});

class FakeProvider implements VisionProvider {
  readonly name = 'fake';
  readonly model = 'fake-model';

  constructor(private readonly content: string) {}

  async call(): Promise<{
    content: string;
    latencyMs: number;
    attempts: number;
    provider: string | null;
    upstreamModel: string | null;
    usage: { promptTokens: number | null; completionTokens: number | null };
  }> {
    return {
      content: this.content,
      latencyMs: 1234,
      attempts: 1,
      provider: 'fake-provider',
      upstreamModel: 'fake-upstream',
      usage: { promptTokens: 10, completionTokens: 20 },
    };
  }
}

describe('analyzeImage', () => {
  it('returns normalized observations with the versions that produced them', async () => {
    const result = await analyzeImage(Buffer.from('photo'), {
      provider: new FakeProvider(VALID_RESPONSE),
    });

    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]?.label).toBe('ganesh');
    expect(result.imageQuality.looks_like_home_mandir).toBe(true);
    expect(result.run.promptVersion).toBeTruthy();
    expect(result.run.schemaVersion).toBe('1');
    expect(result.run.promptTokens).toBe(10);
  });

  it('accepts a response wrapped in a code fence', async () => {
    const result = await analyzeImage(Buffer.from('photo'), {
      provider: new FakeProvider(`\`\`\`json\n${VALID_RESPONSE}\n\`\`\``),
    });

    expect(result.observations).toHaveLength(1);
  });

  it('refuses a response that does not match the schema instead of degrading to an empty result', async () => {
    const missingQuality = JSON.stringify({ schema_version: '1', objects: [] });

    await expect(
      analyzeImage(Buffer.from('photo'), { provider: new FakeProvider(missingQuality) }),
    ).rejects.toBeInstanceOf(UnusableVisionResponseError);
  });

  it('refuses a response that is not JSON at all', async () => {
    await expect(
      analyzeImage(Buffer.from('photo'), { provider: new FakeProvider('I could not do that.') }),
    ).rejects.toBeInstanceOf(UnusableVisionResponseError);
  });

  it('records contract violations without refusing the response', async () => {
    const withViolation = JSON.parse(VALID_RESPONSE) as { objects: { label: string }[] };
    withViolation.objects[0]!.label = 'not_in_catalog';

    const result = await analyzeImage(Buffer.from('photo'), {
      provider: new FakeProvider(JSON.stringify(withViolation)),
    });

    expect(result.contractViolationList.length).toBeGreaterThan(0);
    expect(result.normalization.length).toBeGreaterThan(0);
    expect(result.observations[0]?.label).toBe('unknown_idol');
  });
});

describe('extractJson', () => {
  it('passes plain JSON through and unwraps commentary around it', () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
    expect(extractJson('Here you go:\n{"a":1}\nDone.')).toBe('{"a":1}');
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
});
