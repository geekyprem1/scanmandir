import { getConfig } from '../shared/config.js';
import { getLogger } from '../shared/logger.js';
import { closePool } from '../shared/db/pool.js';
import { buildServer } from './server.js';

const config = getConfig();
const logger = getLogger();

const server = await buildServer();

try {
  await server.listen({ host: config.API_HOST, port: config.API_PORT });
  logger.info({ host: config.API_HOST, port: config.API_PORT, env: config.NODE_ENV }, 'api listening');
} catch (error) {
  logger.error({ err: error }, 'api failed to start');
  process.exit(1);
}

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'api shutting down');
  try {
    // Lets in-flight requests finish before the pool closes under them.
    await server.close();
    await closePool();
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, 'shutdown failed');
    process.exit(1);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'unhandled rejection in api');
});
