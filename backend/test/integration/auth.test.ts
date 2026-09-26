import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/api/server.js';
import type { AppServer } from '../../src/api/types.js';
import { createTestSession, type TestSession } from '../support/tokens.js';

/**
 * The authenticated surface over real HTTP: a valid session reaches its own identity,
 * everything else is turned away in the documented error shape, and public routes stay
 * public.
 */
describe('session-guarded routes', () => {
  let server: AppServer;
  let session: TestSession;

  beforeAll(async () => {
    session = await createTestSession();
    server = await buildServer({ authKeyResolver: session.keyResolver });
  });

  afterAll(async () => {
    await server.close();
  });

  async function getMe(authorization?: string): Promise<{ statusCode: number; body: unknown }> {
    const response = await server.inject({
      method: 'GET',
      url: '/me',
      ...(authorization ? { headers: { authorization } } : {}),
    });
    return { statusCode: response.statusCode, body: response.json() };
  }

  it('returns the identity carried by a guest session', async () => {
    const token = await session.sign({ sub: 'guest-1', isAnonymous: true });

    await expect(getMe(`Bearer ${token}`)).resolves.toEqual({
      statusCode: 200,
      body: { id: 'guest-1', isAnonymous: true },
    });
  });

  it('returns the identity carried by a permanent session', async () => {
    const token = await session.sign({ sub: 'member-1', isAnonymous: false });

    await expect(getMe(`Bearer ${token}`)).resolves.toEqual({
      statusCode: 200,
      body: { id: 'member-1', isAnonymous: false },
    });
  });

  it('turns away a request with no token, in the documented error shape', async () => {
    const { statusCode, body } = await getMe();

    expect(statusCode).toBe(401);
    expect(body).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });

  it('turns away a forged token', async () => {
    const token = await session.signWithUnknownKey();

    const { statusCode, body } = await getMe(`Bearer ${token}`);

    expect(statusCode).toBe(401);
    expect(body).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });

  it('turns away a malformed authorization header', async () => {
    const token = await session.sign();

    const { statusCode } = await getMe(token);

    expect(statusCode).toBe(401);
  });

  it('leaves public routes public', async () => {
    const response = await server.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
  });
});
