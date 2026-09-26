import { runMigrations } from '../../src/shared/db/migrate.js';
import { closePool, getPool } from '../../src/shared/db/pool.js';
import { resetConfigCache } from '../../src/shared/config.js';
import { TEST_DATABASE_URL } from './database-url.js';

/**
 * Runs once for the whole integration project: confirm the test database is reachable,
 * then bring its schema up to date.
 *
 * globalSetup executes in Vitest's main process, where the project's `test.env` block
 * does not apply, so the environment is set here. getConfig() is lazy, so assigning
 * before the first database call is enough.
 *
 * A missing database is reported as a setup problem rather than a wall of failing
 * assertions, because the usual cause is simply that the containers are not running.
 */
export async function setup(): Promise<void> {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  resetConfigCache();

  try {
    await getPool().query('SELECT 1');
  } catch (error) {
    throw new Error(
      [
        'Integration tests need the test PostgreSQL instance.',
        'Start it with:  docker compose -f infra/docker-compose.yml up -d postgres_test',
        `Tried: ${TEST_DATABASE_URL}`,
        `Connection failed: ${String(error)}`,
      ].join('\n'),
    );
  }

  await runMigrations();
}

export async function teardown(): Promise<void> {
  await closePool();
}
