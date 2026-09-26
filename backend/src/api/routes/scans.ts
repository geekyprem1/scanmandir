import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { currentAllowancePeriod, reserveAllowance } from '../../modules/billing/quota.js';
import {
  findOwnedScan,
  findScanByIdempotencyKey,
  insertScan,
  lockOwnedScan,
  recordOriginalMedia,
  setScanStatus,
  type Scan,
  type ScanStatus,
} from '../../modules/scans/scan_repository.js';
import { findLatestAnalysis } from '../../modules/vision/repository.js';
import { getConfig } from '../../shared/config.js';
import { getPool, withTransaction } from '../../shared/db/pool.js';
import { AppError, ERROR_CODES } from '../../shared/errors.js';
import { appendOutboxEvent } from '../../shared/jobs/outbox.js';
import { getObjectStorage } from '../../shared/storage/index.js';
import { assertSafeObjectKey } from '../../shared/storage/types.js';
import { requireCaller } from '../plugins/auth.js';
import type { AppServer } from '../types.js';
import { parseOrThrow } from '../validation.js';

const CreateScanSchema = z.object({ idempotencyKey: z.string().min(8).max(128) }).strict();
const UploadUrlSchema = z.object({ contentType: z.string().min(3).max(64) }).strict();
const UploadCompleteSchema = z.object({ stagingKey: z.string().min(1).max(256) }).strict();
const ScanParamsSchema = z.object({ id: z.string().uuid() });

/** What the client should do next, derived from the state (ARCHITECTURE.md section 6). */
function nextActionFor(status: ScanStatus): string {
  switch (status) {
    case 'awaiting_upload':
      return 'upload';
    case 'needs_retake':
      return 'retake';
    case 'awaiting_confirmation':
      return 'confirm';
    case 'completed':
      return 'view_report';
    case 'failed':
      return 'retry';
    case 'queued':
    case 'analyzing':
    case 'generating_report':
      return 'wait';
  }
}

/**
 * Wire shape for a scan. Deletion is reported as a status even though it is stored as a
 * timestamp, because it is terminal and takes precedence over whatever the worker does.
 */
function scanBody(scan: Scan): Record<string, unknown> {
  return {
    id: scan.id,
    status: scan.deletedAt ? 'deleted' : scan.status,
    imageRevision: scan.imageRevision,
    inputRevision: scan.inputRevision,
    failedStage: scan.failedStage,
    /** The quality gate's reasons when the photo was refused; empty otherwise. */
    retakeReasons: scan.retakeReason,
    nextAction: scan.deletedAt ? null : nextActionFor(scan.status),
    createdAt: scan.createdAt.toISOString(),
    updatedAt: scan.updatedAt.toISOString(),
  };
}

/**
 * Upload keys are server-generated and scan-scoped. A client never chooses its own key:
 * it receives a staging key with the upload URL and hands the same key back at
 * completion, where the prefix is re-checked against the scan it claims to belong to.
 */
function stagingPrefix(userId: string, scan: Scan): string {
  return `scans/${userId}/${scan.id}/r${scan.imageRevision}/staging/`;
}

function canonicalKey(userId: string, scan: Scan): string {
  return `scans/${userId}/${scan.id}/r${scan.imageRevision}/original`;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';
}

