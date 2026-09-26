import { getLogger } from '../shared/logger.js';
import { closePool } from '../shared/db/pool.js';
import { registeredJobTypes } from '../shared/jobs/registry.js';
import { registerAllJobHandlers } from './handlers/index.js';
import { startWorker } from './runner.js';

const logger = getLogger();

registerAllJobHandlers();
logger.info({ jobTypes: registeredJobTypes() }, 'job handlers registered');

const worker = startWorker();

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'worker shutting down');

  // Finish the current tick rather than abandoning a leased job mid-flight.
  await worker.stop();
  await closePool();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'unhandled rejection in worker');
});
