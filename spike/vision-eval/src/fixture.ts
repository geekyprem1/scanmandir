import type { CallResult } from './openrouter.js';

/**
 * Dry-run fixture. Exists only so the pipeline — image preparation, validation,
 * caching, cost arithmetic, reporting — can be exercised without an API key or photos.
 *
 * Every artifact produced from this is stamped source: "DRY_RUN_FIXTURE". It is never
 * a measurement of any model and must never be reported as one.
 */
export const DRY_RUN_MARKER = 'DRY_RUN_FIXTURE';

const FIXTURE_BODY = {
  schema_version: '1',
  image_quality: {
    usable: true,
    reasons: [],
    looks_like_home_mandir: true,
  },
  objects: [
    {
      observation_id: 'obs_001',
      category: 'deity_representation',
      label: 'ganesh',
      representation_type: 'statue',
      group_id: null,
      member_labels: null,
      bounding_box: { x: 0.31, y: 0.22, width: 0.18, height: 0.29 },
      model_confidence: 0.86,
      verification_required: false,
    },
    {
      observation_id: 'obs_002',
      category: 'deity_representation',
      label: 'unknown_idol',
      representation_type: 'statue',
      group_id: null,
      member_labels: null,
      bounding_box: { x: 0.54, y: 0.26, width: 0.14, height: 0.24 },
      model_confidence: 0.36,
      verification_required: true,
    },
    {
      observation_id: 'obs_003',
      category: 'deity_representation',
      label: 'ram_darbar',
      representation_type: 'framed_image',
      group_id: 'grp_001',
      member_labels: ['ram', 'sita', 'lakshman', 'hanuman'],
      bounding_box: { x: 0.08, y: 0.1, width: 0.2, height: 0.3 },
      model_confidence: 0.71,
      verification_required: true,
    },
    {
      observation_id: 'obs_004',
      category: 'puja_object',
      label: 'diya',
      representation_type: 'physical_object',
      group_id: null,
      member_labels: null,
      bounding_box: { x: 0.44, y: 0.63, width: 0.07, height: 0.07 },
      model_confidence: 0.92,
      verification_required: false,
    },
    {
      observation_id: 'obs_005',
      category: 'puja_object',
      label: 'religious_book',
      representation_type: 'physical_object',
      group_id: null,
      member_labels: null,
      bounding_box: { x: 0.5, y: 0.66, width: 0.16, height: 0.09 },
      model_confidence: 0.79,
      verification_required: false,
    },
  ],
  visual_findings: [
    {
      finding_code: 'crowding',
      description: 'Several puja objects are placed close together on the lower shelf.',
      related_observation_ids: ['obs_004', 'obs_005'],
    },
    {
      finding_code: 'flame_near_combustible',
      description: 'A diya appears close to what looks like paper or a book cover.',
      related_observation_ids: ['obs_004', 'obs_005'],
    },
  ],
};

export function dryRunResult(): CallResult {
  // DRY_RUN_INVALID makes every attempt fail schema validation. Useful for checking the
  // bounded-retry path and confirming that billed tokens accumulate across attempts,
  // without a provider or a key.
  const invalid = process.env.DRY_RUN_INVALID === 'true';

  return {
    content: invalid
      ? JSON.stringify({ schema_version: '1', objects: 'not an array' })
      : JSON.stringify(FIXTURE_BODY),
    latencyMs: 1234,
    finishReason: 'stop',
    provider: DRY_RUN_MARKER,
    upstreamModel: DRY_RUN_MARKER,
    usage: {
      promptTokens: 2700,
      completionTokens: 1200,
      cachedPromptTokens: 0,
      totalTokens: 3900,
    },
  };
}
