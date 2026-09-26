import { getPool, withTransaction } from '../../shared/db/pool.js';
import { PermanentJobError, RetryableJobError, type JobHandler } from '../../shared/jobs/types.js';
import { getLogger } from '../../shared/logger.js';
import { getObjectStorage } from '../../shared/storage/index.js';
import { releaseScanAllowance } from '../../modules/billing/quota.js';
import { findMedia, findScanById, setScanStatus, type Scan } from '../../modules/scans/scan_repository.js';
import {
  UnusableVisionResponseError,
  analyzeImage,
  type AnalysisResult,
} from '../../modules/vision/analyze.js';
import {
  OpenRouterVisionProvider,
  VisionCallError,
  type VisionProvider,
} from '../../modules/vision/provider.js';
import { recordAnalysis } from '../../modules/vision/repository.js';

export const SCAN_ANALYZE_JOB = 'scan.analyze';

/** Which stage a terminal failure belongs to, so a retry can resume in the right place. */
const FAILED_STAGE = 'vision';

/**
 * The stage that reads the photo (ARCHITECTURE.md sections 6 and 7).
 *
 * Three outcomes, and the differences matter:
 *
 * - **Usable photo of a mandir**: observations are stored immutably against a new analysis
 *   run and the scan moves to `awaiting_confirmation`, where the user corrects what the
 *   model saw.
 * - **The gate refuses the photo**: the scan becomes `needs_retake` with the gate's own
 *   reasons, and the allowance is released, because a photo we could not read must not cost
 *   the user a scan.
 * - **The provider fails**: retried while attempts remain; when the budget is spent the
 *   scan is terminal `failed` and the allowance is released too. The attempt budget is what
 *   bounds the bill, which the evaluation showed is driven by retries (docs/decisions.md
 *   D-05).
 *
 * The provider is injected so tests and the evaluation can drive this without a vendor.
 */
export function createScanAnalyzeHandler(options: { provider?: VisionProvider } = {}): JobHandler {
  return async (job) => {
    const logger = getLogger();
    const scanId = typeof job.payload.scanId === 'string' ? job.payload.scanId : '';
    const imageRevision = Number(job.payload.imageRevision);
    if (scanId === '' || !Number.isInteger(imageRevision) || imageRevision <= 0) {
      throw new PermanentJobError('scan.analyze needs a scanId and a positive imageRevision.');
    }

    const pool = getPool();
    const scan = await findScanById(pool, scanId);

    if (!scan || scan.deletedAt) {
      logger.info({ jobId: job.id, scanId }, 'scan.analyze skipped: scan is gone or deleted');
      return;
    }
    // Idempotence: a redelivered job finds the scan past `analyzing` and stops, so the
    // provider is never called twice for the same revision.
    if (scan.status !== 'analyzing') {
      logger.info(
        { jobId: job.id, scanId, status: scan.status },
        'scan.analyze skipped: scan is no longer analyzing',
      );
      return;
    }

    const derivative = await findMedia(pool, scanId, imageRevision, 'derivative');
    if (!derivative) {
      throw new PermanentJobError(`scan.analyze found no derivative for revision ${imageRevision}.`);
    }

    const bytes = await getObjectStorage().getObject(derivative.storageKey);

    let result: AnalysisResult;
    try {
      result = await analyzeImage(bytes, {
        provider: options.provider ?? new OpenRouterVisionProvider(),
        contentType: derivative.contentType ?? 'image/jpeg',
      });
    } catch (error) {
      if (!(error instanceof VisionCallError) && !(error instanceof UnusableVisionResponseError)) {
        // An unexpected fault (storage, database, a bug) is left to the worker's own
        // retry handling rather than being dressed up as a provider failure.
        throw error;
      }

      if (job.attempts < job.maxAttempts) {
        throw new RetryableJobError(`vision stage failed on attempt ${job.attempts}: ${error.message}`, {
          cause: error,
        });
      }

      await failScan(logger, scan, error.message);
      throw new PermanentJobError(`vision stage failed after ${job.attempts} attempts: ${error.message}`, {
        cause: error,
      });
    }

    const gate = result.imageQuality;
    if (!gate.usable || !gate.looks_like_home_mandir) {
      const reasons = [...gate.reasons];
      if (!gate.looks_like_home_mandir) reasons.push('not_a_home_mandir');
      if (!gate.usable && reasons.length === 0) reasons.push('unusable_image');

      await withTransaction(async (tx) => {
        // The gate's own answer is stored, so a refusal can be explained later without
        // paying for another call.
        await recordAnalysis(tx, { scanId, imageRevision, result });
        await setScanStatus(tx, scanId, 'needs_retake', { retakeReason: reasons });
        await releaseScanAllowance(tx, { userId: scan.userId, scanId });
      });

      logger.info(
        { jobId: job.id, scanId, reasons, attempts: job.attempts },
        'quality gate refused the photo; a retake was requested and the allowance released',
      );
      return;
    }

    await withTransaction(async (tx) => {
      await recordAnalysis(tx, { scanId, imageRevision, result });
      await setScanStatus(tx, scanId, 'awaiting_confirmation');
    });

    logger.info(
      {
        jobId: job.id,
        scanId,
        imageRevision,
        objects: result.observations.length,
        findings: result.findings.length,
        model: result.run.model,
        provider: result.run.provider,
        latencyMs: result.run.latencyMs,
        attempts: result.run.attempts,
        normalized: result.normalization.length,
        contractViolations: result.contractViolationList.length,
      },
      'scan analysed; awaiting confirmation',
    );
  };
}

/** Terminal provider failure: the scan is finished, and the user is not charged for it. */
async function failScan(logger: ReturnType<typeof getLogger>, scan: Scan, reason: string): Promise<void> {
  await withTransaction(async (tx) => {
    await setScanStatus(tx, scan.id, 'failed', { failedStage: FAILED_STAGE });
    await releaseScanAllowance(tx, { userId: scan.userId, scanId: scan.id });
  });
  logger.error(
    { scanId: scan.id, reason },
    'vision stage exhausted its attempts; scan failed and the allowance was released',
  );
}
