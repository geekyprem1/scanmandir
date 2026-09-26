import type { Queryable } from '../../shared/db/pool.js';

/** What the user did with one detected object. */
export type ConfirmationAction = 'confirmed' | 'corrected' | 'added';

export interface ConfirmedObject {
  /** The observation's display id, or a client-generated id for something the user added. */
  id: string;
  label: string;
  category: string;
  representationType: string;
  groupId: string | null;
  memberLabels: string[] | null;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
  /** Null for an object the user added: nothing was measured, so nothing is claimed. */
  modelConfidence: number | null;
  verificationRequired: boolean;
  action: ConfirmationAction;
  /** The model's original label when the user corrected it. */
  correctedFrom: string | null;
}

export interface RecordScanInputInput {
  scanId: string;
  inputRevision: number;
  imageRevision: number;
  objects: ConfirmedObject[];
  context: Record<string, string>;
}

/**
 * Stores one confirmed input revision. Never updated: a later confirmation inserts a new
 * revision, so a report can always name the exact input it was built from.
 */
export async function insertScanInput(db: Queryable, input: RecordScanInputInput): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO scan_inputs (scan_id, input_revision, image_revision, objects, context)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
     RETURNING id`,
    [
      input.scanId,
      input.inputRevision,
      input.imageRevision,
      JSON.stringify(input.objects),
      JSON.stringify(input.context),
    ],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('recording a confirmed input returned no id.');
  return id;
}

export interface StoredScanInput {
  id: string;
  inputRevision: number;
  imageRevision: number;
  objects: ConfirmedObject[];
  context: Record<string, string>;
  createdAt: Date;
}

export async function findScanInput(
  db: Queryable,
  scanId: string,
  inputRevision: number,
): Promise<StoredScanInput | null> {
  const { rows } = await db.query<{
    id: string;
    input_revision: number;
    image_revision: number;
    objects: ConfirmedObject[];
    context: Record<string, string>;
    created_at: Date;
  }>(
    `SELECT id, input_revision, image_revision, objects, context, created_at
       FROM scan_inputs
      WHERE scan_id = $1 AND input_revision = $2`,
    [scanId, inputRevision],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    inputRevision: row.input_revision,
    imageRevision: row.image_revision,
    objects: row.objects,
    context: row.context,
    createdAt: row.created_at,
  };
}
