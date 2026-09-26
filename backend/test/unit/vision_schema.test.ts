import { describe, expect, it } from 'vitest';
import {
  VisionResponseSchema,
  contractViolations,
  normalizeAnalysis,
} from '../../src/modules/vision/schema.js';

/** A valid response, overridable per test. Mirrors the shape the evaluation produced. */
function response(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: '1',
    image_quality: { usable: true, reasons: [], looks_like_home_mandir: true },
    objects: [],
    visual_findings: [],
    ...overrides,
  };
}

function object(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    observation_id: 'obs_001',
    category: 'puja_object',
    label: 'diya',
    representation_type: 'physical_object',
    group_id: null,
    member_labels: null,
    bounding_box: { x: 0.1, y: 0.2, width: 0.2, height: 0.2 },
    model_confidence: 0.9,
    verification_required: false,
    ...overrides,
  };
}

const parse = (body: Record<string, unknown>) => VisionResponseSchema.parse(body);

describe('normalizeAnalysis', () => {
  it('leaves a compliant response untouched', () => {
    const normalized = normalizeAnalysis(
      parse(response({ objects: [object(), object({ observation_id: 'obs_002', label: 'bell' })] })),
    );

    expect(normalized.normalization).toEqual([]);
    expect(normalized.observations.map((observation) => observation.label)).toEqual(['diya', 'bell']);
  });

  it('keeps a label outside the catalog as an explicit unknown instead of inventing one', () => {
    const normalized = normalizeAnalysis(parse(response({ objects: [object({ label: 'brass_vessel' })] })));

    expect(normalized.observations[0]?.label).toBe('other_object');
    expect(normalized.normalization[0]).toContain('brass_vessel → other_object');
  });

  it('sends an unknown deity label to unknown_idol rather than to an object label', () => {
    const normalized = normalizeAnalysis(
      parse(
        response({
          objects: [object({ category: 'deity_representation', label: 'goddess_of_learning' })],
        }),
      ),
    );

    expect(normalized.observations[0]?.label).toBe('unknown_idol');
  });

  it('maps the alias the evaluation actually saw', () => {
    // `incense_stick` (singular) came back from a real run; the catalog says incense_sticks.
    const normalized = normalizeAnalysis(parse(response({ objects: [object({ label: 'incense_stick' })] })));

    expect(normalized.observations[0]?.label).toBe('incense_sticks');
    expect(normalized.normalization[0]).toContain('alias');
  });

  it('collapses a group that names a single member into a standalone object', () => {
    // Contract violation seen in the evaluation: a group whose only member is itself.
    const normalized = normalizeAnalysis(
      parse(
        response({
          objects: [
            object({
              category: 'deity_representation',
              label: 'radha_krishna',
              group_id: 'group_001',
              member_labels: ['radha_krishna'],
            }),
          ],
        }),
      ),
    );

    expect(normalized.observations[0]?.group_id).toBeNull();
    expect(normalized.observations[0]?.member_labels).toBeNull();
    expect(normalized.normalization[0]).toContain('single-member group');
  });

  it('drops a bounding box that is not a usable region rather than clamping it', () => {
    const normalized = normalizeAnalysis(
      parse(
        response({
          objects: [
            object({ observation_id: 'obs_001', bounding_box: { x: 0.9, y: 0.1, width: 0.5, height: 0.2 } }),
            object({ observation_id: 'obs_002', bounding_box: { x: 0.1, y: 0.1, width: 0, height: 0.2 } }),
          ],
        }),
      ),
    );

    expect(normalized.observations[0]?.bounding_box).toBeNull();
    expect(normalized.observations[1]?.bounding_box).toBeNull();
    expect(normalized.normalization).toHaveLength(2);
  });

  it('corrects a category the label contradicts', () => {
    const normalized = normalizeAnalysis(
      parse(response({ objects: [object({ category: 'other', label: 'ganesh' })] })),
    );

    expect(normalized.observations[0]?.category).toBe('deity_representation');
    expect(normalized.normalization[0]).toContain('category other → deity_representation');
  });

  it('renames a duplicate observation id and keeps findings pointing at a real one', () => {
    const normalized = normalizeAnalysis(
      parse(
        response({
          objects: [
            object({ observation_id: 'obs_001' }),
            object({ observation_id: 'obs_001', label: 'bell' }),
          ],
          visual_findings: [
            {
              finding_code: 'crowding',
              description: 'several objects close together',
              related_observation_ids: ['obs_001'],
            },
          ],
        }),
      ),
    );

    expect(normalized.observations.map((observation) => observation.observation_id)).toEqual([
      'obs_001',
      'obs_001_1',
    ]);
    expect(normalized.findings[0]?.related_observation_ids).toEqual(['obs_001']);
    expect(normalized.normalization.some((note) => note.includes('duplicate id'))).toBe(true);
  });

  it('never upgrades a claim: an unusable box stays unusable and a low confidence stays low', () => {
    const normalized = normalizeAnalysis(
      parse(
        response({
          objects: [object({ bounding_box: null, model_confidence: 0.2, verification_required: true })],
        }),
      ),
    );

    expect(normalized.observations[0]?.bounding_box).toBeNull();
    expect(normalized.observations[0]?.model_confidence).toBe(0.2);
    expect(normalized.observations[0]?.verification_required).toBe(true);
  });
});

describe('contractViolations', () => {
  it('reports what it will not change', () => {
    const parsed = parse(
      response({
        objects: [object({ label: 'brass_vessel' })],
        visual_findings: [
          { finding_code: 'crowding', description: 'x', related_observation_ids: ['obs_999'] },
        ],
      }),
    );

    const violations = contractViolations(parsed);

    expect(violations.some((violation) => violation.includes('outside candidate catalog'))).toBe(true);
    expect(violations.some((violation) => violation.includes('unknown observation obs_999'))).toBe(true);
  });
});