export async function registerScanRoutes(server: AppServer): Promise<void> {
  const config = getConfig();
  const storage = getObjectStorage();
  const allowedContentTypes = config.UPLOAD_ALLOWED_CONTENT_TYPES;

  /**
   * Creates a scan and reserves allowance before any paid provider work, in one
   * transaction: a client that runs out of allowance must not leave a scan behind
   * (ARCHITECTURE.md section 6, step 1).
   *
   * Idempotency is scoped by owner and key. Replaying the same request returns the same
   * scan; reusing the key with different input is a conflict rather than a silent replay.
   */
  server.post('/v1/scans', { preHandler: server.authenticate }, async (request, reply) => {
    const caller = requireCaller(request);
    const { idempotencyKey } = parseOrThrow(CreateScanSchema, request.body);
    const requestHash = createHash('sha256').update(JSON.stringify({ idempotencyKey })).digest('hex');

    const outcome = await withTransaction(async (tx) => {
      const existing = await findScanByIdempotencyKey(tx, caller.id, idempotencyKey);
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new AppError(
            ERROR_CODES.REVISION_CONFLICT,
            'This idempotency key was already used with different input.',
          );
        }
        return { scan: existing.scan, replayed: true };
      }

      const scan = await insertScan(tx, { userId: caller.id, idempotencyKey, requestHash });

      const period = currentAllowancePeriod();
      const reserved = await reserveAllowance(tx, {
        userId: caller.id,
        scanId: scan.id,
        operationKey: `scan:${scan.id}:reserve`,
        period,
      });
      if (!reserved) {
        throw new AppError(ERROR_CODES.QUOTA_EXCEEDED, 'No scan allowance remains in this period.', {
          details: { periodEndsAt: period.end.toISOString() },
        });
      }

      return { scan, replayed: false };
    }).catch(async (error: unknown) => {
      // Two concurrent retries can both miss the lookup and race the unique index; the
      // loser re-reads and answers as a replay instead of surfacing a database error.
      if (!isUniqueViolation(error)) throw error;
      const raced = await findScanByIdempotencyKey(getPool(), caller.id, idempotencyKey);
      if (raced && raced.requestHash === requestHash) {
        return { scan: raced.scan, replayed: true };
      }
      throw new AppError(
        ERROR_CODES.REVISION_CONFLICT,
        'This idempotency key was already used with different input.',
      );
    });

    return reply.code(outcome.replayed ? 200 : 201).send(scanBody(outcome.scan));
  });

  /** A short-lived URL scoped to this scan's staging key, content type and size limit. */
  server.post('/v1/scans/:id/upload-url', { preHandler: server.authenticate }, async (request) => {
    const caller = requireCaller(request);
    const { id } = parseOrThrow(ScanParamsSchema, request.params);
    const { contentType } = parseOrThrow(UploadUrlSchema, request.body);

    if (!allowedContentTypes.includes(contentType.toLowerCase())) {
      throw new AppError(ERROR_CODES.UPLOAD_INVALID, 'Unsupported image content type.', {
        details: { allowed: allowedContentTypes },
      });
    }

    const scan = await findOwnedScan(getPool(), caller.id, id);
    if (!scan) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Scan not found.');
    }
    if (scan.status !== 'awaiting_upload') {
      throw new AppError(ERROR_CODES.REVISION_CONFLICT, 'This scan is not waiting for an upload.');
    }

    const key = `${stagingPrefix(caller.id, scan)}${randomUUID()}`;
    const transfer = await storage.createUploadUrl(key, {
      contentType,
      maxBytes: config.UPLOAD_MAX_BYTES,
    });

    return {
      uploadUrl: transfer.url,
      expiresAt: transfer.expiresAt.toISOString(),
      requiredHeaders: transfer.requiredHeaders,
      stagingKey: key,
    };
  });

  /**
   * Verifies the uploaded object, pins an immutable copy, records it, and queues
   * analysis.
   *
   * The state change and the outbox event commit together, so the promise to analyse
   * cannot survive without the state that justifies it (ARCHITECTURE.md section 6).
   */
  server.post('/v1/scans/:id/upload-complete', { preHandler: server.authenticate }, async (request) => {
    const caller = requireCaller(request);
    const { id } = parseOrThrow(ScanParamsSchema, request.params);
    const { stagingKey } = parseOrThrow(UploadCompleteSchema, request.body);

    await withTransaction(async (tx) => {
      const scan = await lockOwnedScan(tx, caller.id, id);
      if (!scan) {
        throw new AppError(ERROR_CODES.NOT_FOUND, 'Scan not found.');
      }
      if (scan.status !== 'awaiting_upload') {
        throw new AppError(ERROR_CODES.REVISION_CONFLICT, 'This scan is not waiting for an upload.');
      }

      // The key must live under this scan's own staging prefix: a client cannot point
      // completion at another scan's object.
      if (!stagingKey.startsWith(stagingPrefix(caller.id, scan))) {
        throw new AppError(ERROR_CODES.UPLOAD_INVALID, 'The staging key does not belong to this scan.');
      }
      try {
        assertSafeObjectKey(stagingKey);
      } catch {
        throw new AppError(ERROR_CODES.UPLOAD_INVALID, 'The staging key is not a valid object key.');
      }

      const metadata = await storage.headObject(stagingKey);
      if (!metadata) {
        throw new AppError(ERROR_CODES.UPLOAD_INVALID, 'No uploaded object was found for this scan.');
      }
      if (metadata.size <= 0 || metadata.size > config.UPLOAD_MAX_BYTES) {
        throw new AppError(ERROR_CODES.UPLOAD_INVALID, 'The uploaded object exceeds its signed size limit.', {
          details: { maxBytes: config.UPLOAD_MAX_BYTES, received: metadata.size },
        });
      }

      const contentType = (metadata.contentType ?? '').toLowerCase();
      if (!allowedContentTypes.includes(contentType)) {
        throw new AppError(ERROR_CODES.UPLOAD_INVALID, 'The uploaded object is not an accepted image type.', {
          details: { allowed: allowedContentTypes, received: metadata.contentType },
        });
      }

      // Pin before analysis: copy the staging object to its immutable canonical key,
      // then drop the staging copy. A crash between the two leaves an orphan, never a
      // scan pointing at a mutable object.
      const pinnedKey = canonicalKey(caller.id, scan);
      const bytes = await storage.getObject(stagingKey);
      await storage.putObject(pinnedKey, bytes, contentType);
      await storage.deleteObject(stagingKey);

      await recordOriginalMedia(tx, {
        scanId: scan.id,
        imageRevision: scan.imageRevision,
        storageKey: pinnedKey,
        contentType,
        byteSize: metadata.size,
      });

      await setScanStatus(tx, scan.id, 'queued');

      await appendOutboxEvent(tx, {
        eventType: 'scan.upload_verified',
        aggregateType: 'scan',
        aggregateId: scan.id,
        // Named for the stage it causes. The key also becomes the job's dedupe key, so it
        // has to differ from the analysis job that preparation will enqueue later.
        dedupeKey: `scan:${scan.id}:prepare:r${scan.imageRevision}`,
        payload: {
          scanId: scan.id,
          userId: caller.id,
          imageRevision: scan.imageRevision,
        },
      });
    });

    const updated = await findOwnedScan(getPool(), caller.id, id);
    if (!updated) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Scan not found.');
    }
    return scanBody(updated);
  });

  /** State, revisions and the next action. Another user's scan does not resolve. */
  server.get('/v1/scans/:id', { preHandler: server.authenticate }, async (request) => {
    const caller = requireCaller(request);
    const { id } = parseOrThrow(ScanParamsSchema, request.params);

    const scan = await findOwnedScan(getPool(), caller.id, id);
    if (!scan) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Scan not found.');
    }
    return scanBody(scan);
  });

  /**
   * What the model saw, for the confirmation screen (TASKS P5-05).
   *
   * Only the latest analysis of the revision the scan is on: a retake moves to a new
   * revision and a re-analysis inserts a new run, so older runs are history rather than
   * something a screen should show. `modelConfidence` travels with each object but is the
   * model's own uncalibrated number — nothing here may be presented as a probability of
   * being correct (PRD section 10).
   */
  server.get('/v1/scans/:id/observations', { preHandler: server.authenticate }, async (request) => {
    const caller = requireCaller(request);
    const { id } = parseOrThrow(ScanParamsSchema, request.params);

    const scan = await findOwnedScan(getPool(), caller.id, id);
    if (!scan) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Scan not found.');
    }

    const analysis = await findLatestAnalysis(getPool(), scan.id, scan.imageRevision);
    if (!analysis) {
      // Not an error: a scan that has not been analysed yet has nothing to show, and the
      // scan's own status already says which stage it is in.
      return {
        scanId: scan.id,
        imageRevision: scan.imageRevision,
        inputRevision: scan.inputRevision,
        analysed: false,
        run: null,
        observations: [],
        findings: [],
      };
    }

    return {
      scanId: scan.id,
      imageRevision: scan.imageRevision,
      inputRevision: scan.inputRevision,
      analysed: true,
      run: {
        id: analysis.run.id,
        model: analysis.run.model,
        provider: analysis.run.provider,
        promptVersion: analysis.run.promptVersion,
        schemaVersion: analysis.run.schemaVersion,
        latencyMs: analysis.run.latencyMs,
        attempts: analysis.run.attempts,
        imageUsable: analysis.run.imageUsable,
        looksLikeHomeMandir: analysis.run.looksLikeHomeMandir,
        qualityReasons: analysis.run.qualityReasons,
        analysedAt: analysis.run.createdAt.toISOString(),
      },
      observations: analysis.observations.map((observation) => ({
        id: observation.displayId,
        category: observation.category,
        label: observation.label,
        representationType: observation.representationType,
        groupId: observation.groupId,
        memberLabels: observation.memberLabels,
        boundingBox: observation.boundingBox,
        modelConfidence: observation.modelConfidence,
        verificationRequired: observation.verificationRequired,
      })),
      findings: analysis.findings,
    };
  });
}
