import { getConfig } from '../config.js';
import {
  assertSafeObjectKey,
  type CreateUploadUrlOptions,
  type ObjectMetadata,
  type ObjectStorage,
  type SignedTransfer,
} from './types.js';

/**
 * Signed upload tokens are issued with a fixed two-hour lifetime by the Storage API;
 * unlike the local driver this is not configurable, so the returned expiry is advisory.
 */
const SIGNED_UPLOAD_TTL_MS = 2 * 60 * 60 * 1000;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface SupabaseStorageOptions {
  /** Injected in tests; production uses the global fetch. */
  fetchImpl?: FetchLike | undefined;
}

/**
 * Private object storage on Supabase (docs/decisions.md D-16).
 *
 * Everything the backend does — write, pin, read for validation, delete — uses the
 * server-only secret key. The client never talks to this API with credentials: it
 * receives short-lived signed URLs issued after an ownership check, exactly as the local
 * driver does, so the upload flow is identical in both environments.
 *
 * The bucket is created on first use with the same size and content-type limits the
 * upload flow enforces, which means a signed upload is rejected by Storage itself rather
 * than only by our validation after the fact.
 */
export class SupabaseObjectStorage implements ObjectStorage {
  readonly driver = 'supabase';

  private readonly fetchImpl: FetchLike;
  /** e.g. https://<ref>.supabase.co/storage/v1, without a trailing slash. */
  private readonly baseUrl: string;
  private readonly bucket: string;
  private readonly serviceKey: string;
  private bucketReady: Promise<void> | null = null;

  constructor(options: SupabaseStorageOptions = {}) {
    const config = getConfig();
    if (!config.SUPABASE_SERVICE_KEY) {
      throw new Error('SUPABASE_SERVICE_KEY is required for the Supabase storage driver.');
    }

    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = new URL('/storage/v1', config.SUPABASE_URL).toString().replace(/\/$/, '');
    this.bucket = config.STORAGE_BUCKET;
    this.serviceKey = config.SUPABASE_SERVICE_KEY;
  }

  private request(method: string, path: string, init: RequestInit = {}): Promise<Response> {
    return this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      method,
      headers: {
        // Belt and braces: the gateway reads `apikey`, the service reads `authorization`.
        apikey: this.serviceKey,
        authorization: `Bearer ${this.serviceKey}`,
        ...(init.headers ?? {}),
      },
    });
  }

  private async requestOrThrow(method: string, path: string, init: RequestInit = {}): Promise<Response> {
    const response = await this.request(method, path, init);
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Supabase storage ${method} ${path} failed with ${response.status}: ${detail.slice(0, 300)}`,
      );
    }
    return response;
  }

  /** Signed URLs come back relative to the storage API root. */
  private absolute(relativeUrl: string): string {
    return `${this.baseUrl}${relativeUrl.startsWith('/') ? relativeUrl : `/${relativeUrl}`}`;
  }

  /**
   * Creates the private bucket once per process when it does not exist yet. Existing
   * buckets are left alone: adjusting limits is a deliberate operator action, not
   * something a running API should do behind the scenes.
   */
  private ensureBucket(): Promise<void> {
    this.bucketReady ??= (async () => {
      const existing = await this.request('GET', `/bucket/${this.bucket}`);
      if (existing.ok) return;

      if (existing.status !== 404 && existing.status !== 400) {
        const detail = await existing.text().catch(() => '');
        throw new Error(
          `Supabase storage could not read bucket ${this.bucket}: ${existing.status} ${detail.slice(0, 200)}`,
        );
      }

      const config = getConfig();
      const created = await this.request('POST', '/bucket', {
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: this.bucket,
          name: this.bucket,
          public: false,
          file_size_limit: config.UPLOAD_MAX_BYTES,
          allowed_mime_types: config.UPLOAD_ALLOWED_CONTENT_TYPES,
        }),
      });
      if (!created.ok) {
        const detail = await created.text().catch(() => '');
        throw new Error(
          `Supabase storage could not create bucket ${this.bucket}: ${created.status} ${detail.slice(0, 200)}`,
        );
      }
    })();

    return this.bucketReady;
  }

  async createUploadUrl(key: string, options: CreateUploadUrlOptions): Promise<SignedTransfer> {
    assertSafeObjectKey(key);
    await this.ensureBucket();

    const response = await this.requestOrThrow('POST', `/object/upload/sign/${this.bucket}/${key}`, {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body = (await response.json()) as { url: string };

    return {
      url: this.absolute(body.url),
      expiresAt: new Date(Date.now() + SIGNED_UPLOAD_TTL_MS),
      requiredHeaders: { 'content-type': options.contentType },
    };
  }

  async createReadUrl(key: string): Promise<SignedTransfer> {
    assertSafeObjectKey(key);
    const ttlSeconds = getConfig().STORAGE_URL_TTL_SECONDS;

    const response = await this.requestOrThrow('POST', `/object/sign/${this.bucket}/${key}`, {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expiresIn: ttlSeconds }),
    });
    const body = (await response.json()) as { signedURL: string };

    return {
      url: this.absolute(body.signedURL),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      requiredHeaders: {},
    };
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    assertSafeObjectKey(key);
    await this.ensureBucket();

    // PUT forces upsert on the Storage API, which keeps pinning idempotent if a worker
    // or request is retried after a partial failure.
    await this.requestOrThrow('PUT', `/object/${this.bucket}/${key}`, {
      headers: { 'content-type': contentType, 'x-upsert': 'true' },
      body,
    });
  }

  async getObject(key: string): Promise<Buffer> {
    assertSafeObjectKey(key);
    const response = await this.requestOrThrow('GET', `/object/${this.bucket}/${key}`);
    return Buffer.from(await response.arrayBuffer());
  }

  async headObject(key: string): Promise<ObjectMetadata | null> {
    assertSafeObjectKey(key);

    const response = await this.request('HEAD', `/object/authenticated/${this.bucket}/${key}`);
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Supabase storage HEAD ${key} failed with ${response.status}`);
    }

    const length = response.headers.get('content-length');
    if (length === null) {
      throw new Error(`Supabase storage HEAD ${key} returned no content-length.`);
    }

    const lastModified = response.headers.get('last-modified');
    return {
      key,
      size: Number(length),
      contentType: response.headers.get('content-type'),
      lastModified: lastModified ? new Date(lastModified) : new Date(),
    };
  }

  async deleteObject(key: string): Promise<void> {
    assertSafeObjectKey(key);

    const response = await this.request('DELETE', `/object/${this.bucket}/${key}`);
    // Deleting what is already gone is not an error: the local driver behaves the same
    // way, and retention cleanup should not fail on a second pass.
    if (response.ok || response.status === 404) return;

    const detail = await response.text().catch(() => '');
    throw new Error(`Supabase storage DELETE ${key} failed with ${response.status}: ${detail.slice(0, 200)}`);
  }
}
