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
  /** The quality gate's own codes, when the scan was sent back for a retake (P5-02). */
  retakeReason: string[];
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
  retake_reason: string[] | null;
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
    retakeReason: row.retake_reason ?? [],
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS =
  'id, user_id, status, image_revision, input_revision, failed_stage, retake_reason, deleted_at, created_at, updated_at';

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

/**
 * Moves a scan to a new state, recording which stage failed when there is one, and why a
 * retake was asked for when the quality gate refused the photo.
 */
export async function setScanStatus(
  db: Queryable,
  scanId: string,
  status: ScanStatus,
  options: { failedStage?: string | null; retakeReason?: string[] } = {},
): Promise<void> {
  await db.query(
    `UPDATE scans
        SET status = $2,
            failed_stage = $3,
            retake_reason = COALESCE($4::text[], '{}'),
            updated_at = now()
      WHERE id = $1`,
    [scanId, status, options.failedStage ?? null, options.retakeReason ?? null],
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

export type MediaPurpose = 'original' | 'derivative' | 'thumbnail';
export type MediaValidationStatus = 'pending' | 'valid' | 'rejected' | 'expired';

export interface MediaObject {
  id: string;
  scanId: string;
  imageRevision: number;
  purpose: MediaPurpose;
  storageKey: string;
  contentType: string | null;
  byteSize: number | null;
  validationStatus: MediaValidationStatus;
}

interface MediaRow {
  id: string;
  scan_id: string;
  image_revision: number;
  purpose: MediaPurpose;
  storage_key: string;
  content_type: string | null;
  byte_size: string | null;
  validation_status: MediaValidationStatus;
}

function toMedia(row: MediaRow): MediaObject {
  return {
    id: row.id,
    scanId: row.scan_id,
    imageRevision: row.image_revision,
    purpose: row.purpose,
    storageKey: row.storage_key,
    contentType: row.content_type,
    byteSize: row.byte_size === null ? null : Number(row.byte_size),
    validationStatus: row.validation_status,
  };
}

const SELECT_MEDIA_COLUMNS =
  'id, scan_id, image_revision, purpose, storage_key, content_type, byte_size, validation_status';

/** The pinned object for one scan, revision and purpose. */
export async function findMedia(
  db: Queryable,
  scanId: string,
  imageRevision: number,
  purpose: MediaPurpose,
): Promise<MediaObject | null> {
  const { rows } = await db.query<MediaRow>(
    `SELECT ${SELECT_MEDIA_COLUMNS}
       FROM media_objects
      WHERE scan_id = $1 AND image_revision = $2 AND purpose = $3`,
    [scanId, imageRevision, purpose],
  );
  const row = rows[0];
  return row ? toMedia(row) : null;
}

export interface RecordDerivativeMediaInput {
  scanId: string;
  imageRevision: number;
  storageKey: string;
  contentType: string;
  byteSize: number;
}

/**
 * Records the prepared derivative for a revision.
 *
 * Upserts rather than inserts, so a redelivered job replaces the row it already wrote
 * instead of failing on the one-object-per-revision index.
 */
export async function recordDerivativeMedia(db: Queryable, input: RecordDerivativeMediaInput): Promise<void> {
  await db.query(
    `INSERT INTO media_objects
        (scan_id, image_revision, purpose, storage_key, content_type, byte_size, validation_status)
     VALUES ($1, $2, 'derivative', $3, $4, $5, 'valid')
     ON CONFLICT (scan_id, image_revision, purpose) DO UPDATE
        SET storage_key = EXCLUDED.storage_key,
            content_type = EXCLUDED.content_type,
            byte_size = EXCLUDED.byte_size,
            validation_status = EXCLUDED.validation_status,
            updated_at = now()`,
    [input.scanId, input.imageRevision, input.storageKey, input.contentType, input.byteSize],
  );
}

/**
 * Marks what the server found out about an object. A rejected row is kept rather than
 * deleted: retention cleanup is the only thing that removes media, so the reason an
 * upload was refused stays auditable until then.
 */
export async function setMediaValidationStatus(
  db: Queryable,
  mediaId: string,
  status: MediaValidationStatus,
): Promise<void> {
  await db.query(`UPDATE media_objects SET validation_status = $2, updated_at = now() WHERE id = $1`, [
    mediaId,
    status,
  ]);
}
