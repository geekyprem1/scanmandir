import { z } from 'zod';

/**
 * The observation contract (ARCHITECTURE.md section 7, PRD section 38).
 *
 * The candidate label lists are the ones the evaluation ran against, so their hits and
 * misses in docs/decisions.md D-04 describe this exact text. A label outside them is not
 * rejected — it is normalized to an unknown/other label and the change is recorded, so the
 * model is never rewarded for inventing a name and never punished for being cautious.
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

export const REPRESENTATION_TYPES = [
  'statue',
  'framed_image',
  'poster',
  'printed_image',
  'relief',
  'shivling',
  'physical_object',
  'unknown',
] as const;

export const OBSERVATION_CATEGORIES = ['deity_representation', 'puja_object', 'other'] as const;

const unit = z.number().min(0).max(1);

export const BoundingBoxSchema = z.object({
  x: unit,
  y: unit,
  width: unit,
  height: unit,
});

export const ObservationSchema = z.object({
  observation_id: z.string().min(1),
  category: z.enum(OBSERVATION_CATEGORIES),
  label: z.string().min(1),
  representation_type: z.enum(REPRESENTATION_TYPES),
  /** Set on every member of one group scene, so duplicate rules cannot double-count. */
  group_id: z.string().nullable(),
  /** Populated only when the entry is itself a group depiction. */
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
  /** The relevance half of the gate (ARCHITECTURE.md section 6 step 5). */
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
export type VisualFinding = z.infer<typeof VisualFindingSchema>;
export type ImageQuality = z.infer<typeof ImageQualitySchema>;

/**
 * Checks the schema cannot express but the architecture requires.
 *
 * Reported rather than thrown: the rate at which a model breaks them is a result worth
 * counting on every stored run, and none of them makes the response unusable on its own.
 */
