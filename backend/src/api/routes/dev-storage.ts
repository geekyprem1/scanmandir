import { z } from 'zod';
import { getConfig } from '../../shared/config.js';
import { AppError, ERROR_CODES } from '../../shared/errors.js';
import { LocalObjectStorage, verifySignature, type TransferMethod } from '../../shared/storage/local.js';
import type { AppServer } from '../types.js';

const QuerySchema = z.object({
  key: z.string().min(1),
  method: z.enum(['put', 'get']),
  expires: z.coerce.number().int().positive(),
  maxBytes: z.coerce.number().int().positive().optional(),
  sig: z.string().min(1),
});

/**
 * Development-only endpoint that terminates locally signed storage transfers, so the
 * signed-upload flow behaves the same shape in development as it will against real
 * object storage.
 *
 * Registration is refused under NODE_ENV=production. This route performs NO user
 * authentication or ownership check — it trusts only the HMAC signature — which is
 * exactly why it must never be exposed publicly. Ownership checks live in the scan and
 * media modules that issue these URLs (P3-04).
 */
export async function registerDevStorageRoutes(server: AppServer): Promise<void> {
  const config = getConfig();
  if (config.isProduction) {
    throw new Error('dev-storage routes must not be registered in production');
  }

  const storage = new LocalObjectStorage();

  server.addContentTypeParser(
    ['image/jpeg', 'image/png', 'image/webp', 'application/octet-stream'],
    { parseAs: 'buffer' },
    (_request, body, done) => done(null, body),
  );

  const authorize = (rawQuery: unknown, method: TransferMethod) => {
    const parsed = QuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'Malformed storage transfer parameters.');
    }
    const query = parsed.data;
    if (query.method !== method) {
      throw new AppError(ERROR_CODES.FORBIDDEN, 'Signature was not issued for this method.');
    }

    const outcome = verifySignature({
      method,
      key: query.key,
      expires: query.expires,
      maxBytes: query.maxBytes ?? null,
      signature: query.sig,
    });

    if (outcome === 'expired') {
      throw new AppError(ERROR_CODES.IMAGE_EXPIRED, 'Signed transfer has expired.');
    }
    if (outcome === 'invalid_signature') {
      throw new AppError(ERROR_CODES.FORBIDDEN, 'Invalid transfer signature.');
    }
    return query;
  };

  server.put('/v1/dev-storage', async (request, reply) => {
    const query = authorize(request.query, 'put');
    const body = request.body;

    if (!Buffer.isBuffer(body)) {
      throw new AppError(ERROR_CODES.UPLOAD_INVALID, 'Upload body must be binary image content.');
    }
    if (query.maxBytes !== undefined && body.byteLength > query.maxBytes) {
      throw new AppError(ERROR_CODES.UPLOAD_INVALID, 'Upload exceeds the signed size limit.', {
        details: { maxBytes: query.maxBytes, received: body.byteLength },
      });
    }

    const contentType = request.headers['content-type'] ?? 'application/octet-stream';
    await storage.putObject(query.key, body, contentType);

    // Note for later: this only records what the client claimed. Real validation decodes
    // the image and checks type, dimensions and resource usage (P4-04).
    return reply.code(204).send();
  });

  server.get('/v1/dev-storage', async (request, reply) => {
    const query = authorize(request.query, 'get');

    const metadata = await storage.headObject(query.key);
    if (!metadata) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Stored object not found.');
    }

    const body = await storage.getObject(query.key);
    return reply
      .code(200)
      .header('content-type', metadata.contentType ?? 'application/octet-stream')
      .header('cache-control', 'private, no-store')
      .send(body);
  });
}
