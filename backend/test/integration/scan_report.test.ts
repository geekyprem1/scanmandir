import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/api/server.js';
import type { AppServer } from '../../src/api/types.js';
import { getPool } from '../../src/shared/db/pool.js';
import { dispatchOutbox } from '../../src/shared/jobs/outbox.js';
import { clearJobHandlers } from '../../src/shared/jobs/registry.js';
import { registerAllJobHandlers } from '../../src/worker/handlers/index.js';
import { tick } from '../../src/worker/runner.js';
import { createTestSession, type TestSession } from '../support/tokens.js';
import { ScriptedVisionProvider, visionObject, visionResponse } from '../support/vision.js';
import { countWhere, resetQueueTables, resetScanTables } from './helpers.js';

const WORKER = 'report-worker';
const vision = new ScriptedVisionProvider();

describe('scan report', () => {
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
        visionObject({ id: 'obs_003', label: 'oil_lamp' }),
      ]);
  });

  afterAll(async () => {
    await server.close();
  });

  function auth(token: string): Record<string, string> {
    return { authorization: `Bearer ${token}` };
  }

  async function jpeg(): Promise<Buffer> {
    return sharp({ create: { width: 1200, height: 900, channels: 3, background: { r: 20, g: 90, b: 60 } } })
      .jpeg()
      .toBuffer();
  }

  function confirmedObject(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: 'obs_001',
      label: 'ganesh',
      category: 'deity_representation',
      representationType: 'statue',
      groupId: null,
      memberLabels: null,
      boundingBox: { x: 0.2, y: 0.2, width: 0.3, height: 0.3 },
      modelConfidence: 0.9,
      verificationRequired: false,
      action: 'confirmed',
      correctedFrom: null,
      ...overrides,
    };
  }

  it("lists only the owner's completed reports with a stable cursor", async () => {
    const owner = await session.sign({ sub: 'history-owner', isAnonymous: true });
    const other = await session.sign({ sub: 'history-other', isAnonymous: true });
    const first = await confirmedScan(owner, 'history-owner-01', [confirmedObject()]);
    await dispatchOutbox(5);
    await tick(WORKER);
    const second = await confirmedScan(owner, 'history-owner-02', [confirmedObject()]);
    await dispatchOutbox(5);
    await tick(WORKER);
    await confirmedScan(other, 'history-other-01', [confirmedObject()]);
    await dispatchOutbox(5);
    await tick(WORKER);

    const firstPage = await server.inject({
      method: 'GET',
      url: '/v1/reports?limit=1',
      headers: auth(owner),
    });
    expect(firstPage.statusCode).toBe(200);
    const page = firstPage.json<{ items: { scanId: string; itemCount: number }[]; nextCursor: string }>();
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.scanId).toBe(second);
    expect(page.items[0]?.itemCount).toBe(1);

    const next = await server.inject({
      method: 'GET',
      url: `/v1/reports?limit=1&cursor=${page.nextCursor}`,
      headers: auth(owner),
    });
    expect(next.json<{ items: { scanId: string }[]; nextCursor: string | null }>().items).toEqual([
      { scanId: first, createdAt: expect.any(String), generatedAt: expect.any(String), itemCount: 1 },
    ]);
    expect(next.json<{ nextCursor: string | null }>().nextCursor).toBeNull();
    expect(
      (await server.inject({ method: 'GET', url: '/v1/reports?cursor=bad', headers: auth(owner) }))
        .statusCode,
    ).toBe(400);
    expect((await server.inject({ method: 'GET', url: '/v1/reports' })).statusCode).toBe(401);
  });

  /** A scan that has been analysed, confirmed, and is waiting for its report. */
  async function confirmedScan(
    token: string,
    idempotencyKey: string,
    objects: Record<string, unknown>[],
  ): Promise<string> {
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

    const confirmation = await server.inject({
      method: 'POST',
      url: `/v1/scans/${scanId}/confirmation`,
      headers: auth(token),
      payload: { expectedImageRevision: 1, objects, context: { tradition: 'north_indian' } },
    });
    expect(confirmation.statusCode).toBe(201);
    return scanId;
  }

  it('generates a report from the confirmed input, completes the scan, and consumes the allowance', async () => {
    const token = await session.sign({ sub: 'report-user-ok', isAnonymous: true });
    const scanId = await confirmedScan(token, 'report-ok-01', [
      confirmedObject(),
      confirmedObject({
        id: 'obs_002',
        label: 'diya',
        category: 'puja_object',
        representationType: 'physical_object',
      }),
      // Corrected by the user, and something they added themselves.
      confirmedObject({
        id: 'obs_003',
        label: 'oil_lamp',
        category: 'puja_object',
        representationType: 'physical_object',
        action: 'corrected',
        correctedFrom: 'diya',
      }),
      confirmedObject({
        id: 'user-1',
        label: 'bell',
        category: 'puja_object',
        representationType: 'physical_object',
        modelConfidence: null,
        action: 'added',
      }),
    ]);

    await dispatchOutbox(5);
    const result = await tick(WORKER);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);

    const scan = await server.inject({
      method: 'GET',
      url: `/v1/scans/${scanId}`,
      headers: auth(token),
    });
    expect(scan.json<{ status: string; nextAction: string }>()).toMatchObject({
      status: 'completed',
      nextAction: 'view_report',
    });

    // The report says what the user confirmed, and where each item came from.
    const report = await server.inject({
      method: 'GET',
      url: `/v1/scans/${scanId}/report`,
      headers: auth(token),
    });
    expect(report.statusCode).toBe(200);
    const body = report.json<{
      available: boolean;
      report: {
        reportVersion: string;
        inputRevision: number;
        summary: Record<string, number>;
        items: {
          id: string;
          label: string;
          action: string;
          verificationRequired: boolean;
          located: boolean;
        }[];
        visualFindings: unknown[];
        traditionalGuidance: { status: string; reason: string };
        sources: unknown[];
        disclaimer: { informational: boolean; replacesQualifiedAdvice: boolean };
      };
    }>();
    expect(body.available).toBe(true);
    expect(body.report.reportVersion).toBe('1');
    expect(body.report.inputRevision).toBe(1);
    expect(body.report.summary).toMatchObject({
      items: 4,
      fromModel: 2,
      corrected: 1,
      added: 1,
      locationsKnown: 4,
    });
    // Everything the user touched needs a human's eye, and the report says so itself.
    expect(body.report.summary.itemsNeedingCheck).toBe(2);
    expect(body.report.items.map((item) => item.action)).toEqual([
      'confirmed',
      'confirmed',
      'corrected',
      'added',
    ]);
    // Traditional guidance is absent rather than invented, with the reason stated.
    expect(body.report.traditionalGuidance).toMatchObject({
      status: 'not_available',
      reason: 'reviewed_rules_not_published',
    });
    expect(body.report.sources).toEqual([]);
    expect(body.report.disclaimer).toMatchObject({
      informational: true,
      replacesQualifiedAdvice: false,
    });

    // The allowance is consumed exactly once, on the first successful report.
    expect(await countWhere('quota_ledger', 'scan_id = $1 AND kind = $2', [scanId, 'consume'])).toBe(1);
    expect(await countWhere('reports', 'scan_id = $1', [scanId])).toBe(1);
  });

  it('never reports an item the user removed, and keeps a correction as the corrected label', async () => {
    const token = await session.sign({ sub: 'report-user-removed', isAnonymous: true });
    const scanId = await confirmedScan(token, 'report-removed-01', [
      confirmedObject(),
      confirmedObject({
        id: 'obs_002',
        label: 'oil_lamp',
        category: 'puja_object',
        representationType: 'physical_object',
        action: 'corrected',
        correctedFrom: 'diya',
      }),
    ]);

    await dispatchOutbox(5);
    await tick(WORKER);

    const report = await server.inject({
      method: 'GET',
      url: `/v1/scans/${scanId}/report`,
      headers: auth(token),
    });
    const body = report.json<{
      report: { items: { id: string; label: string }[]; summary: { items: number } };
    }>();

    expect(body.report.summary.items).toBe(2);
    expect(body.report.items.map((item) => item.label)).toEqual(['ganesh', 'oil_lamp']);
  });

  it('does not generate a second report for the same revision', async () => {
    const token = await session.sign({ sub: 'report-user-twice', isAnonymous: true });
    const scanId = await confirmedScan(token, 'report-twice-01', [confirmedObject()]);

    await dispatchOutbox(5);
    await tick(WORKER);
    expect(await countWhere('reports', 'scan_id = $1', [scanId])).toBe(1);

    // Rewind the job the way an expired lease would, and run it again.
    await getPool().query(`UPDATE jobs SET status = 'pending', run_after = now() WHERE dedupe_key = $1`, [
      `scan:${scanId}:report:input1`,
    ]);
    const second = await tick(WORKER);

    expect(second.succeeded).toBe(1);
    expect(await countWhere('reports', 'scan_id = $1', [scanId])).toBe(1);
    expect(await countWhere('quota_ledger', 'scan_id = $1 AND kind = $2', [scanId, 'consume'])).toBe(1);
  });

  it('says the report is not ready rather than pretending it is missing', async () => {
    const token = await session.sign({ sub: 'report-user-notready', isAnonymous: true });
    const scanId = await confirmedScan(token, 'report-notready-01', [confirmedObject()]);

    // Confirmed, but the worker has not run yet.
    const before = await server.inject({
      method: 'GET',
      url: `/v1/scans/${scanId}/report`,
      headers: auth(token),
    });
    expect(before.statusCode).toBe(200);
    expect(before.json<{ available: boolean; status: string }>()).toMatchObject({
      available: false,
      status: 'generating_report',
    });
  });

  it('does not show the report to anyone but its owner', async () => {
    const owner = await session.sign({ sub: 'report-owner', isAnonymous: true });
    const intruder = await session.sign({ sub: 'report-intruder', isAnonymous: true });
    const scanId = await confirmedScan(owner, 'report-privacy-01', [confirmedObject()]);

    await dispatchOutbox(5);
    await tick(WORKER);

    const denied = await server.inject({
      method: 'GET',
      url: `/v1/scans/${scanId}/report`,
      headers: auth(intruder),
    });
    expect(denied.statusCode).toBe(404);
  });
});
