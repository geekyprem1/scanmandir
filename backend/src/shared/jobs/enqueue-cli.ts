import { randomUUID } from 'node:crypto';
import { withTransaction, closePool } from '../db/pool.js';
import { getLogger } from '../logger.js';
import { appendOutboxEvent } from './outbox.js';
import { enqueueJob } from './queue.js';
import { INTERNAL_ECHO_JOB } from '../../worker/handlers/internal-echo.js';

/**
 * Manual check that the Phase 1 pipeline works:
 *
 *   npm run enqueue:demo                      via the outbox, the production path
 *   npm run enqueue:demo -- --direct          straight into the queue
 *   npm run enqueue:demo -- --fail=retryable  exercises bounded retry
 *   npm run enqueue:demo -- --key=fixed-key   run twice to prove dedupe
 */
const args = process.argv.slice(2);
const direct = args.includes('--direct');
const fail = args.find((a) => a.startsWith('--fail='))?.split('=')[1] ?? null;
const key = args.find((a) => a.startsWith('--key='))?.split('=')[1] ?? `demo-${randomUUID()}`;

const logger = getLogger();

try {
  const payload: Record<string, unknown> = { message: 'hello from enqueue-cli' };
  if (fail) payload.fail = fail;

  await withTransaction(async (tx) => {
    if (direct) {
      const result = await enqueueJob(tx, {
        jobType: INTERNAL_ECHO_JOB,
        dedupeKey: key,
        payload,
      });
      logger.info({ jobId: result.id, created: result.created, dedupeKey: key }, 'job enqueued directly');
      return;
    }

    await appendOutboxEvent(tx, {
      eventType: 'internal.echo.requested',
      aggregateType: 'internal',
      aggregateId: key,
      dedupeKey: key,
      payload,
    });
    logger.info({ dedupeKey: key }, 'outbox event appended; the worker dispatcher will create the job');
  });
} catch (error) {
  logger.error({ err: error }, 'enqueue failed');
  process.exitCode = 1;
} finally {
  await closePool();
}
