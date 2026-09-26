import { getPool, withTransaction } from '../../shared/db/pool.js';
import { PermanentJobError, type JobHandler } from '../../shared/jobs/types.js';
import { getLogger } from '../../shared/logger.js';
import { consumeAllowance, findReservationPeriod, reservationKeyFor } from '../../modules/billing/quota.js';
import { findScanInput } from '../../modules/scans/confirmation_repository.js';
import { findScanById, setScanStatus } from '../../modules/scans/scan_repository.js';
import { buildReport, insertReport } from '../../modules/reports/report_builder.js';
import { findLatestAnalysis } from '../../modules/vision/repository.js';

export const SCAN_GENERATE_REPORT_JOB = 'scan.generate_report';

/**
 * Turns a confirmed input revision into the report the user reads (ARCHITECTURE.md section
 * 6, step 8).
 *
 * Three things happen exactly once for a revision and together: the report is stored, the
 * scan becomes `completed`, and the allowance reservation is consumed. The unique index on
 * the report is what makes a redelivery harmless, and the ledger's operation key is what
 * makes consuming twice impossible.
 *
 * A job whose input revision is no longer the scan's is skipped rather than failed: the
 * user confirmed again, so this one is history and the newer job will do the work.
 */
export const scanGenerateReportHandler: JobHandler = async (job) => {
  const logger = getLogger();

  const scanId = typeof job.payload.scanId === 'string' ? job.payload.scanId : '';
  const inputRevision = Number(job.payload.inputRevision);
  if (scanId === '' || !Number.isInteger(inputRevision) || inputRevision <= 0) {
    throw new PermanentJobError('scan.generate_report needs a scanId and a positive inputRevision.');
  }

  const pool = getPool();
  const scan = await findScanById(pool, scanId);

  if (!scan || scan.deletedAt) {
    logger.info({ jobId: job.id, scanId }, 'report skipped: scan is gone or deleted');
    return;
  }
  if (scan.status !== 'generating_report') {
    logger.info(
      { jobId: job.id, scanId, status: scan.status },
      'report skipped: scan is not generating a report',
    );
    return;
  }
  if (scan.inputRevision !== inputRevision) {
    logger.info(
      { jobId: job.id, scanId, jobInputRevision: inputRevision, scanInputRevision: scan.inputRevision },
      'report skipped: a newer confirmed revision exists',
    );
    return;
  }

  const input = await findScanInput(pool, scanId, scan.inputRevision);
  if (!input) {
    throw new PermanentJobError(
      `scan ${scanId} is generating a report from input revision ${scan.inputRevision}, which is not stored.`,
    );
  }

  // Findings live on the analysis rather than the confirmed input: they describe what the
  // model saw, and the report keeps only the ones that still refer to a confirmed item.
  const analysis = await findLatestAnalysis(pool, scanId, scan.imageRevision);

  const body = buildReport({
    scanId,
    inputRevision: input.inputRevision,
    imageRevision: input.imageRevision,
    objects: input.objects,
    analysis,
  });

  const outcome = await withTransaction(async (tx) => {
    const stored = await insertReport(tx, {
      scanId,
      inputRevision: input.inputRevision,
      imageRevision: input.imageRevision,
      body,
    });
    if (!stored.created) {
      // Already generated for this revision: the scan is completed and the ledger already
      // has its consume row.
      return { reportId: stored.id, alreadyGenerated: true };
    }

    const reservationKey = reservationKeyFor(scanId);
    const period = await findReservationPeriod(tx, reservationKey);
    if (!period) {
      // Creation always reserves before a scan exists, so this means the ledger was
      // tampered with. Rolling back leaves the scan generating a report it can retry,
      // which is better than completing a scan nothing was ever charged for.
      throw new PermanentJobError(`scan ${scanId} has no allowance reservation to consume.`);
    }

    await setScanStatus(tx, scanId, 'completed');
    await consumeAllowance(tx, {
      userId: scan.userId,
      scanId,
      reservationKey,
      operationKey: `scan:${scanId}:consume`,
      period,
    });

    return { reportId: stored.id, alreadyGenerated: false };
  });

  logger.info(
    {
      jobId: job.id,
      scanId,
      inputRevision: input.inputRevision,
      reportId: outcome.reportId,
      alreadyGenerated: outcome.alreadyGenerated,
      items: body.summary.items,
      needingCheck: body.summary.itemsNeedingCheck,
      findings: body.visualFindings.length,
    },
    outcome.alreadyGenerated ? 'report already generated' : 'report generated; scan completed',
  );
};
