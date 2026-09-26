import { AppError, ERROR_CODES } from '../../shared/errors.js';
import type { AppServer } from '../types.js';

/**
 * The caller's own identity, as carried by their verified session.
 *
 * Deliberately token-only for now: profile and preferences storage (P3-05) and the
 * ownership model (P3-04) build on this endpoint rather than changing its shape.
 */
export async function registerMeRoutes(server: AppServer): Promise<void> {
  server.get('/me', { preHandler: server.authenticate }, async (request) => {
    const user = request.user;
    if (!user) {
      // The guard ran but established nothing: a wiring bug, not a client mistake.
      throw new AppError(ERROR_CODES.INTERNAL, 'Request identity was not established.');
    }

    return { id: user.id, isAnonymous: user.isAnonymous };
  });
}
