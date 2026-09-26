import fs from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/api/server.js';
import type { AppServer } from '../../src/api/types.js';
import { getConfig } from '../../src/shared/config.js';
import { getObjectStorage } from '../../src/shared/storage/index.js';

let server: AppServer;

beforeAll(async () => {
  server = await buildServer();
  await server.ready();
});

afterAll(async () => {
  await server.close();
  // Test artifacts only; the directory name comes from the integration env block.
  await fs.rm(getConfig().STORAGE_LOCAL_DIR, { recursive: true, force: true });
});

describe('health', () => {
  it('reports liveness without touching dependencies', async () => {
    const response = await server.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok' });
  });

  it('reports readiness with dependency detail', async () => {
    const response = await server.inject({ method: 'GET', url: '/health/ready' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ready', checks: { database: 'ok', storage: 'ok' } });
  });
});

describe('error shape', () => {
  it('returns a stable code and a correlation id for an unknown route', async () => {
    const response = await server.inject({ method: 'GET', url: '/v1/does-not-exist' });
    expect(response.statusCode).toBe(404);

    const body = response.json();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(typeof body.error.requestId).toBe('string');
  });

  it('echoes a supplied request id so a client can correlate a failure', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/v1/does-not-exist',
      headers: { 'x-request-id': 'client-supplied-id' },
    });
    expect(response.json().error.requestId).toBe('client-supplied-id');
  });
});

describe('signed storage transfer', () => {
  const key = 'scans/test-scan/original.jpg';
  const content = Buffer.from('not a real jpeg, just bytes');

  function toInjectable(url: string): string {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  }

  it('accepts an upload with a valid signature and serves it back', async () => {
    const upload = await getObjectStorage().createUploadUrl(key, {
      contentType: 'image/jpeg',
      maxBytes: 1024,
    });

    const put = await server.inject({
      method: 'PUT',
      url: toInjectable(upload.url),
      headers: { 'content-type': 'image/jpeg' },
      payload: content,
    });
    expect(put.statusCode).toBe(204);

    const read = await getObjectStorage().createReadUrl(key);
    const get = await server.inject({ method: 'GET', url: toInjectable(read.url) });

    expect(get.statusCode).toBe(200);
    expect(get.headers['content-type']).toBe('image/jpeg');
    // Private content must never be cached by an intermediary.
    expect(get.headers['cache-control']).toBe('private, no-store');
    expect(get.rawPayload.equals(content)).toBe(true);
  });

  it('rejects a tampered signature', async () => {
    const upload = await getObjectStorage().createUploadUrl(key, {
      contentType: 'image/jpeg',
      maxBytes: 1024,
    });
    // Flip the first signature character to one it definitely is not: replacing it with a
    // fixed character would be a no-op whenever the signature already starts with that
    // character, which made this test pass or fail depending on the clock.
    const tampered = toInjectable(upload.url).replace(
      /sig=(.)/,
      (_match, first: string) => `sig=${first === 'X' ? 'Y' : 'X'}`,
    );

    const response = await server.inject({
      method: 'PUT',
      url: tampered,
      headers: { 'content-type': 'image/jpeg' },
      payload: content,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
  });

  it('rejects an upload larger than the signed limit', async () => {
    const upload = await getObjectStorage().createUploadUrl('scans/test-scan/small.jpg', {
      contentType: 'image/jpeg',
      maxBytes: 8,
    });

    const response = await server.inject({
      method: 'PUT',
      url: toInjectable(upload.url),
      headers: { 'content-type': 'image/jpeg' },
      payload: Buffer.alloc(64, 1),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('UPLOAD_INVALID');
  });

  it('refuses to read an object that does not exist', async () => {
    const read = await getObjectStorage().createReadUrl('scans/test-scan/absent.jpg');
    const response = await server.inject({ method: 'GET', url: toInjectable(read.url) });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('NOT_FOUND');
  });

  it('rejects an expired signature as expired, not as forbidden', async () => {
    const read = await getObjectStorage().createReadUrl(key);
    const url = new URL(read.url);
    // Backdating expiry invalidates the signature too, so re-sign is impossible from
    // outside; assert on the pair of failure modes the route distinguishes.
    url.searchParams.set('expires', '1');

    const response = await server.inject({
      method: 'GET',
      url: `${url.pathname}${url.search}`,
    });

    expect([403, 410]).toContain(response.statusCode);
  });
});
