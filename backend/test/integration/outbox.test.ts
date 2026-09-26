import { beforeEach, describe, expect, it } from 'vitest';
import { getPool, withTransaction } from '../../src/shared/db/pool.js';
import { appendOutboxEvent, dispatchOutbox } from '../../src/shared/jobs/outbox.js';
import { countRows, resetQueueTables } from './helpers.js';

beforeEach(async () => {
  await resetQueueTables();
});

async function append(dedupeKey: string, eventType = 'internal.echo.requested') {
  await withTransaction((tx) =>
    appendOutboxEvent(tx, {
      eventType,
      aggregateType: 'internal',
      aggregateId: dedupeKey,
      dedupeKey,
      payload: { message: 'hello' },
    }),
  );
}

async function readEvent(dedupeKey: string) {
  const { rows } = await getPool().query<{
    published_at: Date | null;
    publish_attempts: number;
    last_error: string | null;
  }>('SELECT published_at, publish_attempts, last_error FROM outbox_events WHERE dedupe_key = $1', [
    dedupeKey,
  ]);
  const row = rows[0];
  if (!row) throw new Error(`event ${dedupeKey} not found`);
  return row;
}

describe('transactional outbox', () => {
  it('commits the event with its transaction and nothing without it', async () => {
    await expect(
      withTransaction(async (tx) => {
        await appendOutboxEvent(tx, {
          eventType: 'internal.echo.requested',
          aggregateType: 'internal',
          aggregateId: 'rolled-back',
          dedupeKey: 'rolled-back',
        });
        throw new Error('state change failed');
      }),
    ).rejects.toThrow('state change failed');

    expect(await countRows('outbox_events')).toBe(0);
    expect(await countRows('jobs')).toBe(0);
  });

  it('turns an unpublished event into a job', async () => {
    await append('event-1');

    const result = await dispatchOutbox(10);
    expect(result.published).toBe(1);
    expect(await countRows('jobs')).toBe(1);

    const { rows } = await getPool().query<{
      job_type: string;
      dedupe_key: string;
      payload: Record<string, unknown>;
    }>('SELECT job_type, dedupe_key, payload FROM jobs');
    expect(rows[0]?.job_type).toBe('internal.echo');
    expect(rows[0]?.dedupe_key).toBe('event-1');
    // The aggregate reference travels with the job so the handler can find its subject.
    expect(rows[0]?.payload.aggregateId).toBe('event-1');
    expect(rows[0]?.payload.message).toBe('hello');

    expect((await readEvent('event-1')).published_at).not.toBeNull();
  });

  it('does not publish an event twice', async () => {
    await append('event-2');

    const first = await dispatchOutbox(10);
    const second = await dispatchOutbox(10);

    expect(first.published).toBe(1);
    expect(second.published).toBe(0);
    expect(await countRows('jobs')).toBe(1);
  });

  it('produces one job when the same effect is requested twice', async () => {
    // Two separate events that describe the same effect, for example a duplicated tap.
    await append('same-effect');
    await withTransaction((tx) =>
      appendOutboxEvent(tx, {
        eventType: 'internal.echo.requested',
        aggregateType: 'internal',
        aggregateId: 'same-effect',
        dedupeKey: 'same-effect',
      }),
    );

    expect(await countRows('outbox_events')).toBe(2);

    const result = await dispatchOutbox(10);
    expect(result.published).toBe(2);
    // Both events publish, but the queue collapses them into a single unit of work.
    expect(await countRows('jobs')).toBe(1);
  });

  it('marks an event with no job mapping as handled instead of retrying forever', async () => {
    await append('unmapped', 'something.nobody.handles');

    const result = await dispatchOutbox(10);
    expect(result.skipped).toBe(1);
    expect(await countRows('jobs')).toBe(0);

    const event = await readEvent('unmapped');
    expect(event.published_at).not.toBeNull();
    expect(event.last_error).toContain('no job mapping');
  });

  it('dispatches in order and respects the batch limit', async () => {
    for (let i = 0; i < 5; i += 1) {
      await append(`ordered-${i}`);
    }

    const result = await dispatchOutbox(2);
    expect(result.published).toBe(2);
    expect(await countRows('jobs')).toBe(2);

    const { rows } = await getPool().query<{ dedupe_key: string }>(
      'SELECT dedupe_key FROM jobs ORDER BY created_at',
    );
    expect(rows.map((row) => row.dedupe_key)).toEqual(['ordered-0', 'ordered-1']);
  });
});
