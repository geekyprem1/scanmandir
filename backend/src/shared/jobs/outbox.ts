import { withTransaction, type Queryable } from '../db/pool.js';
import { getLogger } from '../logger.js';
import { enqueueJob } from './queue.js';

export interface OutboxEventInput {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  /** Carried through to the job. Keep it to references, not image bytes or secrets. */
  payload?: Record<string, unknown>;
  /** Identifies the effect this event should cause exactly once. */
  dedupeKey: string;
}

/**
 * Appends an event in the caller's transaction. The point of the outbox is that a state
 * change and the promise to act on it commit or roll back together — there is no window
 * where the database says one thing and the queue says another.
 */
export async function appendOutboxEvent(tx: Queryable, input: OutboxEventInput): Promise<void> {
  await tx.query(
    `INSERT INTO outbox_events (event_type, aggregate_type, aggregate_id, payload, dedupe_key)
     VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [
      input.eventType,
      input.aggregateType,
      input.aggregateId,
      JSON.stringify(input.payload ?? {}),
      input.dedupeKey,
    ],
  );
}

/**
 * Maps an event type to the job type that should handle it.
 *
 * Kept as data rather than scattered conditionals so the full set of consequences of an
 * event is readable in one place. Real scan events join this table in later phases.
 */
const EVENT_TO_JOB: Record<string, string> = {
  'internal.echo.requested': 'internal.echo',
  // The analysis handler itself arrives with the vision stage (Phase 5). Until then the
  // job exists with no handler, which a running worker would fail permanently — and a
  // client can recover from with the retry endpoint once that lands.
  'scan.upload_verified': 'scan.analyze',
};

export interface DispatchResult {
  published: number;
  skipped: number;
  failed: number;
}

/**
 * Turns unpublished outbox events into jobs.
 *
 * Each event is handled in its own transaction with FOR UPDATE SKIP LOCKED, so several
 * dispatchers can run at once without publishing the same event twice. Enqueue is
 * idempotent on the dedupe key, so even a duplicated dispatch produces one job.
 */
export async function dispatchOutbox(limit: number): Promise<DispatchResult> {
  const logger = getLogger();
  const result: DispatchResult = { published: 0, skipped: 0, failed: 0 };

  for (let processed = 0; processed < limit; processed += 1) {
    const handled = await withTransaction(async (tx) => {
      const { rows } = await tx.query<{
        id: string;
        event_type: string;
        aggregate_type: string;
        aggregate_id: string;
        payload: Record<string, unknown>;
        dedupe_key: string;
      }>(
        `SELECT id, event_type, aggregate_type, aggregate_id, payload, dedupe_key
           FROM outbox_events
          WHERE published_at IS NULL
          ORDER BY id
          FOR UPDATE SKIP LOCKED
          LIMIT 1`,
      );

      const event = rows[0];
      if (!event) return false;

      const jobType = EVENT_TO_JOB[event.event_type];

      if (!jobType) {
        // An event with no consequence is published rather than retried forever, but it
        // is loud: it usually means a handler was forgotten.
        logger.warn({ eventType: event.event_type, eventId: event.id }, 'outbox event has no job mapping');
        await tx.query(
          `UPDATE outbox_events
              SET published_at = now(), publish_attempts = publish_attempts + 1,
                  last_error = 'no job mapping for event type'
            WHERE id = $1`,
          [event.id],
        );
        result.skipped += 1;
        return true;
      }

      await enqueueJob(tx, {
        jobType,
        dedupeKey: event.dedupe_key,
        payload: {
          ...event.payload,
          aggregateType: event.aggregate_type,
          aggregateId: event.aggregate_id,
          outboxEventId: event.id,
        },
      });

      await tx.query(
        `UPDATE outbox_events
            SET published_at = now(), publish_attempts = publish_attempts + 1, last_error = NULL
          WHERE id = $1`,
        [event.id],
      );

      result.published += 1;
      return true;
    }).catch((error: unknown) => {
      logger.error({ err: error }, 'outbox dispatch failed');
      result.failed += 1;
      return true;
    });

    if (!handled) break;
  }

  return result;
}
