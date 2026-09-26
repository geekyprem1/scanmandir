import { getPool, type Queryable } from '../db/pool.js';
import { getConfig } from '../config.js';
import type { JobRecord } from './types.js';

interface JobRow {
  id: string;
  job_type: string;
  dedupe_key: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

function toRecord(row: JobRow): JobRecord {
  return {
    id: row.id,
    jobType: row.job_type,
    dedupeKey: row.dedupe_key,
    payload: row.payload,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
  };
}

export interface EnqueueInput {
  jobType: string;
  /** Identifies the logical work. Reusing it is a no-op, which is how duplicate requests stay harmless. */
  dedupeKey: string;
  payload?: Record<string, unknown>;
  runAfter?: Date;
  maxAttempts?: number;
}

export interface EnqueueResult {
  id: string;
  /** False when a job with this dedupe key already existed, in any status. */
  created: boolean;
}

/**
 * Idempotent enqueue. Pass the transaction that also writes the state change so the
 * two commit together.
 */
export async function enqueueJob(tx: Queryable, input: EnqueueInput): Promise<EnqueueResult> {
  const maxAttempts = input.maxAttempts ?? getConfig().JOB_MAX_ATTEMPTS;

  const inserted = await tx.query<{ id: string }>(
    `INSERT INTO jobs (job_type, dedupe_key, payload, max_attempts, run_after)
     VALUES ($1, $2, $3::jsonb, $4, COALESCE($5, now()))
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING id`,
    [
      input.jobType,
      input.dedupeKey,
      JSON.stringify(input.payload ?? {}),
      maxAttempts,
      input.runAfter ?? null,
    ],
  );

  const insertedId = inserted.rows[0]?.id;
  if (insertedId) {
    return { id: insertedId, created: true };
  }

  const existing = await tx.query<{ id: string }>('SELECT id FROM jobs WHERE dedupe_key = $1', [
    input.dedupeKey,
  ]);
  const existingId = existing.rows[0]?.id;
  if (!existingId) {
    // Only reachable if the conflicting row disappeared between the two statements.
    throw new Error(`enqueue conflicted on dedupe key ${input.dedupeKey} but no job was found`);
  }
  return { id: existingId, created: false };
}

/**
 * Claims up to `limit` due jobs for this worker.
 *
 * FOR UPDATE SKIP LOCKED lets several workers claim disjoint batches without blocking
 * each other. The attempt counter increments at claim time rather than at completion,
 * so a worker that dies mid-job still consumes an attempt and cannot loop forever.
 */
export async function claimJobs(workerId: string, limit: number, leaseMs: number): Promise<JobRecord[]> {
  const { rows } = await getPool().query<JobRow>(
    `UPDATE jobs AS j
        SET status = 'running',
            attempts = j.attempts + 1,
            locked_by = $1,
            lease_expires_at = now() + make_interval(secs => $2::double precision),
            updated_at = now()
      WHERE j.id IN (
            SELECT id FROM jobs
             WHERE status = 'pending' AND run_after <= now()
             ORDER BY run_after
             FOR UPDATE SKIP LOCKED
             LIMIT $3
      )
      RETURNING j.id, j.job_type, j.dedupe_key, j.payload, j.attempts, j.max_attempts`,
    [workerId, leaseMs / 1000, limit],
  );
  return rows.map(toRecord);
}

export async function completeJob(jobId: string): Promise<void> {
  await getPool().query(
    `UPDATE jobs
        SET status = 'succeeded', finished_at = now(), updated_at = now(),
            locked_by = NULL, lease_expires_at = NULL, last_error = NULL
      WHERE id = $1`,
    [jobId],
  );
}

/** Exponential backoff with jitter, capped so a slow provider cannot push work far into the future. */
export function backoffSeconds(attempts: number): number {
  const base = Math.min(300, 2 ** Math.max(0, attempts - 1) * 2);
  return base + Math.random() * Math.min(30, base);
}

export interface FailJobOptions {
  retryable: boolean;
  /** Stored for diagnosis. Keep provider bodies and stack traces out of it. */
  error: string;
}

/**
 * Records a failure. The job returns to `pending` with backoff while attempts remain
 * and the failure is retryable; otherwise it becomes terminal `failed`.
 */
export async function failJob(job: JobRecord, options: FailJobOptions): Promise<'retrying' | 'failed'> {
  const exhausted = job.attempts >= job.maxAttempts;
  const willRetry = options.retryable && !exhausted;

  if (willRetry) {
    await getPool().query(
      `UPDATE jobs
          SET status = 'pending',
              locked_by = NULL,
              lease_expires_at = NULL,
              run_after = now() + make_interval(secs => $2::double precision),
              last_error = $3,
              updated_at = now()
        WHERE id = $1`,
      [job.id, backoffSeconds(job.attempts), options.error.slice(0, 2000)],
    );
    return 'retrying';
  }

  await getPool().query(
    `UPDATE jobs
        SET status = 'failed',
            locked_by = NULL,
            lease_expires_at = NULL,
            finished_at = now(),
            last_error = $2,
            updated_at = now()
      WHERE id = $1`,
    [job.id, options.error.slice(0, 2000)],
  );
  return 'failed';
}

/**
 * Returns jobs whose worker died while holding a lease. Runs periodically; without it
 * a crashed worker's in-flight jobs would sit in `running` forever.
 */
export async function reconcileAbandonedLeases(): Promise<string[]> {
  const { rows } = await getPool().query<{ id: string }>(
    `UPDATE jobs
        SET status = 'pending',
            locked_by = NULL,
            lease_expires_at = NULL,
            last_error = COALESCE(last_error, 'lease expired; worker presumed lost'),
            updated_at = now()
      WHERE status = 'running' AND lease_expires_at < now()
      RETURNING id`,
  );
  return rows.map((row) => row.id);
}
