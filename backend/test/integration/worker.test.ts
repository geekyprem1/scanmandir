import { beforeEach, describe, expect, it } from 'vitest';
import { withTransaction } from '../../src/shared/db/pool.js';
import { appendOutboxEvent } from '../../src/shared/jobs/outbox.js';
import { enqueueJob } from '../../src/shared/jobs/queue.js';
import { clearJobHandlers } from '../../src/shared/jobs/registry.js';
import { registerAllJobHandlers } from '../../src/worker/handlers/index.js';
import { tick } from '../../src/worker/runner.js';
import { readJob, resetQueueTables } from './helpers.js';

const WORKER = 'integration-worker';

beforeEach(async () => {
  await resetQueueTables();
  clearJobHandlers();
  registerAllJobHandlers();
});

describe('worker pipeline', () => {
  it('carries an outbox event through to a completed job in one tick', async () => {
    await withTransaction((tx) =>
      appendOutboxEvent(tx, {
        eventType: 'internal.echo.requested',
        aggregateType: 'internal',
        aggregateId: 'e2e-1',
        dedupeKey: 'e2e-1',
        payload: { message: 'end to end' },
      }),
    );

    const result = await tick(WORKER);

    expect(result.dispatched).toBe(1);
    expect(result.processed).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
  });

  it('retries a transient handler failure and stops at the attempt budget', async () => {
    const { id } = await withTransaction((tx) =>
      enqueueJob(tx, {
        jobType: 'internal.echo',
        dedupeKey: 'always-transient',
        payload: { fail: 'retryable' },
        maxAttempts: 2,
      }),
    );

    const first = await tick(WORKER);
    expect(first.retrying).toBe(1);
    expect((await readJob(id)).status).toBe('pending');

    // Skip the backoff wait rather than sleeping through it.
    await withTransaction((tx) => tx.query('UPDATE jobs SET run_after = now() WHERE id = $1', [id]));

    const second = await tick(WORKER);
    expect(second.failed).toBe(1);

    const state = await readJob(id);
    expect(state.status).toBe('failed');
    expect(state.attempts).toBe(2);
  });

  it('fails a permanent handler error immediately', async () => {
    const { id } = await withTransaction((tx) =>
      enqueueJob(tx, {
        jobType: 'internal.echo',
        dedupeKey: 'permanent-fail',
        payload: { fail: 'permanent' },
        maxAttempts: 5,
      }),
    );

    const result = await tick(WORKER);
    expect(result.failed).toBe(1);

    const state = await readJob(id);
    expect(state.status).toBe('failed');
    // Terminal on the first attempt, with four attempts still unused.
    expect(state.attempts).toBe(1);
  });

  it('fails a job whose type has no handler instead of leaving it running', async () => {
    const { id } = await withTransaction((tx) =>
      enqueueJob(tx, { jobType: 'nobody.handles.this', dedupeKey: 'no-handler' }),
    );

    const result = await tick(WORKER);
    expect(result.failed).toBe(1);

    const state = await readJob(id);
    expect(state.status).toBe('failed');
    expect(state.last_error).toContain('no handler registered');
  });

  it('processes nothing and reports nothing when the queue is empty', async () => {
    const result = await tick(WORKER);
    expect(result).toEqual({ dispatched: 0, processed: 0, succeeded: 0, retrying: 0, failed: 0 });
  });
});
