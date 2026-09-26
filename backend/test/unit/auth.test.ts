import { beforeAll, describe, expect, it } from 'vitest';
import { createTokenVerifier, type VerifiedIdentity } from '../../src/shared/auth/verify.js';
import { ERROR_CODES } from '../../src/shared/errors.js';
import { createTestSession, type TestSession } from '../support/tokens.js';

/**
 * Token verification is the only thing standing between a request and someone else's
 * data, so every way a token can be wrong is tested here — not just the happy path.
 */
describe('Supabase access token verification', () => {
  let session: TestSession;
  let verify: (token: string) => Promise<VerifiedIdentity>;

  beforeAll(async () => {
    session = await createTestSession();
    verify = createTokenVerifier({
      supabaseUrl: 'https://test-project.supabase.co',
      audience: session.audience,
      issuer: session.issuer,
      keyResolver: session.keyResolver,
    });
  });

  it('accepts a valid guest token and reports it as anonymous', async () => {
    const token = await session.sign({ isAnonymous: true });

    await expect(verify(token)).resolves.toEqual({
      subject: 'user-1',
      isAnonymous: true,
    });
  });

  it('reports a permanent account as not anonymous', async () => {
    const token = await session.sign({ sub: 'user-2', isAnonymous: false });

    await expect(verify(token)).resolves.toEqual({
      subject: 'user-2',
      isAnonymous: false,
    });
  });

  it('treats a token without the claim as a permanent account, not as a guest', async () => {
    const token = await session.sign({ sub: 'user-3' });

    await expect(verify(token)).resolves.toEqual({
      subject: 'user-3',
      isAnonymous: false,
    });
  });

  it('rejects an expired token', async () => {
    const token = await session.sign({ expiresIn: '-1s' });

    await expect(verify(token)).rejects.toMatchObject({ code: ERROR_CODES.UNAUTHENTICATED });
  });

  it('rejects a token for a different audience', async () => {
    const token = await session.sign({ audience: 'some-other-audience' });

    await expect(verify(token)).rejects.toMatchObject({ code: ERROR_CODES.UNAUTHENTICATED });
  });

  it('rejects a token from a different issuer', async () => {
    const token = await session.sign({ issuer: 'https://somewhere-else.example/auth/v1' });

    await expect(verify(token)).rejects.toMatchObject({ code: ERROR_CODES.UNAUTHENTICATED });
  });

  it('rejects a token signed by a key outside the key set, even with a trusted key id', async () => {
    const token = await session.signWithUnknownKey({ kid: 'test-key-1' });

    await expect(verify(token)).rejects.toMatchObject({ code: ERROR_CODES.UNAUTHENTICATED });
  });

  it('rejects a token that names a key id the set does not contain', async () => {
    const token = await session.sign({ kid: 'not-a-real-key' });

    await expect(verify(token)).rejects.toMatchObject({ code: ERROR_CODES.UNAUTHENTICATED });
  });

  it('refuses the symmetric algorithm outright', async () => {
    // Accepting HS256 would let anyone who knows the public signing setup forge tokens.
    const token = await session.signSymmetric();

    await expect(verify(token)).rejects.toMatchObject({ code: ERROR_CODES.UNAUTHENTICATED });
  });

  it('rejects a token with no subject', async () => {
    const token = await session.sign({ sub: null });

    await expect(verify(token)).rejects.toMatchObject({ code: ERROR_CODES.UNAUTHENTICATED });
  });

  it('rejects a structurally invalid token', async () => {
    await expect(verify('not-a-jwt')).rejects.toMatchObject({
      code: ERROR_CODES.UNAUTHENTICATED,
    });
  });
});
