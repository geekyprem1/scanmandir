import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/api/server.js';
import type { AppServer } from '../../src/api/types.js';
import { createTestSession, type TestSession } from '../support/tokens.js';

/**
 * The guard's contract: a valid session is required, and every failure comes back as
 * UNAUTHENTICATED in the documented error shape. Profile behaviour lives in
 * identity.test.ts; this file is about being turned away.
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
      url: '/v1/me',
      ...(authorization ? { headers: { authorization } } : {}),
    });
    return { statusCode: response.statusCode, body: response.json() };
  }

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
