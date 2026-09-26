import { getLogger } from '../../shared/logger.js';
import { PermanentJobError, RetryableJobError, type JobHandler } from '../../shared/jobs/types.js';

export const INTERNAL_ECHO_JOB = 'internal.echo';

/**
 * The only handler in Phase 1. It exists so the queue, lease, retry and outbox machinery
 * can be exercised end to end before any real analysis code exists, and so the Phase 1
 * completion criterion "a worker can process an internal job" is actually testable.
 *
 * Setting payload.fail to 'retryable' or 'permanent' drives the two failure paths.
 * Remove this handler once real job types exist.
 */
export const internalEchoHandler: JobHandler = async (job) => {
  const logger = getLogger();
  const fail = job.payload.fail;

  if (fail === 'retryable') {
    throw new RetryableJobError(`internal echo asked to fail transiently (attempt ${job.attempts})`);
  }
  if (fail === 'permanent') {
    throw new PermanentJobError('internal echo asked to fail permanently');
  }

  logger.info(
    { jobId: job.id, dedupeKey: job.dedupeKey, attempts: job.attempts, message: job.payload.message ?? null },
    'internal echo job processed',
  );
};
