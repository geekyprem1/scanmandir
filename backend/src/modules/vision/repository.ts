import type { Queryable } from '../../shared/db/pool.js';
import type { AnalysisRun, AnalysisResult } from './analyze.js';

export interface RecordAnalysisInput {
  scanId: string;
  imageRevision: number;
  result: AnalysisResult;
}

/**
 * Stores one analysis run and the observations it produced, in the caller's transaction.
 *
 * Nothing here updates a previous run: observations are immutable, and a re-analysis
 * inserts a new run whose rows stand beside the old ones (TASKS P5-04). The confirmed
 * input revision is what downstream stages read, so history can stay messy without
 * confusing the report.
 */
export async function recordAnalysis(
  db: Queryable,
  input: RecordAnalysisInput,
): Promise<{ analysisRunId: string }> {
  const { result } = input;
  const run: AnalysisRun = result.run;

  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO analysis_runs
        (scan_id, image_revision, model, provider, prompt_version, schema_version, latency_ms,
         prompt_tokens, completion_tokens, attempts, image_usable, looks_like_home_mandir,
         quality_reasons, response, normalization, contract_violations)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::text[], $14::jsonb,
             $15::text[], $16::text[])
     RETURNING id`,
    [
      input.scanId,
      input.imageRevision,
      run.model,
      run.provider,
      run.promptVersion,
      run.schemaVersion,
      run.latencyMs,
      run.promptTokens,
      run.completionTokens,
      run.attempts,
      result.imageQuality.usable,
      result.imageQuality.looks_like_home_mandir,
      result.imageQuality.reasons,
      JSON.stringify(result.response),
      result.normalization,
      result.contractViolationList,
    ],
  );

  const analysisRunId = rows[0]?.id;
  if (!analysisRunId) throw new Error('recording an analysis run returned no id.');

  for (const observation of result.observations) {
    await db.query(
      `INSERT INTO observations
          (analysis_run_id, scan_id, image_revision, display_id, category, label,
           representation_type, group_id, member_labels, bounding_box, model_confidence,
           verification_required)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::text[], $10::jsonb, $11, $12)`,
      [
        analysisRunId,
        input.scanId,
        input.imageRevision,
        observation.observation_id,
        observation.category,
        observation.label,
        observation.representation_type,
        observation.group_id,
        observation.member_labels,
        observation.bounding_box === null ? null : JSON.stringify(observation.bounding_box),
        observation.model_confidence,
        observation.verification_required,
      ],
    );
  }

  return { analysisRunId };
}

export interface StoredObservation {
  displayId: string;
  category: string;
  label: string;
  representationType: string;
  groupId: string | null;
  memberLabels: string[] | null;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
  /** The model's own number, uncalibrated (PRD section 10). Never a probability. */
  modelConfidence: number;
  verificationRequired: boolean;
}

export interface StoredAnalysis {
  run: {
    id: string;
    model: string;
    provider: string | null;
    promptVersion: string;
    schemaVersion: string;
    latencyMs: number | null;
    attempts: number;
    imageUsable: boolean;
    looksLikeHomeMandir: boolean;
    qualityReasons: string[];
    createdAt: Date;
  };
  observations: StoredObservation[];
  findings: { findingCode: string; description: string; relatedObservationIds: string[] }[];
}

interface AnalysisRunRow {
  id: string;
  model: string;
  provider: string | null;
  prompt_version: string;
  schema_version: string;
  latency_ms: number | null;
  attempts: number;
  image_usable: boolean;
  looks_like_home_mandir: boolean;
  quality_reasons: string[] | null;
  response: {
    visual_findings?: { finding_code: string; description: string; related_observation_ids: string[] }[];
  };
  created_at: Date;
}

/**
 * The most recent analysis of a revision, with its observations.
 *
 * Latest rather than all: a retake produces a new revision, and a re-analysis produces a
 * new run, so the newest run for the revision the scan is on is the one a screen shows.
 * History stays in the table for audit.
 */
export async function findLatestAnalysis(
  db: Queryable,
  scanId: string,
  imageRevision: number,
): Promise<StoredAnalysis | null> {
  const { rows } = await db.query<AnalysisRunRow>(
    `SELECT id, model, provider, prompt_version, schema_version, latency_ms, attempts,
            image_usable, looks_like_home_mandir, quality_reasons, response, created_at
       FROM analysis_runs
      WHERE scan_id = $1 AND image_revision = $2
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [scanId, imageRevision],
  );
  const row = rows[0];
  if (!row) return null;

  const { rows: observationRows } = await db.query<{
    display_id: string;
    category: string;
    label: string;
    representation_type: string;
    group_id: string | null;
    member_labels: string[] | null;
    bounding_box: StoredObservation['boundingBox'];
    model_confidence: number;
    verification_required: boolean;
  }>(
    `SELECT display_id, category, label, representation_type, group_id, member_labels,
            bounding_box, model_confidence, verification_required
       FROM observations
      WHERE analysis_run_id = $1
      ORDER BY display_id`,
    [row.id],
  );

  return {
    run: {
      id: row.id,
      model: row.model,
      provider: row.provider,
      promptVersion: row.prompt_version,
      schemaVersion: row.schema_version,
      latencyMs: row.latency_ms,
      attempts: row.attempts,
      imageUsable: row.image_usable,
      looksLikeHomeMandir: row.looks_like_home_mandir,
      qualityReasons: row.quality_reasons ?? [],
      createdAt: row.created_at,
    },
    observations: observationRows.map((observation) => ({
      displayId: observation.display_id,
      category: observation.category,
      label: observation.label,
      representationType: observation.representation_type,
      groupId: observation.group_id,
      memberLabels: observation.member_labels,
      boundingBox: observation.bounding_box,
      modelConfidence: observation.model_confidence,
      verificationRequired: observation.verification_required,
    })),
    // Findings live in the stored response rather than a table: nothing queries them by
    // field yet, and the response is the evidence they came from.
    findings: (row.response?.visual_findings ?? []).map((finding) => ({
      findingCode: finding.finding_code,
      description: finding.description,
      relatedObservationIds: finding.related_observation_ids,
    })),
  };
}
