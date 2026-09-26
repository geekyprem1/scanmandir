import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTVerifyGetKey } from 'jose';
import { SUPABASE_TEST_AUDIENCE, SUPABASE_TEST_ISSUER } from './supabase-test-project.js';

const ISSUER = SUPABASE_TEST_ISSUER;
const AUDIENCE = SUPABASE_TEST_AUDIENCE;
const TRUSTED_KID = 'test-key-1';

export interface SignOptions {
  /** Omit for the default test subject; pass null to leave the claim out entirely. */
  sub?: string | null;
  isAnonymous?: boolean;
  audience?: string;
  issuer?: string;
  expiresIn?: string;
  /** Key id to claim. Defaults to the trusted key's id. */
  kid?: string;
}

export interface TestSession {
  /** Key set the verifier should trust, mirroring a Supabase project's JWKS. */
  keyResolver: JWTVerifyGetKey;
  issuer: string;
  audience: string;
  /** A token signed by the trusted key. */
  sign(options?: SignOptions): Promise<string>;
  /** A token signed by a key that is not in the key set. */
  signWithUnknownKey(options?: SignOptions): Promise<string>;
  /** An HS256 token, to prove the symmetric algorithm is refused. */
  signSymmetric(options?: SignOptions): Promise<string>;
}

/**
 * Builds everything a test needs to exercise token verification without a network call:
 * a trusted ES256 key pair, its JWKS, and signers for the cases that must fail.
 */
export async function createTestSession(): Promise<TestSession> {
  const trusted = await generateKeyPair('ES256', { extractable: true });
  const untrusted = await generateKeyPair('ES256', { extractable: true });

  const publicJwk = await exportJWK(trusted.publicKey);
  const keyResolver = createLocalJWKSet({
    keys: [{ ...publicJwk, kid: TRUSTED_KID, alg: 'ES256', use: 'sig' }],
  });

  async function signWith(privateKey: CryptoKey, options: SignOptions): Promise<string> {
    const payload = options.isAnonymous === undefined ? {} : { is_anonymous: options.isAnonymous };
    const jwt = new SignJWT(payload)
      .setProtectedHeader({ alg: 'ES256', kid: options.kid ?? TRUSTED_KID })
      .setIssuedAt()
      .setExpirationTime(options.expiresIn ?? '5m')
      .setAudience(options.audience ?? AUDIENCE)
      .setIssuer(options.issuer ?? ISSUER);

    if (options.sub !== null) {
      jwt.setSubject(options.sub ?? 'user-1');
    }

    return jwt.sign(privateKey);
  }

  return {
    keyResolver,
    issuer: ISSUER,
    audience: AUDIENCE,
    sign: (options = {}) => signWith(trusted.privateKey, options),
    signWithUnknownKey: (options = {}) => signWith(untrusted.privateKey, options),
    signSymmetric: (options = {}) =>
      new SignJWT({})
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('5m')
        .setAudience(AUDIENCE)
        .setIssuer(ISSUER)
        .setSubject(options.sub ?? 'user-1')
        .sign(new TextEncoder().encode('a-symmetric-secret-that-is-long-enough-32b')),
  };
}
