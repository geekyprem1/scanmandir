import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/api/server.js';
import type { AppServer } from '../../src/api/types.js';
import { getPool } from '../../src/shared/db/pool.js';
import { dispatchOutbox } from '../../src/shared/jobs/outbox.js';
import { clearJobHandlers, registerJobHandler } from '../../src/shared/jobs/registry.js';
import { getObjectStorage } from '../../src/shared/storage/index.js';
import { INTERNAL_ECHO_JOB, internalEchoHandler } from '../../src/worker/handlers/internal-echo.js';
import { SCAN_PREPARE_JOB, scanPrepareHandler } from '../../src/worker/handlers/scan-prepare.js';
import { tick } from '../../src/worker/runner.js';
import { createTestSession, type TestSession } from '../support/tokens.js';
import { countWhere, resetQueueTables, resetScanTables } from './helpers.js';

const WORKER = 'prepare-worker';

describe('scan preparation', () => {
  let server: AppServer;
  let session: TestSession;

  beforeAll(async () => {
    session = await createTestSession();
    server = await buildServer({ authKeyResolver: session.keyResolver });
  });

  beforeEach(async () => {
    await resetScanTables();
    await resetQueueTables();
    clearJobHandlers();
    // Only the stages this suite is about. The vision stage has its own suite, and leaving
    // it unregistered here stops this one from reaching for a provider.
    registerJobHandler(INTERNAL_ECHO_JOB, internalEchoHandler);
    registerJobHandler(SCAN_PREPARE_JOB, scanPrepareHandler);
  });

  afterAll(async () => {
    await server.close();
  });

  function auth(token: string): Record<string, string> {
    return { authorization: `Bearer ${token}` };
  }

  async function jpeg(width: number, height: number): Promise<Buffer> {
    return sharp({
      create: { width, height, channels: 3, background: { r: 40, g: 90, b: 160 } },
    })
      .jpeg()
      .toBuffer();
  }

  /** A scan whose upload has been verified, dispatched and is waiting for the worker. */
  async function verifiedScan(
    token: string,
    idempotencyKey: string,
    bytes: Buffer,
    contentType = 'image/jpeg',
  ): Promise<string> {
    const created = await server.inject({
      method: 'POST',
      url: '/v1/scans',
      headers: auth(token),
      payload: { idempotencyKey },
    });
    expect(created.statusCode).toBe(201);
    const scanId = created.json<{ id: string }>().id;

    const urls = await server.inject({
      method: 'POST',
      url: `/v1/scans/${scanId}/upload-url`,
      headers: auth(token),
      payload: { contentType },
    });
    expect(urls.statusCode).toBe(200);
    const upload = urls.json<{ uploadUrl: string; stagingKey: string }>();

    // Upload through the signed URL, exactly as the app does.
    const target = new URL(upload.uploadUrl);
    const put = await server.inject({
      method: 'PUT',
      url: `${target.pathname}${target.search}`,
      headers: { 'content-type': contentType },
      payload: bytes,
    });
    expect(put.statusCode).toBe(204);

    const complete = await server.inject({
      method: 'POST',
      url: `/v1/scans/${scanId}/upload-complete`,
      headers: auth(token),
      payload: { stagingKey: upload.stagingKey },
    });
    expect(complete.statusCode).toBe(200);
    expect(complete.json<{ status: string }>().status).toBe('queued');

    await dispatchOutbox(5);
    return scanId;
  }

  async function scanStatus(token: string, scanId: string): Promise<string> {
    const response = await server.inject({
      method: 'GET',
      url: `/v1/scans/${scanId}`,
      headers: auth(token),
    });
    expect(response.statusCode).toBe(200);
    return response.json<{ status: string }>().status;
  }

  async function derivativeStorageKey(scanId: string): Promise<string | null> {
    const { rows } = await getPool().query<{ storage_key: string }>(
      `SELECT storage_key FROM media_objects WHERE scan_id = $1 AND purpose = 'derivative'`,
      [scanId],
    );
    return rows[0]?.storage_key ?? null;
  }

  it('turns a verified upload into a bounded derivative and queues analysis', async () => {
    const token = await session.sign({ sub: 'prepare-user-valid', isAnonymous: true });
    const scanId = await verifiedScan(token, 'prepare-valid-01', await jpeg(2400, 1200));

    expect(await countWhere('jobs', 'dedupe_key = $1', [`scan:${scanId}:prepare:r1`])).toBe(1);

    const result = await tick(WORKER);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);

    expect(await scanStatus(token, scanId)).toBe('analyzing');

    // The derivative is recorded as valid, and the original is left in place: revisions
    // are immutable, so preparation never rewrites what the user uploaded.
    expect(
      await countWhere('media_objects', 'scan_id = $1 AND purpose = $2 AND validation_status = $3', [
        scanId,
        'derivative',
        'valid',
      ]),
    ).toBe(1);
    expect(await countWhere('media_objects', 'scan_id = $1 AND purpose = $2', [scanId, 'original'])).toBe(1);

    const key = await derivativeStorageKey(scanId);
    expect(key).toMatch(/\/r1\/derivative\.jpg$/);
    const stored = await getObjectStorage().getObject(key ?? '');
    const metadata = await sharp(stored).metadata();
    expect(metadata.format).toBe('jpeg');
    expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBe(1024);
    expect(stored.byteLength).toBeLessThan(200 * 1024);

    // The next stage is queued but not run: the vision handler is Phase 5.
    expect(
      await countWhere('outbox_events', 'aggregate_id = $1 AND event_type = $2', [scanId, 'scan.prepared']),
    ).toBe(1);
    const dispatched = await dispatchOutbox(5);
    expect(dispatched.published).toBeGreaterThanOrEqual(1);
    expect(await countWhere('jobs', 'dedupe_key = $1', [`scan:${scanId}:analyze:r1`])).toBe(1);
  });

  it('changes nothing when the job is delivered twice', async () => {
    const token = await session.sign({ sub: 'prepare-user-redelivery', isAnonymous: true });
    const scanId = await verifiedScan(token, 'prepare-redelivery-01', await jpeg(1600, 900));

    await tick(WORKER);
    const key = await derivativeStorageKey(scanId);

    // Rewind the job the way an expired lease would, then run it again.
    await getPool().query(`UPDATE jobs SET status = 'pending', run_after = now() WHERE dedupe_key = $1`, [
      `scan:${scanId}:prepare:r1`,
    ]);
    const second = await tick(WORKER);

    expect(second.succeeded).toBe(1);
    expect(await derivativeStorageKey(scanId)).toBe(key);
    expect(await countWhere('media_objects', 'scan_id = $1 AND purpose = $2', [scanId, 'derivative'])).toBe(
      1,
    );
    expect(
      await countWhere('outbox_events', 'aggregate_id = $1 AND event_type = $2', [scanId, 'scan.prepared']),
    ).toBe(1);
    expect(await scanStatus(token, scanId)).toBe('analyzing');
  });

  it('refuses an unusable upload, releases the allowance, and asks for a retake', async () => {
    const token = await session.sign({ sub: 'prepare-user-garbage', isAnonymous: true });
    const scanId = await verifiedScan(
      token,
      'prepare-garbage-01',
      Buffer.from('a text file wearing an image content type'),
    );

    const result = await tick(WORKER);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);

    expect(await scanStatus(token, scanId)).toBe('needs_retake');
    expect(await derivativeStorageKey(scanId)).toBeNull();
    // The refused upload is recorded as rejected rather than quietly dropped.
    expect(
      await countWhere('media_objects', 'scan_id = $1 AND validation_status = $2', [scanId, 'rejected']),
    ).toBe(1);
    // Nothing was queued for analysis, and the reservation was released in its own period.
    expect(
      await countWhere('outbox_events', 'aggregate_id = $1 AND event_type = $2', [scanId, 'scan.prepared']),
    ).toBe(0);
    expect(await countWhere('quota_ledger', 'scan_id = $1 AND kind = $2', [scanId, 'reserve'])).toBe(1);
    expect(await countWhere('quota_ledger', 'scan_id = $1 AND kind = $2', [scanId, 'release'])).toBe(1);

    // The point of the release: the user was not charged for a photo we could not read.
    const next = await server.inject({
      method: 'POST',
      url: '/v1/scans',
      headers: auth(token),
      payload: { idempotencyKey: 'prepare-garbage-02' },
    });
    expect(next.statusCode).toBe(201);
  });
});
