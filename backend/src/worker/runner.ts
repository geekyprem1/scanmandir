import { randomUUID } from 'node:crypto';
import { getConfig } from '../shared/config.js';
import { getLogger } from '../shared/logger.js';
import { claimJobs, completeJob, failJob, reconcileAbandonedLeases } from '../shared/jobs/queue.js';
import { dispatchOutbox } from '../shared/jobs/outbox.js';
import { resolveJobHandler } from '../shared/jobs/registry.js';
import { PermanentJobError, RetryableJobError, type JobRecord } from '../shared/jobs/types.js';

export interface TickResult {
  dispatched: number;
  processed: number;
  succeeded: number;
  retrying: number;
  failed: number;
}

/**
 * Decides whether a thrown error should be retried.
 *
 * Unrecognized errors are treated as retryable on purpose: a transient bug or a
 * momentary infrastructure fault should get another chance, and the bounded attempt
 * budget stops that from becoming an infinite loop. Handlers that know a failure is
 * permanent say so with PermanentJobError.
 */
function isRetryable(error: unknown): boolean {
  if (error instanceof PermanentJobError) return false;
  if (error instanceof RetryableJobError) return true;
  return true;
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

export async function runOneJob(job: JobRecord): Promise<'succeeded' | 'retrying' | 'failed'> {
  const logger = getLogger();
  const handler = resolveJobHandler(job.jobType);

  if (!handler) {
    // An unknown job type will not become known by retrying this process.
    logger.error({ jobId: job.id, jobType: job.jobType }, 'no handler registered for job type');
    await failJob(job, { retryable: false, error: `no handler registered for ${job.jobType}` });
    return 'failed';
  }

  try {
    await handler(job);
    await completeJob(job.id);
    return 'succeeded';
  } catch (error) {
    const outcome = await failJob(job, {
      retryable: isRetryable(error),
      error: describeError(error),
    });
    logger.warn(
      { jobId: job.id, jobType: job.jobType, attempts: job.attempts, outcome, err: error },
      'job failed',
    );
    return outcome;
  }
}

/** One cycle: reclaim abandoned leases, publish outbox events, then run claimed jobs. */
export async function tick(workerId: string): Promise<TickResult> {
  const config = getConfig();
  const logger = getLogger();

  const reclaimed = await reconcileAbandonedLeases();
  if (reclaimed.length > 0) {
    logger.warn({ count: reclaimed.length }, 'returned abandoned jobs to pending');
  }

  const dispatch = await dispatchOutbox(config.WORKER_BATCH_SIZE);
  const jobs = await claimJobs(workerId, config.WORKER_BATCH_SIZE, config.WORKER_LEASE_MS);

  const result: TickResult = {
    dispatched: dispatch.published,
    processed: jobs.length,
    succeeded: 0,
    retrying: 0,
    failed: 0,
  };

  for (const job of jobs) {
    const outcome = await runOneJob(job);
    if (outcome === 'succeeded') result.succeeded += 1;
    else if (outcome === 'retrying') result.retrying += 1;
    else result.failed += 1;
  }

  return result;
}

export interface WorkerHandle {
  readonly workerId: string;
  stop(): Promise<void>;
}

export function startWorker(): WorkerHandle {
  const config = getConfig();
  const logger = getLogger();
  const workerId = `worker-${process.pid}-${randomUUID().slice(0, 8)}`;

  let stopping = false;
  let idle: Promise<void> = Promise.resolve();

  const loop = async (): Promise<void> => {
    logger.info({ workerId, pollIntervalMs: config.WORKER_POLL_INTERVAL_MS }, 'worker started');

    while (!stopping) {
      try {
        const result = await tick(workerId);
        if (result.processed > 0 || result.dispatched > 0) {
          logger.debug({ workerId, ...result }, 'worker tick');
        }
        if (result.processed === 0) {
          await sleep(config.WORKER_POLL_INTERVAL_MS);
        }
      } catch (error) {
        // A failure in the loop itself, such as the database being unreachable. Back off
        // rather than spinning.
        logger.error({ workerId, err: error }, 'worker tick failed');
        await sleep(Math.max(config.WORKER_POLL_INTERVAL_MS, 5000));
      }
    }

    logger.info({ workerId }, 'worker stopped');
  };

  idle = loop();

  return {
    workerId,
    async stop() {
      stopping = true;
      await idle;
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
