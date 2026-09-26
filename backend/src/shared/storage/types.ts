export interface SignedTransfer {
  url: string;
  expiresAt: Date;
  /** Headers the client must send. Signed uploads constrain content type and size. */
  requiredHeaders: Record<string, string>;
}

export interface ObjectMetadata {
  key: string;
  size: number;
  contentType: string | null;
  lastModified: Date;
}

export interface CreateUploadUrlOptions {
  contentType: string;
  maxBytes: number;
}

/**
 * Storage abstraction. Production will use private S3-compatible object storage, but
 * that vendor is an open decision (docs/decisions.md D-07), so nothing above this
 * interface may depend on a specific provider's SDK or URL shape.
 *
 * Objects are always private. Access is granted only through short-lived signed
 * transfers issued after an ownership check (ARCHITECTURE.md sections 10 and 12).
 */
export interface ObjectStorage {
  readonly driver: string;

  createUploadUrl(key: string, options: CreateUploadUrlOptions): Promise<SignedTransfer>;
  createReadUrl(key: string): Promise<SignedTransfer>;

  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  /** Returns null when the object does not exist, rather than throwing. */
  headObject(key: string): Promise<ObjectMetadata | null>;
  deleteObject(key: string): Promise<void>;
}

/**
 * Object keys are server-generated. This rejects traversal, absolute paths and anything
 * that would escape the storage root once mapped onto a filesystem.
 */
const SAFE_KEY = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,255}$/;

export function assertSafeObjectKey(key: string): void {
  if (!SAFE_KEY.test(key) || key.includes('..') || key.includes('//')) {
    throw new Error(`Unsafe object key: ${key}`);
  }
}
