import { z } from 'zod';

/**
 * Normalized vision output, following ARCHITECTURE.md section 7 and PRD section 38.
 *
 * `label` is deliberately a free string here rather than an enum. Fixing the launch
 * label catalog is exactly what this spike is meant to inform (docs/decisions.md D-11),
 * so the harness measures how often the model leaves the candidate catalog instead of
 * forcing it to stay inside one.
 */

export const CANDIDATE_DEITY_LABELS = [
  'ganesh',
  'shiva',
  'shivling',
  'hanuman',
  'krishna',
  'radha_krishna',
  'ram',
  'sita',
  'lakshman',
  'ram_darbar',
  'lakshmi',
  'saraswati',
  'durga',
  'kali',
  'parvati',
  'kartikeya',
  'vishnu',
  'narasimha',
  'shani',
  'surya',
  'navagraha',
  'other_deity',
  'unknown_idol',
] as const;

export const CANDIDATE_OBJECT_LABELS = [
  'diya',
  'incense_holder',
  'incense_sticks',
  'bell',
  'shankh',
  'kalash',
  'coconut',
  'mala',
  'flowers',
  'puja_thali',
  'water_vessel',
  'religious_book',
  'yantra',
  'photo_frame',
  'oil_lamp',
  'camphor_holder',
  'rudraksha',
  'decorative_object',
  'other_object',
  'unknown',
] as const;

export const ALL_CANDIDATE_LABELS: readonly string[] = [
  ...CANDIDATE_DEITY_LABELS,
  ...CANDIDATE_OBJECT_LABELS,
];

const unit = z.number().min(0).max(1);

export const BoundingBoxSchema = z.object({
  x: unit,
  y: unit,
  width: unit,
  height: unit,
});

export const ObservationSchema = z.object({
  observation_id: z.string().min(1),
  category: z.enum(['deity_representation', 'puja_object', 'other']),
  label: z.string().min(1),
  representation_type: z.enum([
    'statue',
    'framed_image',
    'poster',
    'printed_image',
    'relief',
    'shivling',
    'physical_object',
    'unknown',
  ]),
  /** Set on every member of one group scene, e.g. a Ram Darbar, so duplicate rules cannot double-count. */
  group_id: z.string().nullable(),
  /** Populated only when this observation is itself a group representation. */
  member_labels: z.array(z.string()).nullable(),
  bounding_box: BoundingBoxSchema.nullable(),
  model_confidence: unit,
  verification_required: z.boolean(),
});

export const VisualFindingSchema = z.object({
  finding_code: z.string().min(1),
  description: z.string().min(1),
  related_observation_ids: z.array(z.string()),
});

export const ImageQualitySchema = z.object({
  usable: z.boolean(),
  reasons: z.array(z.string()),
  /** Tests the non-mandir rejection path in ARCHITECTURE.md section 6 step 5. */
  looks_like_home_mandir: z.boolean(),
});

export const VisionResponseSchema = z.object({
  schema_version: z.literal('1'),
  image_quality: ImageQualitySchema,
  objects: z.array(ObservationSchema),
  visual_findings: z.array(VisualFindingSchema),
});

export type VisionResponse = z.infer<typeof VisionResponseSchema>;
export type Observation = z.infer<typeof ObservationSchema>;

/**
 * Checks that are not expressible as simple field validation but that
 * ARCHITECTURE.md section 7 requires. These are reported, not thrown, because a
 * violation rate is itself a result worth recording.
 */
export function contractViolations(response: VisionResponse): string[] {
  const problems: string[] = [];
  const seenIds = new Set<string>();

  for (const obj of response.objects) {
    if (seenIds.has(obj.observation_id)) {
      problems.push(`duplicate observation_id: ${obj.observation_id}`);
    }
    seenIds.add(obj.observation_id);

    const box = obj.bounding_box;
    if (box) {
      if (box.width === 0 || box.height === 0) {
        problems.push(`${obj.observation_id}: zero-area bounding box`);
      }
      if (box.x + box.width > 1.0001 || box.y + box.height > 1.0001) {
        problems.push(`${obj.observation_id}: bounding box leaves image bounds`);
      }
    }

    if (!ALL_CANDIDATE_LABELS.includes(obj.label)) {
      problems.push(`${obj.observation_id}: label outside candidate catalog: ${obj.label}`);
    }

    if (obj.category === 'deity_representation' && obj.member_labels && obj.member_labels.length === 1) {
      problems.push(`${obj.observation_id}: group with a single member is ambiguous`);
    }
  }

  for (const finding of response.visual_findings) {
    for (const id of finding.related_observation_ids) {
      if (!seenIds.has(id)) {
        problems.push(`finding ${finding.finding_code} references unknown observation ${id}`);
      }
    }
  }

  return problems;
}
