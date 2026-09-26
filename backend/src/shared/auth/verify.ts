import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { AppError, ERROR_CODES } from '../errors.js';

/**
 * The identity carried by a verified Supabase access token.
 *
 * `id` is the Supabase user id (`sub`). It does not change when a guest upgrades to a
 * permanent account, which is why ownership rows can reference it for the life of the
 * account (docs/decisions.md D-15, TASKS P3-02).
 */
export interface AuthenticatedUser {
  id: string;
  /**
   * True while the user is still an anonymous guest. This is the token's
   * `is_anonymous` claim, not an inference from the absence of an email.
   */
  isAnonymous: boolean;
}

export interface TokenVerifierOptions {
  supabaseUrl: string;
  audience: string;
  issuer?: string | undefined;
  /**
   * Overrides key lookup. Production resolves keys from the project's JWKS endpoint;
   * tests pass a local key set so no network call is involved.
   */
  keyResolver?: JWTVerifyGetKey | undefined;
}

/**
 * Verifies Supabase access tokens locally.
 *
 * The project signs with asymmetric keys (ES256/RS256) and publishes them as a JWKS, so
 * verification needs no shared secret and keeps working across key rotation. The legacy
 * symmetric algorithm is refused outright: accepting it would let anyone who learns the
 * (public) signing algorithm forge tokens from the published key material.
 *
 * Every failure is reported as UNAUTHENTICATED with a fixed message. Token contents and
 * library errors stay in the `cause`, which only reaches the logs.
 */
export function createTokenVerifier(options: TokenVerifierOptions) {
  const jwks: JWTVerifyGetKey =
    options.keyResolver ??
    createRemoteJWKSet(new URL('/auth/v1/.well-known/jwks.json', options.supabaseUrl), {
      // Re-fetch at most once a minute when an unknown key id arrives, so a burst of
      // forged kids cannot turn into a burst of outbound requests.
      cooldownDuration: 60_000,
      timeoutDuration: 5_000,
    });
  const issuer = options.issuer ?? new URL('/auth/v1', options.supabaseUrl).toString();

  return async function verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    let payload: Record<string, unknown>;
    try {
      const verified = await jwtVerify(token, jwks, {
        issuer,
        audience: options.audience,
        algorithms: ['ES256', 'RS256'],
      });
      payload = verified.payload;
    } catch (error) {
      throw new AppError(ERROR_CODES.UNAUTHENTICATED, 'Invalid or expired session.', {
        cause: error,
      });
    }

    const subject = payload['sub'];
    if (typeof subject !== 'string' || subject.length === 0) {
      throw new AppError(ERROR_CODES.UNAUTHENTICATED, 'Invalid or expired session.');
    }

    return { id: subject, isAnonymous: payload['is_anonymous'] === true };
  };
}
