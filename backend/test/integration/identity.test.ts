import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/api/server.js';
import type { AppServer } from '../../src/api/types.js';
import { createTestSession, type TestSession } from '../support/tokens.js';
import { resetIdentityTables } from './helpers.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface ProfileBody {
  id: string;
  isAnonymous: boolean;
  language: string | null;
  createdAt: string;
}

/**
 * Identity provisioning and the caller's own profile (P3-04 foundation and P3-05): a
 * verified token maps onto one stable internal user, and owned records in later phases
 * reference that internal id — never the provider subject.
 */
describe('profile and identity provisioning', () => {
  let server: AppServer;
  let session: TestSession;

  beforeAll(async () => {
    session = await createTestSession();
    server = await buildServer({ authKeyResolver: session.keyResolver });
  });

  beforeEach(async () => {
    await resetIdentityTables();
  });

  afterAll(async () => {
    await server.close();
  });

  function getMe(token: string) {
    return server.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${token}` },
    });
  }

  function patchMe(token: string, payload: unknown) {
    return server.inject({
      method: 'PATCH',
      url: '/v1/me',
      headers: { authorization: `Bearer ${token}` },
      payload: payload as Record<string, unknown>,
    });
  }

  it('provisions an internal user for a new guest and returns the profile', async () => {
    const token = await session.sign({ sub: 'guest-1', isAnonymous: true });

    const response = await getMe(token);
    expect(response.statusCode).toBe(200);

    const body = response.json<ProfileBody>();
    expect(body.id).toMatch(UUID_PATTERN);
    // The wire id is the internal user, never the provider subject.
    expect(body.id).not.toBe('guest-1');
    expect(body.isAnonymous).toBe(true);
    expect(body.language).toBeNull();
    expect(Number.isNaN(Date.parse(body.createdAt))).toBe(false);
  });

  it('reuses the same internal user on later requests', async () => {
    const token = await session.sign({ sub: 'guest-2', isAnonymous: true });

    const first = (await getMe(token)).json<ProfileBody>();
    const second = (await getMe(token)).json<ProfileBody>();

    expect(second.id).toBe(first.id);
  });

  it('gives different subjects different users', async () => {
    const first = (
      await getMe(await session.sign({ sub: 'guest-a', isAnonymous: true }))
    ).json<ProfileBody>();
    const second = (
      await getMe(await session.sign({ sub: 'guest-b', isAnonymous: true }))
    ).json<ProfileBody>();

    expect(first.id).not.toBe(second.id);
  });

  it('keeps the same internal user when a guest becomes a registered account', async () => {
    const asGuest = (
      await getMe(await session.sign({ sub: 'guest-upgrade', isAnonymous: true }))
    ).json<ProfileBody>();

    const afterUpgrade = (
      await getMe(await session.sign({ sub: 'guest-upgrade', isAnonymous: false }))
    ).json<ProfileBody>();

    // The upgrade must not create a second identity, or history would be orphaned.
    expect(afterUpgrade.id).toBe(asGuest.id);
    expect(afterUpgrade.isAnonymous).toBe(false);
  });

  it('updates a supported preference and rejects everything else', async () => {
    const token = await session.sign({ sub: 'guest-prefs', isAnonymous: true });

    expect((await getMe(token)).json<ProfileBody>().language).toBeNull();

    const updated = await patchMe(token, { language: 'hi' });
    expect(updated.statusCode).toBe(200);
    expect(updated.json<ProfileBody>().language).toBe('hi');
    expect((await getMe(token)).json<ProfileBody>().language).toBe('hi');

    const unsupported = await patchMe(token, { language: 'fr' });
    expect(unsupported.statusCode).toBe(400);
    expect(unsupported.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });

    const unknownKey = await patchMe(token, { timezone: 'Asia/Kolkata' });
    expect(unknownKey.statusCode).toBe(400);
  });
});
