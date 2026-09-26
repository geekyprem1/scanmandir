import { beforeEach, describe, expect, it } from 'vitest';
import { withTransaction } from '../../src/shared/db/pool.js';
import {
  claimJobs,
  completeJob,
  enqueueJob,
  failJob,
  reconcileAbandonedLeases,
} from '../../src/shared/jobs/queue.js';
import { countRows, expireLease, readJob, resetQueueTables } from './helpers.js';

const WORKER = 'test-worker';

beforeEach(async () => {
  await resetQueueTables();
});

async function enqueue(dedupeKey: string, maxAttempts = 3) {
  return withTransaction((tx) =>
    enqueueJob(tx, { jobType: 'internal.echo', dedupeKey, payload: { n: 1 }, maxAttempts }),
  );
}

describe('durable job queue', () => {
  it('is idempotent on the dedupe key', async () => {
    const first = await enqueue('same-key');
    const second = await enqueue('same-key');

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);
    expect(await countRows('jobs')).toBe(1);
  });

  it('rolls the enqueue back with its transaction', async () => {
    await expect(
      withTransaction(async (tx) => {
        await enqueueJob(tx, { jobType: 'internal.echo', dedupeKey: 'rolled-back' });
        throw new Error('caller failed after enqueueing');
      }),
    ).rejects.toThrow('caller failed after enqueueing');

    expect(await countRows('jobs')).toBe(0);
  });

  it('claims a due job once and takes a lease', async () => {
    const { id } = await enqueue('claim-once');

    const claimed = await claimJobs(WORKER, 5, 60_000);
    expect(claimed.map((job) => job.id)).toEqual([id]);
    expect(claimed[0]?.attempts).toBe(1);

    const state = await readJob(id);
    expect(state.status).toBe('running');
    expect(state.locked_by).toBe(WORKER);
    expect(state.lease_expires_at).not.toBeNull();

    // A second claim must not hand the same running job to another worker.
    expect(await claimJobs('other-worker', 5, 60_000)).toEqual([]);
  });

  it('does not claim a job scheduled for the future', async () => {
    await withTransaction((tx) =>
      enqueueJob(tx, {
        jobType: 'internal.echo',
        dedupeKey: 'later',
        runAfter: new Date(Date.now() + 60_000),
      }),
    );

    expect(await claimJobs(WORKER, 5, 60_000)).toEqual([]);
  });

  it('marks a completed job terminal', async () => {
    const { id } = await enqueue('completes');
    await claimJobs(WORKER, 5, 60_000);
    await completeJob(id);

    const state = await readJob(id);
    expect(state.status).toBe('succeeded');
    expect(state.finished_at).not.toBeNull();
    expect(state.locked_by).toBeNull();
    expect(state.lease_expires_at).toBeNull();
  });

  it('reschedules a retryable failure with a delay', async () => {
    await enqueue('retries', 3);
    const [job] = await claimJobs(WORKER, 5, 60_000);
    if (!job) throw new Error('expected a claimed job');

    const outcome = await failJob(job, { retryable: true, error: 'provider timeout' });
    expect(outcome).toBe('retrying');

    const state = await readJob(job.id);
    expect(state.status).toBe('pending');
    expect(state.attempts).toBe(1);
    expect(state.locked_by).toBeNull();
    expect(state.run_after.getTime()).toBeGreaterThan(Date.now());
    expect(state.last_error).toContain('provider timeout');
  });

  it('does not retry a permanent failure even with attempts remaining', async () => {
    await enqueue('permanent', 5);
    const [job] = await claimJobs(WORKER, 5, 60_000);
    if (!job) throw new Error('expected a claimed job');

    expect(await failJob(job, { retryable: false, error: 'unsupported image' })).toBe('failed');
    expect((await readJob(job.id)).status).toBe('failed');
  });

  it('stops retrying once the attempt budget is spent', async () => {
    await enqueue('bounded', 2);

    // Attempt 1: retried.
    const [first] = await claimJobs(WORKER, 5, 60_000);
    if (!first) throw new Error('expected a claimed job');
    expect(await failJob(first, { retryable: true, error: 'transient' })).toBe('retrying');

    // Make it due again without waiting out the backoff.
    await withTransaction((tx) => tx.query('UPDATE jobs SET run_after = now() WHERE id = $1', [first.id]));

    // Attempt 2 reaches max_attempts, so the same transient error is now terminal.
    const [second] = await claimJobs(WORKER, 5, 60_000);
    if (!second) throw new Error('expected a second claim');
    expect(second.attempts).toBe(2);
    expect(await failJob(second, { retryable: true, error: 'transient' })).toBe('failed');

    const state = await readJob(first.id);
    expect(state.status).toBe('failed');
    expect(state.attempts).toBe(2);
  });

  it('returns a job whose worker died to pending, keeping the spent attempt', async () => {
    const { id } = await enqueue('abandoned');
    await claimJobs(WORKER, 5, 60_000);
    await expireLease(id);

    expect(await reconcileAbandonedLeases()).toContain(id);

    const state = await readJob(id);
    expect(state.status).toBe('pending');
    expect(state.attempts).toBe(1);
    expect(state.locked_by).toBeNull();
    expect(state.last_error).toContain('lease expired');
  });

  it('leaves a live lease alone', async () => {
    const { id } = await enqueue('live-lease');
    await claimJobs(WORKER, 5, 60_000);

    expect(await reconcileAbandonedLeases()).toEqual([]);
    expect((await readJob(id)).status).toBe('running');
  });

  it('splits a batch across concurrent workers without overlap', async () => {
    for (let i = 0; i < 6; i += 1) {
      await enqueue(`batch-${i}`);
    }

    const [a, b] = await Promise.all([claimJobs('worker-a', 3, 60_000), claimJobs('worker-b', 3, 60_000)]);
    const ids = [...a, ...b].map((job) => job.id);

    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
  });
});
