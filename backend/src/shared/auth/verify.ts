import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { AppError, ERROR_CODES } from '../errors.js';

/**
 * The identity carried by a verified Supabase access token.
 *
 * `subject` is the provider's user id (`sub`). It is a mapping key, not an identifier
 * used by owned records: those reference the internal user id resolved from it
 * (ARCHITECTURE.md section 9, `src/modules/identity/user_repository.ts`). The subject
 * does not change when a guest upgrades to a permanent account, which is what lets the
 * upgrade keep its history (docs/decisions.md D-15).
 */
export interface VerifiedIdentity {
  subject: string;
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

  return async function verifyAccessToken(token: string): Promise<VerifiedIdentity> {
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

    return { subject, isAnonymous: payload['is_anonymous'] === true };
  };
}
