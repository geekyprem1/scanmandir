import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/api/server.js';
import type { AppServer } from '../../src/api/types.js';
import { getPool, withTransaction } from '../../src/shared/db/pool.js';
import { dispatchOutbox } from '../../src/shared/jobs/outbox.js';
import { enqueueJob } from '../../src/shared/jobs/queue.js';
import { clearJobHandlers } from '../../src/shared/jobs/registry.js';
import { VisionCallError } from '../../src/modules/vision/provider.js';
import { SCAN_ANALYZE_JOB } from '../../src/worker/handlers/scan-analyze.js';
import { registerAllJobHandlers } from '../../src/worker/handlers/index.js';
import { tick } from '../../src/worker/runner.js';
import { createTestSession, type TestSession } from '../support/tokens.js';
import { ScriptedVisionProvider, visionObject, visionResponse } from '../support/vision.js';
import { countWhere, resetQueueTables, resetScanTables } from './helpers.js';

const WORKER = 'analyze-worker';

/**
 * What the model "saw" is decided per test. The provider is registered once, because the
 * handler registry refuses a second registration for the same job type.
 */
const vision = new ScriptedVisionProvider();

describe('scan analysis', () => {
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
    registerAllJobHandlers({ visionProvider: vision });
    vision.script = () => visionResponse([]);
  });

  afterAll(async () => {
    await server.close();
  });

  function auth(token: string): Record<string, string> {
    return { authorization: `Bearer ${token}` };
  }

  async function jpeg(width = 1600, height = 900): Promise<Buffer> {
    return sharp({
      create: { width, height, channels: 3, background: { r: 30, g: 80, b: 140 } },
    })
      .jpeg()
      .toBuffer();
  }

  /** A scan whose upload has been verified, prepared, and is now waiting to be analysed. */
  async function analysingScan(token: string, idempotencyKey: string): Promise<string> {
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
      payload: { contentType: 'image/jpeg' },
    });
    const upload = urls.json<{ uploadUrl: string; stagingKey: string }>();
    const target = new URL(upload.uploadUrl);
    await server.inject({
      method: 'PUT',
      url: `${target.pathname}${target.search}`,
      headers: { 'content-type': 'image/jpeg' },
      payload: await jpeg(),
    });
    await server.inject({
      method: 'POST',
      url: `/v1/scans/${scanId}/upload-complete`,
      headers: auth(token),
      payload: { stagingKey: upload.stagingKey },
    });

    await dispatchOutbox(5);
    await tick(WORKER);
    expect(await scanStatus(token, scanId)).toBe('analyzing');
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

  it('stores the observations, records how they were produced, and waits for confirmation', async () => {
    const token = await session.sign({ sub: 'analyze-user-ok', isAnonymous: true });
    const scanId = await analysingScan(token, 'analyze-ok-01');

    vision.script = () =>
      visionResponse([
        visionObject({ id: 'obs_001', category: 'deity_representation', label: 'ganesh' }),
        visionObject({ id: 'obs_002', label: 'diya' }),
        // Two things the evaluation saw in real output: a label outside the catalog, and a
        // group that names a single member.
        visionObject({ id: 'obs_003', label: 'brass_vessel' }),
        visionObject({
          id: 'obs_004',
          category: 'deity_representation',
          label: 'radha_krishna',
          groupId: 'group_001',
          memberLabels: ['radha_krishna'],
        }),
      ]);

    await dispatchOutbox(5);
    const result = await tick(WORKER);

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(await scanStatus(token, scanId)).toBe('awaiting_confirmation');

    // Observations are stored normalized, with their boxes, and nothing invented.
    const observations = await getPool().query<{
      display_id: string;
      label: string;
      group_id: string | null;
    }>(`SELECT display_id, label, group_id FROM observations WHERE scan_id = $1 ORDER BY display_id`, [
      scanId,
    ]);
    expect(observations.rows.map((row) => row.label)).toEqual([
      'ganesh',
      'diya',
      'other_object',
      'radha_krishna',
    ]);
    expect(observations.rows[3]?.group_id).toBeNull();

    // The run records what produced it, so a stored observation can always be traced back.
    const run = await getPool().query<{
      model: string;
      provider: string | null;
      prompt_version: string;
      schema_version: string;
      attempts: number;
      normalization: string[];
      contract_violations: string[];
      image_usable: boolean;
    }>(
      `SELECT model, provider, prompt_version, schema_version, attempts, normalization,
              contract_violations, image_usable
         FROM analysis_runs WHERE scan_id = $1`,
      [scanId],
    );
    expect(run.rows).toHaveLength(1);
    expect(run.rows[0]?.model).toBe('scripted-vision');
    expect(run.rows[0]?.provider).toBe('test-provider');
    expect(run.rows[0]?.prompt_version).toBeTruthy();
    expect(run.rows[0]?.schema_version).toBe('1');
    expect(run.rows[0]?.image_usable).toBe(true);
    // Both deviations were recorded rather than hidden.
    expect(run.rows[0]?.normalization.length).toBeGreaterThanOrEqual(2);
    expect(run.rows[0]?.contract_violations.length).toBeGreaterThanOrEqual(2);

    // The consequence of an analysis is waiting for a person, not a job: nothing is queued
    // until the user confirms, and the report is generated from what they confirmed.
    expect(
      await countWhere('outbox_events', 'aggregate_id = $1 AND event_type = $2', [scanId, 'scan.analyzed']),
    ).toBe(0);
    await dispatchOutbox(5);
    expect(await countWhere('jobs', 'dedupe_key = $1', [`scan:${scanId}:report:input1`])).toBe(0);
  });

  it('sends a photo the gate refuses back for a retake and releases the allowance', async () => {
    const token = await session.sign({ sub: 'analyze-user-dark', isAnonymous: true });
    const scanId = await analysingScan(token, 'analyze-dark-01');

    vision.script = () => visionResponse([], { usable: false, reasons: ['too_dark', 'too_blurry'] });

    await dispatchOutbox(5);
    const result = await tick(WORKER);
    expect(result.succeeded).toBe(1);

    const scan = await server.inject({
      method: 'GET',
      url: `/v1/scans/${scanId}`,
      headers: auth(token),
    });
    expect(scan.json<{ status: string; retakeReasons: string[] }>().status).toBe('needs_retake');
    expect(scan.json<{ retakeReasons: string[] }>().retakeReasons).toEqual(['too_dark', 'too_blurry']);

    // The refusal is stored with its reasons, so it can be explained without paying again.
    expect(await countWhere('analysis_runs', 'scan_id = $1 AND image_usable = $2', [scanId, false])).toBe(1);
    expect(await countWhere('observations', 'scan_id = $1', [scanId])).toBe(0);
    // A photo we could not read must not cost the user a scan.
    expect(await countWhere('quota_ledger', 'scan_id = $1 AND kind = $2', [scanId, 'release'])).toBe(1);
    expect(
      await countWhere('outbox_events', 'aggregate_id = $1 AND event_type = $2', [scanId, 'scan.analyzed']),
    ).toBe(0);
  });

  it('refuses a photo that is not a mandir at all', async () => {
    const token = await session.sign({ sub: 'analyze-user-notmandir', isAnonymous: true });
    const scanId = await analysingScan(token, 'analyze-notmandir-01');

    vision.script = () => visionResponse([], { usable: true, looksLikeHome: false });

    await dispatchOutbox(5);
    await tick(WORKER);

    const scan = await server.inject({
      method: 'GET',
      url: `/v1/scans/${scanId}`,
      headers: auth(token),
    });
    expect(scan.json<{ status: string }>().status).toBe('needs_retake');
    expect(scan.json<{ retakeReasons: string[] }>().retakeReasons).toEqual(['not_a_home_mandir']);
    expect(await countWhere('quota_ledger', 'scan_id = $1 AND kind = $2', [scanId, 'release'])).toBe(1);
  });

  it('fails the scan when the provider never answers, and does not charge for it', async () => {
    const token = await session.sign({ sub: 'analyze-user-outage', isAnonymous: true });
    const scanId = await analysingScan(token, 'analyze-outage-01');

    vision.script = () => {
      throw new VisionCallError('scripted outage', true);
    };

    // The job's attempt budget is what bounds the bill, so this test spends it in one go.
    await withTransaction((tx) =>
      enqueueJob(tx, {
        jobType: SCAN_ANALYZE_JOB,
        dedupeKey: `scan:${scanId}:analyze:r1`,
        payload: { scanId, imageRevision: 1 },
        maxAttempts: 1,
      }),
    );
    await dispatchOutbox(5);
    const result = await tick(WORKER);

    expect(result.failed).toBe(1);
    const scan = await server.inject({
      method: 'GET',
      url: `/v1/scans/${scanId}`,
      headers: auth(token),
    });
    expect(scan.json<{ status: string; failedStage: string }>().status).toBe('failed');
    expect(scan.json<{ failedStage: string }>().failedStage).toBe('vision');
    expect(await countWhere('quota_ledger', 'scan_id = $1 AND kind = $2', [scanId, 'release'])).toBe(1);
    expect(await countWhere('observations', 'scan_id = $1', [scanId])).toBe(0);
  });

  it('changes nothing when the job is delivered twice', async () => {
    const token = await session.sign({ sub: 'analyze-user-redelivery', isAnonymous: true });
    const scanId = await analysingScan(token, 'analyze-redelivery-01');

    vision.script = () => visionResponse([visionObject()]);
    await dispatchOutbox(5);
    await tick(WORKER);
    expect(await countWhere('analysis_runs', 'scan_id = $1', [scanId])).toBe(1);

    await getPool().query(`UPDATE jobs SET status = 'pending', run_after = now() WHERE dedupe_key = $1`, [
      `scan:${scanId}:analyze:r1`,
    ]);
    const second = await tick(WORKER);

    expect(second.succeeded).toBe(1);
    expect(await countWhere('analysis_runs', 'scan_id = $1', [scanId])).toBe(1);
    expect(await countWhere('observations', 'scan_id = $1', [scanId])).toBe(1);
    expect(await scanStatus(token, scanId)).toBe('awaiting_confirmation');
  });

  it('exposes the observations to their owner and to nobody else', async () => {
    const owner = await session.sign({ sub: 'analyze-owner-read', isAnonymous: true });
    const intruder = await session.sign({ sub: 'analyze-intruder-read', isAnonymous: true });
    const scanId = await analysingScan(owner, 'analyze-read-01');

    vision.script = () =>
      visionResponse([visionObject({ id: 'obs_001', category: 'deity_representation', label: 'lakshmi' })]);
    await dispatchOutbox(5);
    await tick(WORKER);

    const read = await server.inject({
      method: 'GET',
      url: `/v1/scans/${scanId}/observations`,
      headers: auth(owner),
    });
    expect(read.statusCode).toBe(200);
    const body = read.json<{
      analysed: boolean;
      run: { model: string; schemaVersion: string };
      observations: { id: string; label: string; boundingBox: unknown; modelConfidence: number }[];
    }>();
    expect(body.analysed).toBe(true);
    expect(body.run.model).toBe('scripted-vision');
    expect(body.run.schemaVersion).toBe('1');
    expect(body.observations).toHaveLength(1);
    expect(body.observations[0]?.label).toBe('lakshmi');
    expect(body.observations[0]?.boundingBox).toBeTruthy();
    // Confidence travels, but it is the model's own number.
    expect(typeof body.observations[0]?.modelConfidence).toBe('number');

    const denied = await server.inject({
      method: 'GET',
      url: `/v1/scans/${scanId}/observations`,
      headers: auth(intruder),
    });
    expect(denied.statusCode).toBe(404);
  });
});
