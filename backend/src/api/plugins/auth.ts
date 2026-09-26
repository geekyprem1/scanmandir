import type { FastifyReply, FastifyRequest } from 'fastify';
import type { JWTVerifyGetKey } from 'jose';
import { createTokenVerifier, type AuthenticatedUser } from '../../shared/auth/verify.js';
import { getConfig } from '../../shared/config.js';
import { AppError, ERROR_CODES } from '../../shared/errors.js';
import type { AppServer } from '../types.js';

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
 * Registers session verification. Routes opt in per route:
 *
 *   server.get('/me', { preHandler: server.authenticate }, handler)
 *
 * A missing or malformed token is always UNAUTHENTICATED — never a silent anonymous
 * fallback, because every route that uses this guard is asking for a real identity.
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

    request.user = await verifyAccessToken(header.slice('Bearer '.length).trim());
  });
}
