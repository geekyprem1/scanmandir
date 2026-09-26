import { getPool } from '../../shared/db/pool.js';
import { getObjectStorage } from '../../shared/storage/index.js';
import type { AppServer } from '../types.js';

const startedAt = Date.now();

/**
 * Two separate checks, because they answer different questions:
 *
 *   /health       is this process alive? No dependencies touched, so a database blip
 *                 cannot cause an orchestrator to kill a healthy container.
 *   /health/ready can it serve traffic? Dependencies are checked.
 */
export async function registerHealthRoutes(server: AppServer): Promise<void> {
  server.get('/health', async () => ({
    status: 'ok',
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
  }));

  server.get('/health/ready', async (_request, reply) => {
    const checks: Record<string, 'ok' | 'failed'> = {};

    try {
      await getPool().query('SELECT 1');
      checks.database = 'ok';
    } catch {
      checks.database = 'failed';
    }

    try {
      // Confirms the driver is constructible and its root is reachable.
      await getObjectStorage().headObject('healthcheck/probe');
      checks.storage = 'ok';
    } catch {
      checks.storage = 'failed';
    }

    const ready = Object.values(checks).every((value) => value === 'ok');
    return reply.code(ready ? 200 : 503).send({ status: ready ? 'ready' : 'not_ready', checks });
  });
}
