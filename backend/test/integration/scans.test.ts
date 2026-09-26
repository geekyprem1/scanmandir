import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/api/server.js';
import type { AppServer } from '../../src/api/types.js';
import { ensureUser } from '../../src/modules/identity/user_repository.js';
import { insertScan } from '../../src/modules/scans/scan_repository.js';
import { getPool } from '../../src/shared/db/pool.js';
import { dispatchOutbox } from '../../src/shared/jobs/outbox.js';
import { getObjectStorage } from '../../src/shared/storage/index.js';
import { createTestSession, type TestSession } from '../support/tokens.js';
import { countWhere, resetScanTables } from './helpers.js';

/** Small stand-in for a JPEG; the pipeline checks size and declared type, not pixels yet. */
const IMAGE_BYTES = Buffer.from(Array.from({ length: 512 }, (_, index) => index % 256));

interface ScanBody {
  id: string;
  status: string;
  imageRevision: number;
  inputRevision: number;
  nextAction: string | null;
}

describe('scan lifecycle', () => {
  let server: AppServer;
  let session: TestSession;

  beforeAll(async () => {
    session = await createTestSession();
    server = await buildServer({ authKeyResolver: session.keyResolver });
  });

  beforeEach(async () => {
    await resetScanTables();
  });

  afterAll(async () => {
    await server.close();
  });

  function auth(token: string): Record<string, string> {
    return { authorization: `Bearer ${token}` };
  }

  function tokenFor(subject: string): Promise<string> {
    return session.sign({ sub: subject, isAnonymous: true });
  }

  function createScan(token: string, idempotencyKey: string) {
    return server.inject({
      method: 'POST',
      url: '/v1/scans',
      headers: auth(token),
      payload: { idempotencyKey },
    });
  }

  async function createAndGetScan(token: string, idempotencyKey: string): Promise<ScanBody> {
    const response = await createScan(token, idempotencyKey);
    expect(response.statusCode).toBe(201);
    return response.json<ScanBody>();
  }

  function uploadUrl(token: string, scanId: string, contentType = 'image/jpeg') {
    return server.inject({
      method: 'POST',
      url: `/v1/scans/${scanId}/upload-url`,
      headers: auth(token),
      payload: { contentType },
    });
  }

  function uploadComplete(token: string, scanId: string, stagingKey: string) {
    return server.inject({
      method: 'POST',
      url: `/v1/scans/${scanId}/upload-complete`,
      headers: auth(token),
      payload: { stagingKey },
    });
  }

  async function internalUserId(subject: string): Promise<string> {
    const user = await ensureUser({ subject, isAnonymous: true });
    return user.id;
  }

  it('creates a scan in awaiting_upload and reserves allowance', async () => {
    const token = await tokenFor('scan-user-basic');

    const created = await createScan(token, 'idem-key-0001');
    expect(created.statusCode).toBe(201);

    const body = created.json<ScanBody>();
    expect(body.status).toBe('awaiting_upload');
    expect(body.imageRevision).toBe(1);
    expect(body.inputRevision).toBe(0);
    expect(body.nextAction).toBe('upload');

    const read = await server.inject({
      method: 'GET',
      url: `/v1/scans/${body.id}`,
      headers: auth(token),
    });
    expect(read.statusCode).toBe(200);
    expect(read.json<ScanBody>().id).toBe(body.id);

    expect(await countWhere('quota_ledger', 'kind = $1', ['reserve'])).toBe(1);
  });

  it('replays the same idempotency key as the same scan, without a second reservation', async () => {
    const token = await tokenFor('scan-user-replay');

    const first = await createScan(token, 'idem-replay-01');
    const second = await createScan(token, 'idem-replay-01');

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json<ScanBody>().id).toBe(first.json<ScanBody>().id);
    expect(await countWhere('quota_ledger', 'kind = $1', ['reserve'])).toBe(1);
  });

  it('treats a key reused with different input as a conflict', async () => {
    const token = await tokenFor('scan-user-conflict');
    const userId = await internalUserId('scan-user-conflict');

    // Simulates a client that reused a key for a different request: the stored hash no
    // longer matches what that request hashes to.
    await insertScan(getPool(), {
      userId,
      idempotencyKey: 'idem-conflict-01',
      requestHash: 'a-hash-from-a-different-request',
    });

    const response = await createScan(token, 'idem-conflict-01');

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: 'REVISION_CONFLICT' } });
  });

  it('refuses a fourth scan in the period and leaves nothing behind', async () => {
    const token = await tokenFor('scan-user-quota');
    const userId = await internalUserId('scan-user-quota');

    for (let index = 0; index < 3; index += 1) {
      expect((await createScan(token, `idem-quota-${index}`)).statusCode).toBe(201);
    }

    const refused = await createScan(token, 'idem-quota-3');

    expect(refused.statusCode).toBe(402);
    expect(refused.json()).toMatchObject({ error: { code: 'QUOTA_EXCEEDED' } });
    expect(
      refused.json<{ error: { details: { periodEndsAt: string } } }>().error.details.periodEndsAt,
    ).toBeDefined();
    // The refused attempt must not leave a scan or a reservation behind.
    expect(await countWhere('scans', 'user_id = $1', [userId])).toBe(3);
    expect(await countWhere('quota_ledger', 'user_id = $1', [userId])).toBe(3);
  });

  it('scopes idempotency keys to the owner', async () => {
    const first = await createScan(await tokenFor('scan-user-scope-a'), 'shared-key-01');
    const second = await createScan(await tokenFor('scan-user-scope-b'), 'shared-key-01');

    expect(second.statusCode).toBe(201);
    expect(second.json<ScanBody>().id).not.toBe(first.json<ScanBody>().id);
  });

  it('issues an upload URL scoped to the scan, its limits and its content types', async () => {
    const token = await tokenFor('scan-user-upload-url');
    const scan = await createAndGetScan(token, 'idem-upload-url-01');

    const response = await uploadUrl(token, scan.id);
    expect(response.statusCode).toBe(200);

    const body = response.json<{
      uploadUrl: string;
      stagingKey: string;
      requiredHeaders: Record<string, string>;
    }>();
    expect(body.stagingKey).toContain(`/r1/staging/`);
    expect(body.uploadUrl).toContain('method=put');
    expect(body.requiredHeaders['content-type']).toBe('image/jpeg');

    const refused = await uploadUrl(token, scan.id, 'image/gif');
    expect(refused.statusCode).toBe(400);
    expect(refused.json()).toMatchObject({ error: { code: 'UPLOAD_INVALID' } });
  });

  it("does not reveal another owner's scan", async () => {
    const owner = await tokenFor('scan-owner-private');
    const intruder = await tokenFor('scan-intruder');
    const scan = await createAndGetScan(owner, 'idem-private-01');

    const read = await server.inject({
      method: 'GET',
      url: `/v1/scans/${scan.id}`,
      headers: auth(intruder),
    });
    const upload = await uploadUrl(intruder, scan.id);

    expect(read.statusCode).toBe(404);
    expect(upload.statusCode).toBe(404);
  });

  it('pins the upload, queues analysis, and writes the outbox event in one step', async () => {
    const subject = 'scan-user-complete';
    const token = await tokenFor(subject);
    const scan = await createAndGetScan(token, 'idem-complete-01');

    const upload = (await uploadUrl(token, scan.id)).json<{ uploadUrl: string; stagingKey: string }>();

    // Upload through the signed URL itself, so the signature and size limit are exercised
    // the same way the app will use them.
    const url = new URL(upload.uploadUrl);
    const put = await server.inject({
      method: 'PUT',
      url: `${url.pathname}${url.search}`,
      headers: { 'content-type': 'image/jpeg' },
      payload: IMAGE_BYTES,
    });
    expect(put.statusCode).toBe(204);

    const complete = await uploadComplete(token, scan.id, upload.stagingKey);
    expect(complete.statusCode).toBe(200);
    expect(complete.json<ScanBody>().status).toBe('queued');
    expect(complete.json<ScanBody>().nextAction).toBe('wait');

    // The staging copy is gone and the pinned original is recorded as valid.
    const storage = getObjectStorage();
    expect(await storage.headObject(upload.stagingKey)).toBeNull();
    expect(
      await countWhere('media_objects', 'scan_id = $1 AND purpose = $2 AND validation_status = $3', [
        scan.id,
        'original',
        'valid',
      ]),
    ).toBe(1);

    // The state change and the promise to analyse committed together.
    expect(
      await countWhere('outbox_events', 'aggregate_id = $1 AND event_type = $2', [
        scan.id,
        'scan.upload_verified',
      ]),
    ).toBe(1);

    const dispatched = await dispatchOutbox(5);
    expect(dispatched.published).toBeGreaterThanOrEqual(1);
    expect(await countWhere('jobs', 'dedupe_key = $1', [`scan:${scan.id}:analyze:r1`])).toBe(1);

    // Completing twice is a state conflict, not a second analysis.
    const again = await uploadComplete(token, scan.id, upload.stagingKey);
    expect(again.statusCode).toBe(409);
  });

  it('rejects an upload that is oversized, mistyped, borrowed, or missing', async () => {
    const subject = 'scan-user-validate';
    const token = await tokenFor(subject);
    const userId = await internalUserId(subject);
    const scan = await createAndGetScan(token, 'idem-validate-01');
    const other = await createAndGetScan(token, 'idem-validate-02');
    const storage = getObjectStorage();

    async function completeWith(key: string) {
      return (await uploadComplete(token, scan.id, key)).statusCode;
    }

    const oversizedKey = `scans/${userId}/${scan.id}/r1/staging/oversized`;
    await storage.putObject(oversizedKey, Buffer.alloc(70_000), 'image/jpeg');
    expect(await completeWith(oversizedKey)).toBe(400);

    const mistypedKey = `scans/${userId}/${scan.id}/r1/staging/mistyped`;
    await storage.putObject(mistypedKey, IMAGE_BYTES, 'application/pdf');
    expect(await completeWith(mistypedKey)).toBe(400);

    // A staging key that belongs to a different scan.
    expect(await completeWith(`scans/${userId}/${other.id}/r1/staging/borrowed`)).toBe(400);

    // Nothing was uploaded under this one at all.
    expect(await completeWith(`scans/${userId}/${scan.id}/r1/staging/never-uploaded`)).toBe(400);

    // Still waiting for a usable upload.
    const read = await server.inject({
      method: 'GET',
      url: `/v1/scans/${scan.id}`,
      headers: auth(token),
    });
    expect(read.json<ScanBody>().status).toBe('awaiting_upload');

    const refused = await uploadComplete(token, scan.id, 'not-a-staging-key');
    expect(refused.statusCode).toBe(400);
    expect(refused.json()).toMatchObject({ error: { code: 'UPLOAD_INVALID' } });
  });
});
