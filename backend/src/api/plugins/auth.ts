import type { FastifyReply, FastifyRequest } from 'fastify';
import type { JWTVerifyGetKey } from 'jose';
import { ensureUser } from '../../modules/identity/user_repository.js';
import { createTokenVerifier } from '../../shared/auth/verify.js';
import { getConfig } from '../../shared/config.js';
import { AppError, ERROR_CODES } from '../../shared/errors.js';
import type { AppServer } from '../types.js';

/**
 * The authenticated caller.
 *
 * `id` is the internal user id from `users`. Owned records reference it, and every
 * ownership check compares against it — never against [identitySubject], which exists
 * only so the token can be mapped (ARCHITECTURE.md section 9).
 */
export interface AuthenticatedUser {
  id: string;
  identitySubject: string;
  isAnonymous: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by [FastifyInstance.authenticate]; absent on public routes. */
    user?: AuthenticatedUser;
  }

  interface FastifyInstance {
    /** preHandler that requires a valid session and populates `request.user`. */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export interface AuthPluginOptions {
  /**
   * Overrides key lookup for tests. Production verification reads the Supabase
   * project's JWKS endpoint (docs/decisions.md D-15).
   */
  keyResolver?: JWTVerifyGetKey | undefined;
}

/**
 * The caller established by [FastifyInstance.authenticate].
 *
 * The guard ran, so this cannot be absent on a guarded route — a missing caller is a
 * wiring bug, not a client error.
 */
export function requireCaller(request: FastifyRequest): AuthenticatedUser {
  const caller = request.user;
  if (!caller) {
    throw new AppError(ERROR_CODES.INTERNAL, 'Request identity was not established.');
  }
  return caller;
}

/**
 * Registers session verification. Routes opt in per route:
 *
 *   server.get('/v1/me', { preHandler: server.authenticate }, handler)
 *
 * A missing or malformed token is always UNAUTHENTICATED — never a silent anonymous
 * fallback, because every route that uses this guard is asking for a real identity.
 *
 * The guard also resolves (and on first sight provisions) the internal user, so a
 * handler cannot accidentally treat the provider subject as an owner id.
 */
export async function registerAuth(server: AppServer, options: AuthPluginOptions = {}): Promise<void> {
  const config = getConfig();
  const verifyAccessToken = createTokenVerifier({
    supabaseUrl: config.SUPABASE_URL,
    audience: config.SUPABASE_JWT_AUDIENCE,
    issuer: config.SUPABASE_JWT_ISSUER,
    keyResolver: options.keyResolver,
  });

  // Registered as a request property so every request starts without an identity; the
  // guard assigns one per request. (Fastify v5's types reject a plain null default.)
  server.decorateRequest('user', undefined);
  server.decorate('authenticate', async (request: FastifyRequest) => {
    const header = request.headers.authorization;

    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      throw new AppError(ERROR_CODES.UNAUTHENTICATED, 'A session token is required.');
    }

    const identity = await verifyAccessToken(header.slice('Bearer '.length).trim());
    const user = await ensureUser(identity);

    request.user = {
      id: user.id,
      identitySubject: user.identitySubject,
      isAnonymous: user.isAnonymous,
    };
  });
}