export function contractViolations(response: VisionResponse): string[] {
  const problems: string[] = [];
  const seenIds = new Set<string>();

  for (const object of response.objects) {
    if (seenIds.has(object.observation_id)) {
      problems.push(`${object.observation_id}: duplicate observation_id`);
    }
    seenIds.add(object.observation_id);

    const box = object.bounding_box;
    if (box) {
      if (box.width === 0 || box.height === 0) {
        problems.push(`${object.observation_id}: zero-area bounding box`);
      }
      if (box.x + box.width > 1.0001 || box.y + box.height > 1.0001) {
        problems.push(`${object.observation_id}: bounding box leaves image bounds`);
      }
    }

    if (!ALL_CANDIDATE_LABELS.includes(object.label)) {
      problems.push(`${object.observation_id}: label outside candidate catalog: ${object.label}`);
    }

    if (
      object.category === 'deity_representation' &&
      object.member_labels !== null &&
      object.member_labels.length === 1
    ) {
      problems.push(`${object.observation_id}: group with a single member is ambiguous`);
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

/**
 * Labels the model reaches for that mean a catalog label. Kept deliberately short: an
 * alias is a claim about what the model meant, and a wrong alias invents a label the
 * response did not contain. Only drifts seen in real output, or synonyms with no
 * ambiguity, belong here.
 */
const LABEL_ALIASES: Record<string, string> = {
  incense_stick: 'incense_sticks',
  agarbatti: 'incense_sticks',
  garland: 'flowers',
  flower_garland: 'flowers',
  idol: 'unknown_idol',
  murti: 'unknown_idol',
  statue_of_deity: 'unknown_idol',
  lamp: 'oil_lamp',
  aarti_lamp: 'oil_lamp',
  thali: 'puja_thali',
  book: 'religious_book',
  kalasham: 'kalash',
};

const DEITY_LABEL_SET = new Set<string>(CANDIDATE_DEITY_LABELS);
const OBJECT_LABEL_SET = new Set<string>(CANDIDATE_OBJECT_LABELS);

/** The catalog label for what the model said, plus a note when it was not already one. */
function normalizeLabel(
  raw: string,
  category: Observation['category'],
): { label: string; note: string | null } {
  if (ALL_CANDIDATE_LABELS.includes(raw)) return { label: raw, note: null };

  const alias = LABEL_ALIASES[raw];
  if (alias) return { label: alias, note: `${raw} → ${alias} (alias)` };

  const fallback = category === 'deity_representation' ? 'unknown_idol' : 'other_object';
  return { label: fallback, note: `${raw} → ${fallback} (outside catalog)` };
}

/**
 * The category the label implies. A statue reported as a puja object would otherwise
 * reach the rules engine under the wrong heading.
 */
function categoryFor(label: string, reported: Observation['category']): Observation['category'] {
  if (DEITY_LABEL_SET.has(label)) return 'deity_representation';
  if (OBJECT_LABEL_SET.has(label)) return 'puja_object';
  return reported;
}

export interface NormalizedAnalysis {
  imageQuality: ImageQuality;
  observations: Observation[];
  findings: VisualFinding[];
  /** Every change the adapter made, in order. Empty means the response needed nothing. */
  normalization: string[];
}

/**
 * Turns a validated response into what the database will store (TASKS P5-03).
 *
 * Normalization only ever makes a claim usable or explicitly unknown; it never upgrades
 * one. Nothing here invents a label, a group, or a coordinate the model did not send: an
 * unusable box becomes null rather than a guess, and a group naming a single member
 * becomes a standalone object rather than a group of one.
 */
export function normalizeAnalysis(response: VisionResponse): NormalizedAnalysis {
  const notes: string[] = [];
  const usedIds = new Set<string>();
  const observations: Observation[] = [];

  for (const object of response.objects) {
    const { label, note } = normalizeLabel(object.label, object.category);
    if (note) notes.push(`${object.observation_id}: ${note}`);

    const category = categoryFor(label, object.category);
    if (category !== object.category) {
      notes.push(`${object.observation_id}: category ${object.category} → ${category} (label implies it)`);
    }

    let displayId = object.observation_id;
    if (usedIds.has(displayId)) {
      let suffix = 1;
      while (usedIds.has(`${displayId}_${suffix}`)) suffix += 1;
      notes.push(`${displayId}: duplicate id → ${displayId}_${suffix}`);
      displayId = `${displayId}_${suffix}`;
    }
    usedIds.add(displayId);

    let boundingBox = object.bounding_box;
    if (boundingBox) {
      const outsideBounds =
        boundingBox.x + boundingBox.width > 1.0001 || boundingBox.y + boundingBox.height > 1.0001;
      if (boundingBox.width === 0 || boundingBox.height === 0 || outsideBounds) {
        notes.push(`${displayId}: bounding box dropped (not a usable region)`);
        boundingBox = null;
      }
    }

    let groupId = object.group_id;
    let memberLabels = object.member_labels;
    if (memberLabels !== null && memberLabels.length <= 1) {
      // A group of one is not a group. Two member_labels would already have been normalized,
      // but a single member means the model described a standalone object as a group.
      notes.push(`${displayId}: single-member group collapsed to a standalone object`);
      groupId = null;
      memberLabels = null;
    } else if (memberLabels) {
      const normalizedMembers = memberLabels.map((member) => {
        const result = normalizeLabel(member, 'deity_representation');
        if (result.note) notes.push(`${displayId}: member ${result.note}`);
        return result.label;
      });
      memberLabels = normalizedMembers;
    }

    observations.push({
      observation_id: displayId,
      category,
      label,
      representation_type: object.representation_type,
      group_id: groupId,
      member_labels: memberLabels,
      bounding_box: boundingBox,
      model_confidence: object.model_confidence,
      verification_required: object.verification_required,
    });
  }

  // A finding that points at an observation that no longer exists (because a duplicate id
  // was renamed) would be dangling. Only ids that survived normalization are reported.
  const survivingIds = new Set(observations.map((object) => object.observation_id));
  const renamed = new Map(
    response.objects.map((object, index) => [object.observation_id, observations[index]?.observation_id]),
  );
  const findings = response.visual_findings.map((finding) => {
    const related = finding.related_observation_ids
      .map((id) => (survivingIds.has(id) ? id : renamed.get(id)))
      .filter((id): id is string => typeof id === 'string' && survivingIds.has(id));
    if (related.length !== finding.related_observation_ids.length) {
      notes.push(`${finding.finding_code}: dropped references to observations that no longer exist`);
    }
    return { ...finding, related_observation_ids: related };
  });

  return {
    imageQuality: response.image_quality,
    observations,
    findings,
    normalization: notes,
  };
}
