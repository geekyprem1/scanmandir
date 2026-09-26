import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { findUserById, updateProfile, type AppUser } from '../../modules/identity/user_repository.js';
import { AppError, ERROR_CODES } from '../../shared/errors.js';
import type { AuthenticatedUser } from '../plugins/auth.js';
import type { AppServer } from '../types.js';

/**
 * The caller's own profile (P3-05). Quota and entitlements join this shape in P10;
 * nothing here is invented ahead of them.
 */
function profileBody(user: AppUser): Record<string, unknown> {
  return {
    id: user.id,
    isAnonymous: user.isAnonymous,
    language: user.language,
    createdAt: user.createdAt.toISOString(),
  };
}

/** Rejects unknown keys on purpose: a silently ignored typo is worse than a 400. */
const PatchProfileSchema = z.object({ language: z.enum(['en', 'hi']) }).strict();

/** The guard ran, so this cannot be absent — a missing caller is a wiring bug. */
function requireCaller(request: FastifyRequest): AuthenticatedUser {
  const caller = request.user;
  if (!caller) {
    throw new AppError(ERROR_CODES.INTERNAL, 'Request identity was not established.');
  }
  return caller;
}

export async function registerMeRoutes(server: AppServer): Promise<void> {
  server.get('/v1/me', { preHandler: server.authenticate }, async (request) => {
    const caller = requireCaller(request);
    const user = await findUserById(caller.id);
    if (!user) {
      // The guard just provisioned this row, so a miss means it was deleted mid-request.
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Profile not found.');
    }
    return profileBody(user);
  });

  server.patch('/v1/me', { preHandler: server.authenticate }, async (request) => {
    const caller = requireCaller(request);

    const parsed = PatchProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'Unsupported profile update.', {
        details: {
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      });
    }

    const updated = await updateProfile(caller.id, parsed.data);
    if (!updated) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Profile not found.');
    }
    return profileBody(updated);
  });
}
