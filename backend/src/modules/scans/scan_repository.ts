import { getPool, type Queryable } from '../../shared/db/pool.js';

/**
 * Scan lifecycle states (ARCHITECTURE.md section 6). Deletion is tracked separately as
 * `deletedAt`, so the state a scan was in when it was deleted survives for support.
 */
export type ScanStatus =
  | 'awaiting_upload'
  | 'queued'
  | 'analyzing'
  | 'needs_retake'
  | 'awaiting_confirmation'
  | 'generating_report'
  | 'completed'
  | 'failed';

export interface Scan {
  id: string;
  userId: string;
  status: ScanStatus;
  imageRevision: number;
  inputRevision: number;
  failedStage: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ScanRow {
  id: string;
  user_id: string;
  status: ScanStatus;
  image_revision: number;
  input_revision: number;
  failed_stage: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function toScan(row: ScanRow): Scan {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    imageRevision: row.image_revision,
    inputRevision: row.input_revision,
    failedStage: row.failed_stage,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS =
  'id, user_id, status, image_revision, input_revision, failed_stage, deleted_at, created_at, updated_at';

export interface CreateScanInput {
  userId: string;
  idempotencyKey: string;
  /** Hash of the creation request, so a reused key with different input is a conflict. */
  requestHash: string;
}

export async function insertScan(db: Queryable, input: CreateScanInput): Promise<Scan> {
  const { rows } = await db.query<ScanRow>(
    `INSERT INTO scans (user_id, creation_idempotency_key, creation_request_hash)
     VALUES ($1, $2, $3)
     RETURNING ${SELECT_COLUMNS}`,
    [input.userId, input.idempotencyKey, input.requestHash],
  );
  const row = rows[0];
  if (!row) throw new Error('insertScan returned no row.');
  return toScan(row);
}

export interface ExistingScan {
  scan: Scan;
  requestHash: string | null;
}

/** A prior scan created with this idempotency key, if the client is retrying. */
export async function findScanByIdempotencyKey(
  db: Queryable,
  userId: string,
  idempotencyKey: string,
): Promise<ExistingScan | null> {
  const { rows } = await db.query<ScanRow & { creation_request_hash: string | null }>(
    `SELECT ${SELECT_COLUMNS}, creation_request_hash
       FROM scans
      WHERE user_id = $1 AND creation_idempotency_key = $2`,
    [userId, idempotencyKey],
  );
  const row = rows[0];
  if (!row) return null;
  return { scan: toScan(row), requestHash: row.creation_request_hash };
}

/**
 * An owned, non-deleted scan.
 *
 * Ownership is part of the query, not a check afterwards: another user's scan id simply
 * does not resolve (ARCHITECTURE.md section 9 — possession of a UUID is not
 * authorization). Callers report NOT_FOUND rather than FORBIDDEN so the endpoint does
 * not confirm that someone else's scan exists.
 */
export async function findOwnedScan(db: Queryable, userId: string, scanId: string): Promise<Scan | null> {
  const { rows } = await db.query<ScanRow>(
    `SELECT ${SELECT_COLUMNS}
       FROM scans
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [scanId, userId],
  );
  const row = rows[0];
  return row ? toScan(row) : null;
}

/** Same as [findOwnedScan], but locks the row for the rest of the transaction. */
export async function lockOwnedScan(db: Queryable, userId: string, scanId: string): Promise<Scan | null> {
  const { rows } = await db.query<ScanRow>(
    `SELECT ${SELECT_COLUMNS}
       FROM scans
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
      FOR UPDATE`,
    [scanId, userId],
  );
  const row = rows[0];
  return row ? toScan(row) : null;
}

/** Moves a scan to a new state, recording which stage failed when there is one. */
export async function setScanStatus(
  db: Queryable,
  scanId: string,
  status: ScanStatus,
  options: { failedStage?: string | null } = {},
): Promise<void> {
  await db.query(
    `UPDATE scans
        SET status = $2,
            failed_stage = $3,
            updated_at = now()
      WHERE id = $1`,
    [scanId, status, options.failedStage ?? null],
  );
}

export interface RecordOriginalMediaInput {
  scanId: string;
  imageRevision: number;
  storageKey: string;
  contentType: string | null;
  byteSize: number;
}

/**
 * Records the pinned original for a revision.
 *
 * The upload flow pins the object before calling this, so the row always describes an
 * object that exists. Staging keys are never recorded — only the immutable canonical
 * key is (ARCHITECTURE.md section 6).
 */
export async function recordOriginalMedia(db: Queryable, input: RecordOriginalMediaInput): Promise<void> {
  await db.query(
    `INSERT INTO media_objects
        (scan_id, image_revision, purpose, storage_key, content_type, byte_size, validation_status)
     VALUES ($1, $2, 'original', $3, $4, $5, 'valid')`,
    [input.scanId, input.imageRevision, input.storageKey, input.contentType, input.byteSize],
  );
}

/** Convenience for tests and diagnostics: the scan's own row, without ownership. */
export async function findScanById(db: Queryable = getPool(), scanId: string): Promise<Scan | null> {
  const { rows } = await db.query<ScanRow>(`SELECT ${SELECT_COLUMNS} FROM scans WHERE id = $1`, [scanId]);
  const row = rows[0];
  return row ? toScan(row) : null;
}
