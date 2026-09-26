import type { VisionCallResult, VisionProvider } from '../../src/modules/vision/provider.js';

/**
 * A vision provider whose answers the test chooses — including failing ones.
 *
 * The script is mutable so a suite can register the handler once and decide per test what
 * the model "saw", which is the only way to exercise the analysis stage without a vendor.
 */
export class ScriptedVisionProvider implements VisionProvider {
  readonly name = 'scripted';
  readonly model = 'scripted-vision';

  script: () => Promise<string> | string;

  constructor(script: () => Promise<string> | string = () => visionResponse([])) {
    this.script = script;
  }

  async call(): Promise<VisionCallResult> {
    return {
      content: await this.script(),
      latencyMs: 123,
      attempts: 1,
      provider: 'test-provider',
      upstreamModel: 'test-upstream',
      usage: { promptTokens: 100, completionTokens: 50 },
    };
  }
}

export interface VisionObjectOverrides {
  id?: string;
  label?: string;
  category?: string;
  representationType?: string;
  groupId?: string | null;
  memberLabels?: string[] | null;
  box?: { x: number; y: number; width: number; height: number } | null;
  confidence?: number;
  verificationRequired?: boolean;
}

export function visionObject(overrides: VisionObjectOverrides = {}): Record<string, unknown> {
  return {
    observation_id: overrides.id ?? 'obs_001',
    category: overrides.category ?? 'puja_object',
    label: overrides.label ?? 'diya',
    representation_type: overrides.representationType ?? 'physical_object',
    group_id: overrides.groupId ?? null,
    member_labels: overrides.memberLabels ?? null,
    bounding_box: overrides.box === undefined ? { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } : overrides.box,
    model_confidence: overrides.confidence ?? 0.9,
    verification_required: overrides.verificationRequired ?? false,
  };
}

export function visionResponse(
  objects: Record<string, unknown>[],
  quality: { usable?: boolean; reasons?: string[]; looksLikeHome?: boolean } = {},
): string {
  return JSON.stringify({
    schema_version: '1',
    image_quality: {
      usable: quality.usable ?? true,
      reasons: quality.reasons ?? [],
      looks_like_home_mandir: quality.looksLikeHome ?? true,
    },
    objects,
    visual_findings: [],
  });
}
