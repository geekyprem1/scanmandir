import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { getConfig } from '../shared/config.js';
import { getLogger } from '../shared/logger.js';
import { AppError, ERROR_CODES, toErrorResponse } from '../shared/errors.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerDevStorageRoutes } from './routes/dev-storage.js';
import type { AppServer } from './types.js';

/**
 * Builds the API without listening, so tests can drive it through server.inject().
 *
 * NOT YET PRESENT, and required before this serves any real user data:
 *   - authentication and session verification (P3-01)
 *   - per-object ownership checks (P3-04)
 *   - rate limiting and abuse controls (P3-07)
 *
 * Every route registered today is either a health probe or a development-only storage
 * endpoint guarded by an HMAC signature. Do not add a route that reads or writes user
 * data until the three items above exist.
 */
export async function buildServer(): Promise<AppServer> {
  const config = getConfig();
  const logger = getLogger();

  const server = Fastify({
    loggerInstance: logger,
    // Correlation IDs, so logs can be joined without recording request contents.
    genReqId: (request) => {
      const header = request.headers['x-request-id'];
      if (typeof header === 'string' && header.length > 0 && header.length <= 128) return header;
      return randomUUID();
    },
    // Request logging stays on. It records method, URL, status and a correlation ID —
    // never bodies, so photos and tokens cannot reach the logs this way.
    bodyLimit: 12 * 1024 * 1024,
    trustProxy: config.isProduction,
  });

  server.setErrorHandler((error, request, reply) => {
    const isExpected = error instanceof AppError;

    if (isExpected) {
      request.log.info({ code: error.code, reqId: request.id }, 'request rejected');
    } else {
      // Full detail goes to the log; the client gets a generic INTERNAL response.
      request.log.error({ err: error, reqId: request.id }, 'unhandled request error');
    }

    const { status, body } = toErrorResponse(error, request.id);
    return reply.code(status).send(body);
  });

  server.setNotFoundHandler((request, reply) => {
    const { status, body } = toErrorResponse(
      new AppError(ERROR_CODES.NOT_FOUND, 'Route not found.'),
      request.id,
    );
    return reply.code(status).send(body);
  });

  await registerHealthRoutes(server);

  if (!config.isProduction) {
    await registerDevStorageRoutes(server);
  }

  return server;
}
