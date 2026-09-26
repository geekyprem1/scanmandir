import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/api/server.js';
import type { AppServer } from '../../src/api/types.js';
import { dispatchOutbox } from '../../src/shared/jobs/outbox.js';
import { clearJobHandlers } from '../../src/shared/jobs/registry.js';
import { registerAllJobHandlers } from '../../src/worker/handlers/index.js';
import { tick } from '../../src/worker/runner.js';
import { createTestSession, type TestSession } from '../support/tokens.js';
import { ScriptedVisionProvider, visionObject, visionResponse } from '../support/vision.js';
import { countWhere, resetQueueTables, resetScanTables } from './helpers.js';

const WORKER = 'confirmation-worker';
const vision = new ScriptedVisionProvider();

describe('scan confirmation', () => {
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
    vision.script = () =>
      visionResponse([
        visionObject({ id: 'obs_001', category: 'deity_representation', label: 'ganesh' }),
        visionObject({ id: 'obs_002', label: 'diya' }),
      ]);
  });

  afterAll(async () => {
    await server.close();
  });

  function auth(token: string): Record<string, string> {
    return { authorization: `Bearer ${token}` };
  }

  async function jpeg(): Promise<Buffer> {
    return sharp({ create: { width: 1200, height: 900, channels: 3, background: { r: 90, g: 60, b: 30 } } })
      .jpeg()
      .toBuffer();
  }

  /** A scan that has been analysed and is waiting for the user's confirmation. */
  async function awaitingConfirmation(token: string, idempotencyKey: string): Promise<string> {
    const created = await server.inject({
      method: 'POST',
      url: '/v1/scans',
      headers: auth(token),
      payload: { idempotencyKey },
    });
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
    await tick(WORKER); // prepare
    await dispatchOutbox(5);
    await tick(WORKER); // analyse

    const scan = await server.inject({
      method: 'GET',
      url: `/v1/scans/${scanId}`,
      headers: auth(token),
    });
    expect(scan.json<{ status: string }>().status).toBe('awaiting_confirmation');
    return scanId;
  }

  function confirmedObject(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: 'obs_001',
      label: 'ganesh',
      category: 'deity_representation',
      representationType: 'statue',
      groupId: null,
      memberLabels: null,
      boundingBox: { x: 0.2, y: 0.3, width: 0.4, height: 0.4 },
      modelConfidence: 0.93,
      verificationRequired: false,
      action: 'confirmed',
      correctedFrom: null,
      ...overrides,
    };
  }

  it('stores the confirmed input, moves the scan on, and queues report generation', async () => {
    const token = await session.sign({ sub: 'confirm-user-ok', isAnonymous: true });
    const scanId = await awaitingConfirmation(token, 'confirm-ok-01');

    const response = await server.inject({
      method: 'POST',
      url: `/v1/scans/${scanId}/confirmation`,
      headers: auth(token),
      payload: {
        expectedImageRevision: 1,
        objects: [
          confirmedObject(),
          // The user corrected the model's second object.
          confirmedObject({
            id: 'obs_002',
            label: 'oil_lamp',
            category: 'puja_object',
            representationType: 'physical_object',
            modelConfidence: 0.78,
            action: 'corrected',
            correctedFrom: 'diya',
          }),
          // Something the user added, which nothing measured.
          confirmedObject({
            id: 'user-1',
            label: 'bell',
            category: 'puja_object',
            representationType: 'physical_object',
            modelConfidence: null,
            action: 'added',
          }),
        ],
        context: { tradition: 'prefer_not_to_say' },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json<{ inputRevision: number }>().inputRevision).toBe(1);

    const scan = await server.inject({
      method: 'GET',
      url: `/v1/scans/${scanId}`,
      headers: auth(token),
    });
    expect(scan.json<{ status: string; inputRevision: number; nextAction: string }>()).toMatchObject({
      status: 'generating_report',
      inputRevision: 1,
      nextAction: 'wait',
    });

    // The input is readable back, including what the user changed and what they added.
    const input = await server.inject({
      method: 'GET',
      url: `/v1/scans/${scanId}/input`,
      headers: auth(token),
    });
    expect(input.statusCode).toBe(200);
    const body = input.json<{
      inputRevision: number;
      confirmed: boolean;
      objects: {
        label: string;
        action: string;
        correctedFrom: string | null;
        modelConfidence: number | null;
      }[];
      context: Record<string, string>;
    }>();
    expect(body.confirmed).toBe(true);
    expect(body.inputRevision).toBe(1);
    expect(body.objects.map((object) => object.action)).toEqual(['confirmed', 'corrected', 'added']);
    expect(body.objects[1]?.correctedFrom).toBe('diya');
    expect(body.objects[2]?.modelConfidence).toBeNull();
    expect(body.context['tradition']).toBe('prefer_not_to_say');

    // The report job is queued against this input revision, not against the analysis.
    expect(
      await countWhere('outbox_events', 'aggregate_id = $1 AND event_type = $2', [scanId, 'scan.confirmed']),
    ).toBe(1);
    await dispatchOutbox(5);
    expect(await countWhere('jobs', 'dedupe_key = $1', [`scan:${scanId}:report:input1`])).toBe(1);
  });

  it('refuses a confirmation written against an older photo', async () => {
    const token = await session.sign({ sub: 'confirm-user-stale', isAnonymous: true });
    const scanId = await awaitingConfirmation(token, 'confirm-stale-01');

    // A retake would have moved the scan to revision 2 between reading and confirming.
    const response = await server.inject({
      method: 'POST',
      url: `/v1/scans/${scanId}/confirmation`,
      headers: auth(token),
      payload: { expectedImageRevision: 2, objects: [confirmedObject()], context: {} },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: 'REVISION_CONFLICT' } });
    // Nothing was stored and the scan is still waiting.
    expect(await countWhere('scan_inputs', 'scan_id = $1', [scanId])).toBe(0);
    expect(
      await countWhere('outbox_events', 'aggregate_id = $1 AND event_type = $2', [scanId, 'scan.confirmed']),
    ).toBe(0);
  });

  it('refuses a second confirmation of the same scan', async () => {
    const token = await session.sign({ sub: 'confirm-user-twice', isAnonymous: true });
    const scanId = await awaitingConfirmation(token, 'confirm-twice-01');

    const first = await server.inject({
      method: 'POST',
      url: `/v1/scans/${scanId}/confirmation`,
      headers: auth(token),
      payload: { expectedImageRevision: 1, objects: [confirmedObject()], context: {} },
    });
    expect(first.statusCode).toBe(201);

    const second = await server.inject({
      method: 'POST',
      url: `/v1/scans/${scanId}/confirmation`,
      headers: auth(token),
      payload: { expectedImageRevision: 1, objects: [confirmedObject()], context: {} },
    });

    expect(second.statusCode).toBe(409);
    expect(second.json<{ error: { details: { status: string } } }>().error.details.status).toBe(
      'generating_report',
    );
    expect(await countWhere('scan_inputs', 'scan_id = $1', [scanId])).toBe(1);
  });

  it('accepts a confirmation with nothing on the list', async () => {
    const token = await session.sign({ sub: 'confirm-user-empty', isAnonymous: true });
    const scanId = await awaitingConfirmation(token, 'confirm-empty-01');

    const response = await server.inject({
      method: 'POST',
      url: `/v1/scans/${scanId}/confirmation`,
      headers: auth(token),
      payload: { expectedImageRevision: 1, objects: [], context: {} },
    });

    // Removing everything is a legitimate correction: the user decides what the report is about.
    expect(response.statusCode).toBe(201);
    expect(await countWhere('scan_inputs', 'scan_id = $1', [scanId])).toBe(1);
  });

  it('refuses labels outside the catalog, and another user entirely', async () => {
    const owner = await session.sign({ sub: 'confirm-owner', isAnonymous: true });
    const intruder = await session.sign({ sub: 'confirm-intruder', isAnonymous: true });
    const scanId = await awaitingConfirmation(owner, 'confirm-validate-01');

    const badLabel = await server.inject({
      method: 'POST',
      url: `/v1/scans/${scanId}/confirmation`,
      headers: auth(owner),
      payload: {
        expectedImageRevision: 1,
        objects: [confirmedObject({ label: 'brass_vessel' })],
        context: {},
      },
    });
    expect(badLabel.statusCode).toBe(400);
    expect(badLabel.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });

    const outOfRangeBox = await server.inject({
      method: 'POST',
      url: `/v1/scans/${scanId}/confirmation`,
      headers: auth(owner),
      payload: {
        expectedImageRevision: 1,
        objects: [confirmedObject({ boundingBox: { x: 0.9, y: 0.1, width: 0.5, height: 0.2 } })],
        context: {},
      },
    });
    expect(outOfRangeBox.statusCode).toBe(400);

    const denied = await server.inject({
      method: 'POST',
      url: `/v1/scans/${scanId}/confirmation`,
      headers: auth(intruder),
      payload: { expectedImageRevision: 1, objects: [], context: {} },
    });
    expect(denied.statusCode).toBe(404);

    const deniedInput = await server.inject({
      method: 'GET',
      url: `/v1/scans/${scanId}/input`,
      headers: auth(intruder),
    });
    expect(deniedInput.statusCode).toBe(404);
    expect(await countWhere('scan_inputs', 'scan_id = $1', [scanId])).toBe(0);
  });

  it('reports no confirmed input before a confirmation happens', async () => {
    const token = await session.sign({ sub: 'confirm-user-before', isAnonymous: true });
    const scanId = await awaitingConfirmation(token, 'confirm-before-01');

    const response = await server.inject({
      method: 'GET',
      url: `/v1/scans/${scanId}/input`,
      headers: auth(token),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ confirmed: boolean; objects: unknown[] }>()).toMatchObject({
      confirmed: false,
      objects: [],
    });
    expect(await countWhere('scan_inputs', 'scan_id = $1', [scanId])).toBe(0);
  });
});
