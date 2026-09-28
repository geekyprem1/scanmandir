/** The finding types a report keeps distinct (TASKS P6-07). */
export type FindingType = 'visual' | 'traditional' | 'vastu' | 'safety' | 'verification';

/**
 * What the evaluator is allowed to answer (ARCHITECTURE.md section 7).
 *
 * `not_assessed` is a first-class answer, not a failure: a rule whose prerequisites are
 * missing has not been disproved, and reporting it as "does not apply" would turn "we do
 * not know" into a verdict the user never got.
 */
export type RuleOutcome = 'applies' | 'does_not_apply' | 'not_assessed';

/**
 * Everything a rule may read.
 *
 * There is deliberately no other input: not the photo, not the model's raw text, not the
 * clock or the weather. Whatever is not in here cannot influence a finding, and everything
 * in here came from the user's own confirmation.
 */
export interface EvaluationInputs {
  /** Catalog label to how many the user confirmed. A label absent means zero. */
  readonly labels: ReadonlyMap<string, number>;
  /** Traditions the user said their family follows. Empty means they did not say. */
  readonly traditionIds: readonly string[];
  /** Context question id to the answer the user chose. */
  readonly answers: ReadonlyMap<string, string>;
  /** Region scope the user selected, or null when nobody asked. */
  readonly regionScope: string | null;
}

/** The part of a stored rule version the evaluator needs. */
export interface EvaluableRule {
  readonly traditionIds: readonly string[];
  readonly regionScope: string | null;
  readonly requiredInputs: readonly string[];
  /** A restricted declarative tree (see `condition.ts`), stored as JSONB. */
  readonly condition: unknown;
}

export interface EvaluationResult {
  readonly outcome: RuleOutcome;
  /**
   * Stable codes, never prose: `tradition_unknown`, `missing_input:open_flame`,
   * `unsupported_operator:channel_flow`, `condition_too_complex`, and so on. Empty for a
   * decided outcome, never empty for `not_assessed`.
   */
  readonly reasons: readonly string[];
}
