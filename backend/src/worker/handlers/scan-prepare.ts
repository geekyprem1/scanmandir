import { getConfig } from '../../shared/config.js';
import { getPool, withTransaction } from '../../shared/db/pool.js';
import { appendOutboxEvent } from '../../shared/jobs/outbox.js';
import { PermanentJobError, type JobHandler } from '../../shared/jobs/types.js';
import { getLogger } from '../../shared/logger.js';
import { getObjectStorage } from '../../shared/storage/index.js';
import { findReservationPeriod, releaseAllowance } from '../../modules/billing/quota.js';
import { UnusableImageError, prepareDerivative } from '../../modules/scans/image_preparation.js';
import {
  findMedia,
  findScanById,
  recordDerivativeMedia,
  setMediaValidationStatus,
  setScanStatus,
  type Scan,
} from '../../modules/scans/scan_repository.js';

export const SCAN_PREPARE_JOB = 'scan.prepare';
export const SCAN_PREPARED_EVENT = 'scan.prepared';

/** The reserve entry created with the scan. A release has to name it. */
function reservationKey(scanId: string): string {
  return `scan:${scanId}:reserve`;
}

/**
 * First worker stage of a scan: turn the pinned original into the derivative the
 * analysis stages read, or refuse the upload as unusable.
 *
 * This runs before any paid provider work, which is the point — a file that cannot be
 * decoded is caught here, where refusing it costs nothing (ARCHITECTURE.md section 6).
 * An unusable upload becomes a retake action and releases the allowance, so a user whose
 * photo we could not read has not spent a scan on it.
 */
export const scanPrepareHandler: JobHandler = async (job) => {
  const logger = getLogger();
  const config = getConfig();

  const scanId = typeof job.payload.scanId === 'string' ? job.payload.scanId : '';
  const imageRevision = Number(job.payload.imageRevision);
  if (scanId === '' || !Number.isInteger(imageRevision) || imageRevision <= 0) {
    throw new PermanentJobError('scan.prepare needs a scanId and a positive imageRevision.');
  }

  const pool = getPool();
  const scan = await findScanById(pool, scanId);

  // A deleted scan is terminal and takes precedence over worker completion: the job
  // succeeds quietly rather than publishing anything (ARCHITECTURE.md section 6).
  if (!scan || scan.deletedAt) {
    logger.info({ jobId: job.id, scanId }, 'scan.prepare skipped: scan is gone or deleted');
    return;
  }

  // Idempotence guard. A redelivered job finds the scan past `queued` and stops, so the
  // derivative is written and the event appended at most once per revision.
  if (scan.status !== 'queued') {
    logger.info(
      { jobId: job.id, scanId, status: scan.status },
      'scan.prepare skipped: scan is no longer queued',
    );
    return;
  }

  const original = await findMedia(pool, scanId, imageRevision, 'original');
  if (!original) {
    throw new PermanentJobError(`scan.prepare found no original media for revision ${imageRevision}.`);
  }

  const storage = getObjectStorage();
  const uploadedBytes = await storage.getObject(original.storageKey);

  let prepared;
  try {
    prepared = await prepareDerivative(uploadedBytes, {
      maxEdge: config.IMAGE_DERIVATIVE_MAX_EDGE,
      maxInputPixels: config.IMAGE_MAX_INPUT_PIXELS,
      quality: config.IMAGE_DERIVATIVE_QUALITY,
    });
  } catch (error) {
    if (!(error instanceof UnusableImageError)) throw error;
    await requestRetake(pool, scan, original.id, imageRevision, error);
    return;
  }

  const derivativeKey = `scans/${scan.userId}/${scanId}/r${imageRevision}/derivative.jpg`;
  await storage.putObject(derivativeKey, prepared.bytes, prepared.contentType);

  await withTransaction(async (tx) => {
    await recordDerivativeMedia(tx, {
      scanId,
      imageRevision,
      storageKey: derivativeKey,
      contentType: prepared.contentType,
      byteSize: prepared.bytes.byteLength,
    });
    await setScanStatus(tx, scanId, 'analyzing');
    await appendOutboxEvent(tx, {
      eventType: SCAN_PREPARED_EVENT,
      aggregateType: 'scan',
      aggregateId: scanId,
      dedupeKey: `scan:${scanId}:analyze:r${imageRevision}`,
      payload: { scanId, userId: scan.userId, imageRevision },
    });
  });

  logger.info(
    {
      jobId: job.id,
      scanId,
      imageRevision,
      derivativeKey,
      derivativeBytes: prepared.bytes.byteLength,
      source: `${prepared.sourceWidth}x${prepared.sourceHeight}`,
      derivative: `${prepared.width}x${prepared.height}`,
    },
    'scan prepared for analysis',
  );
};

/**
 * Records an upload that cannot be analysed: the scan asks for a retake, the object is
 * marked rejected, and the allowance reservation it held is released so the attempt does
 * not count against the period. All three commit together. The rejected object is left
 * in place for retention cleanup rather than deleted here.
 */
async function requestRetake(
  pool: ReturnType<typeof getPool>,
  scan: Scan,
  mediaId: string,
  imageRevision: number,
  cause: Error,
): Promise<void> {
  const logger = getLogger();
  const reservation = reservationKey(scan.id);
  const period = await findReservationPeriod(pool, reservation);

  if (!period) {
    // Creation always reserves before a scan exists, so this means the ledger was
    // tampered with. Retrying cannot fix that, and silently skipping the release would
    // leave the user charged for a photo we refused.
    throw new PermanentJobError(`scan ${scan.id} has no allowance reservation to release.`);
  }

  await withTransaction(async (tx) => {
    await setScanStatus(tx, scan.id, 'needs_retake');
    await setMediaValidationStatus(tx, mediaId, 'rejected');
    await releaseAllowance(tx, {
      userId: scan.userId,
      scanId: scan.id,
      reservationKey: reservation,
      operationKey: `scan:${scan.id}:release`,
      period,
    });
  });

  logger.info(
    { scanId: scan.id, imageRevision, reason: cause.message },
    'uploaded image was unusable; allowance released and a retake requested',
  );
}
