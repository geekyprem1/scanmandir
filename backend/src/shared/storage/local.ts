import fs from 'node:fs/promises';
import path from 'node:path';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getConfig } from '../config.js';
import {
  assertSafeObjectKey,
  type CreateUploadUrlOptions,
  type ObjectMetadata,
  type ObjectStorage,
  type SignedTransfer,
} from './types.js';

export type TransferMethod = 'put' | 'get';

export interface SignatureFields {
  method: TransferMethod;
  key: string;
  expires: number;
  signature: string;
}

function sign(method: TransferMethod, key: string, expires: number, maxBytes: number | null): string {
  const config = getConfig();
  const material = `${method}\n${key}\n${expires}\n${maxBytes ?? ''}`;
  return createHmac('sha256', config.STORAGE_URL_SECRET).update(material).digest('base64url');
}

export interface VerifyInput extends SignatureFields {
  maxBytes: number | null;
  now?: Date;
}

export type VerifyOutcome = 'valid' | 'expired' | 'invalid_signature';

/**
 * Verifies a locally signed transfer. Comparison is constant time so a mismatched
 * signature cannot be discovered byte by byte.
 */
export function verifySignature(input: VerifyInput): VerifyOutcome {
  const expected = sign(input.method, input.key, input.expires, input.maxBytes);
  const provided = Buffer.from(input.signature);
  const wanted = Buffer.from(expected);

  if (provided.length !== wanted.length || !timingSafeEqual(provided, wanted)) {
    return 'invalid_signature';
  }
  const now = input.now ?? new Date();
  if (input.expires * 1000 <= now.getTime()) {
    return 'expired';
  }
  return 'valid';
}

/**
 * Filesystem-backed storage for local development and tests.
 *
 * It deliberately mimics the production shape — private objects, short-lived signed
 * transfers, explicit content-type and size limits — so the calling code does not have
 * to change when a real object store is chosen. It is not suitable for production and
 * config.ts refuses to start with it when NODE_ENV=production.
 */
export class LocalObjectStorage implements ObjectStorage {
  readonly driver = 'local';

  private readonly root: string;

  constructor(rootDir?: string) {
    const config = getConfig();
    this.root = path.resolve(rootDir ?? config.STORAGE_LOCAL_DIR);
  }

  /** Public for the dev-storage route, which must resolve the same path this class writes. */
  resolvePath(key: string): string {
    assertSafeObjectKey(key);
    const resolved = path.resolve(this.root, key);
    const relative = path.relative(this.root, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Object key escapes storage root: ${key}`);
    }
    return resolved;
  }

  private buildUrl(method: TransferMethod, key: string, maxBytes: number | null): SignedTransfer {
    const config = getConfig();
    const expiresAt = new Date(Date.now() + config.STORAGE_URL_TTL_SECONDS * 1000);
    const expires = Math.floor(expiresAt.getTime() / 1000);
    const signature = sign(method, key, expires, maxBytes);

    const url = new URL('/v1/dev-storage', config.STORAGE_PUBLIC_BASE_URL);
    url.searchParams.set('key', key);
    url.searchParams.set('method', method);
    url.searchParams.set('expires', String(expires));
    if (maxBytes !== null) url.searchParams.set('maxBytes', String(maxBytes));
    url.searchParams.set('sig', signature);

    return { url: url.toString(), expiresAt, requiredHeaders: {} };
  }

  async createUploadUrl(key: string, options: CreateUploadUrlOptions): Promise<SignedTransfer> {
    assertSafeObjectKey(key);
    const transfer = this.buildUrl('put', key, options.maxBytes);
    return {
      ...transfer,
      requiredHeaders: { 'content-type': options.contentType },
    };
  }

  async createReadUrl(key: string): Promise<SignedTransfer> {
    assertSafeObjectKey(key);
    return this.buildUrl('get', key, null);
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    const target = this.resolvePath(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body);
    // Content type is not a filesystem concept, so it is kept beside the object.
    await fs.writeFile(`${target}.meta.json`, JSON.stringify({ contentType }), 'utf8');
  }

  async getObject(key: string): Promise<Buffer> {
    return fs.readFile(this.resolvePath(key));
  }

  async headObject(key: string): Promise<ObjectMetadata | null> {
    const target = this.resolvePath(key);
    try {
      const stat = await fs.stat(target);
      let contentType: string | null = null;
      try {
        const meta = JSON.parse(await fs.readFile(`${target}.meta.json`, 'utf8')) as {
          contentType?: string;
        };
        contentType = meta.contentType ?? null;
      } catch {
        contentType = null;
      }
      return { key, size: stat.size, contentType, lastModified: stat.mtime };
    } catch {
      return null;
    }
  }

  async deleteObject(key: string): Promise<void> {
    const target = this.resolvePath(key);
    await fs.rm(target, { force: true });
    await fs.rm(`${target}.meta.json`, { force: true });
  }
}
