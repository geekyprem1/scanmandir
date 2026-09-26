import pg from 'pg';
import { getConfig } from '../config.js';

export type QueryParam = string | number | boolean | Date | null | Buffer | object;

/** Accepts either the pool or a client inside a transaction, so repositories are transaction-agnostic. */
export interface Queryable {
  query<Row extends pg.QueryResultRow = pg.QueryResultRow>(
    sql: string,
    params?: QueryParam[],
  ): Promise<pg.QueryResult<Row>>;
}

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (pool) return pool;
  const config = getConfig();

  pool = new pg.Pool({
    connectionString: config.DATABASE_URL,
    max: config.DATABASE_POOL_MAX,
    application_name: 'scan-my-mandir',
  });

  // An idle client error must not take the process down silently.
  pool.on('error', (error) => {
    // Imported lazily to avoid a cycle between logger and config during startup.
    void import('../logger.js').then(({ getLogger }) => {
      getLogger().error({ err: error }, 'idle database client error');
    });
  });

  return pool;
}

export async function closePool(): Promise<void> {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end();
}

/**
 * Runs `fn` inside a transaction, committing on success and rolling back on any throw.
 *
 * This is the mechanism the transactional outbox depends on: a state change and its
 * outbox event must be written in one transaction (ARCHITECTURE.md section 6).
 */
export async function withTransaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // A rollback failure must not mask the original error.
    }
    throw error;
  } finally {
    client.release();
  }
}
