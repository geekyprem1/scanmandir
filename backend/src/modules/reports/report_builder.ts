import type { Queryable } from '../../shared/db/pool.js';
import type { ConfirmedObject } from '../scans/confirmation_repository.js';
import type { StoredAnalysis } from '../vision/repository.js';

/** Bumped when the document's shape changes, so an old report stays readable as itself. */
export const REPORT_VERSION = '1';

export interface ReportItem {
  id: string;
  label: string;
  category: string;
  representationType: string;
  memberLabels: string[] | null;
  /** True when the model was unsure or the user corrected or added it. */
  verificationRequired: boolean;
  /** What the user did with it, so the report can say what came from the model and what did not. */
  action: string;
  /** Whether a location is known, which is what decides if an overlay can be drawn. */
  located: boolean;
}

export interface ReportFinding {
  code: string;
  description: string;
  relatedItems: string[];
}

export interface ReportDocument {
  reportVersion: string;
  generatedAt: string;
  scanId: string;
  inputRevision: number;
  imageRevision: number;
  summary: {
    items: number;
    itemsNeedingCheck: number;
    /** How many of the items came from the model, the user's corrections, or the user alone. */
    fromModel: number;
    corrected: number;
    added: number;
    locationsKnown: number;
  };
  items: ReportItem[];
  visualFindings: ReportFinding[];
  /**
   * Traditional guidance is deliberately absent rather than invented.
   *
   * The rules engine and its reviewed sources are Phase 6 (TASKS P6-01 onward); until a
   * finding can be traced to a published, reviewed rule version, this report says so
   * instead of shipping folklore with the authority of a citation (PRD sections 23 and 38).
   */
  traditionalGuidance: {
    status: 'not_available';
    reason: 'reviewed_rules_not_published';
  };
  sources: never[];
  /** Stated in the document itself so no screen has to remember to say it. */
  disclaimer: {
    informational: true;
    replacesQualifiedAdvice: false;
    note: string;
  };
}

export interface BuildReportInput {
  scanId: string;
  inputRevision: number;
  imageRevision: number;
  objects: ConfirmedObject[];
  /** Null when the analysis is missing, which only happens if the input outlived it. */
  analysis: StoredAnalysis | null;
  now?: Date;
}

/**
 * Builds the report document from the confirmed input (ARCHITECTURE.md section 6, step 8).
 *
 * The input is the user's confirmed list, never the model's raw output: an object the user
 * removed does not appear, a correction appears as the corrected label with its origin
 * recorded, and something the user added is marked as theirs.
 */
export function buildReport(input: BuildReportInput): ReportDocument {
  const items: ReportItem[] = input.objects.map((object) => ({
    id: object.id,
    label: object.label,
    category: object.category,
    representationType: object.representationType,
    memberLabels: object.memberLabels,
    // Anything the user touched needs a human's eye before guidance depends on it, which is
    // the same rule the confirmation screen applies (TASKS P5-05).
    verificationRequired: object.verificationRequired || object.action !== 'confirmed',
    action: object.action,
    located: object.boundingBox !== null,
  }));

  const findings: ReportFinding[] = (input.analysis?.findings ?? []).map((finding) => ({
    code: finding.findingCode,
    description: finding.description,
    // Only references that survived confirmation: a finding about an object the user
    // removed would describe a photo the report no longer depicts.
    relatedItems: finding.relatedObservationIds.filter((id) => items.some((item) => item.id === id)),
  }));

  return {
    reportVersion: REPORT_VERSION,
    generatedAt: (input.now ?? new Date()).toISOString(),
    scanId: input.scanId,
    inputRevision: input.inputRevision,
    imageRevision: input.imageRevision,
    summary: {
      items: items.length,
      itemsNeedingCheck: items.filter((item) => item.verificationRequired).length,
      fromModel: items.filter((item) => item.action === 'confirmed').length,
      corrected: items.filter((item) => item.action === 'corrected').length,
      added: items.filter((item) => item.action === 'added').length,
      locationsKnown: items.filter((item) => item.located).length,
    },
    items,
    visualFindings: findings,
    traditionalGuidance: {
      status: 'not_available',
      reason: 'reviewed_rules_not_published',
    },
    sources: [],
    disclaimer: {
      informational: true,
      replacesQualifiedAdvice: false,
      note: 'Observations describe what is visible in the photo. They are not a religious judgement, a valuation, or a substitute for a qualified priest.',
    },
  };
}

export interface StoredReport {
  id: string;
  inputRevision: number;
  imageRevision: number;
  body: ReportDocument;
  createdAt: Date;
}

/**
 * Stores a report, or returns the one already stored for this revision.
 *
 * Idempotent by design: a redelivered job must not produce a second answer to the same
 * question, and the unique index is what enforces it rather than a check-then-insert.
 */
export async function insertReport(
  db: Queryable,
  input: { scanId: string; inputRevision: number; imageRevision: number; body: ReportDocument },
): Promise<{ id: string; created: boolean }> {
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO reports (scan_id, input_revision, image_revision, body)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (scan_id, input_revision) DO NOTHING
     RETURNING id`,
    [input.scanId, input.inputRevision, input.imageRevision, JSON.stringify(input.body)],
  );
  const id = inserted.rows[0]?.id;
  if (id) return { id, created: true };

  const existing = await db.query<{ id: string }>(
    `SELECT id FROM reports WHERE scan_id = $1 AND input_revision = $2`,
    [input.scanId, input.inputRevision],
  );
  const existingId = existing.rows[0]?.id;
  if (!existingId) throw new Error('report conflicted on its revision but no row was found');
  return { id: existingId, created: false };
}

/** The report for a scan's confirmed revision, when one exists. */
export async function findReport(
  db: Queryable,
  scanId: string,
  inputRevision: number,
): Promise<StoredReport | null> {
  const { rows } = await db.query<{
    id: string;
    input_revision: number;
    image_revision: number;
    body: ReportDocument;
    created_at: Date;
  }>(
    `SELECT id, input_revision, image_revision, body, created_at
       FROM reports
      WHERE scan_id = $1 AND input_revision = $2`,
    [scanId, inputRevision],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    inputRevision: row.input_revision,
    imageRevision: row.image_revision,
    body: row.body,
    createdAt: row.created_at,
  };
}
