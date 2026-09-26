import { runMigrations } from './migrate.js';
import { closePool } from './pool.js';
import { getLogger } from '../logger.js';

const logger = getLogger();

try {
  const result = await runMigrations();
  if (result.applied.length === 0) {
    logger.info({ alreadyApplied: result.alreadyApplied.length }, 'database already up to date');
  } else {
    logger.info({ applied: result.applied }, 'migrations complete');
  }
} catch (error) {
  logger.error({ err: error }, 'migration failed');
  process.exitCode = 1;
} finally {
  await closePool();
}
