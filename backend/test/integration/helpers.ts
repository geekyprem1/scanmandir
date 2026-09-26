import { getPool } from '../../src/shared/db/pool.js';

/** Clears queue state between tests. Never call this against a non-test database. */
export async function resetQueueTables(): Promise<void> {
  await getPool().query('TRUNCATE jobs, outbox_events RESTART IDENTITY');
}

/** Clears identity rows between tests. Never call this against a non-test database. */
export async function resetIdentityTables(): Promise<void> {
  await getPool().query('TRUNCATE users CASCADE');
}

export async function countRows(table: 'jobs' | 'outbox_events'): Promise<number> {
  const { rows } = await getPool().query<{ count: string }>(`SELECT count(*)::text AS count FROM ${table}`);
  return Number(rows[0]?.count ?? '0');
}

export interface JobStateRow {
  status: string;
  attempts: number;
  run_after: Date;
  locked_by: string | null;
  lease_expires_at: Date | null;
  finished_at: Date | null;
  last_error: string | null;
}

export async function readJob(jobId: string): Promise<JobStateRow> {
  const { rows } = await getPool().query<JobStateRow>(
    `SELECT status, attempts, run_after, locked_by, lease_expires_at, finished_at, last_error
       FROM jobs WHERE id = $1`,
    [jobId],
  );
  const row = rows[0];
  if (!row) throw new Error(`job ${jobId} not found`);
  return row;
}

export async function expireLease(jobId: string): Promise<void> {
  await getPool().query(`UPDATE jobs SET lease_expires_at = now() - interval '1 minute' WHERE id = $1`, [
    jobId,
  ]);
}
