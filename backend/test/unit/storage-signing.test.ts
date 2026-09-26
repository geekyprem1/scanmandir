import { describe, expect, it } from 'vitest';
import { LocalObjectStorage, verifySignature } from '../../src/shared/storage/local.js';
import { assertSafeObjectKey } from '../../src/shared/storage/types.js';

function parse(url: string) {
  const parsed = new URL(url);
  return {
    key: parsed.searchParams.get('key') ?? '',
    method: (parsed.searchParams.get('method') ?? '') as 'put' | 'get',
    expires: Number(parsed.searchParams.get('expires')),
    maxBytes: parsed.searchParams.has('maxBytes') ? Number(parsed.searchParams.get('maxBytes')) : null,
    signature: parsed.searchParams.get('sig') ?? '',
  };
}

describe('object key safety', () => {
  it('accepts server-generated keys', () => {
    expect(() => assertSafeObjectKey('scans/abc-123/original/1.jpg')).not.toThrow();
  });

  it('rejects traversal and absolute paths', () => {
    for (const key of [
      '../etc/passwd',
      'scans/../../secret',
      '/absolute/path',
      'scans//double',
      '',
      'has space.jpg',
      'scans/\u0000null',
    ]) {
      expect(() => assertSafeObjectKey(key), key).toThrow();
    }
  });

  it('refuses to resolve a key outside the storage root', () => {
    const storage = new LocalObjectStorage('.storage-unit');
    expect(() => storage.resolvePath('../escape.jpg')).toThrow();
  });
});

describe('signed transfers', () => {
  it('accepts a freshly issued upload signature', async () => {
    const storage = new LocalObjectStorage('.storage-unit');
    const transfer = await storage.createUploadUrl('scans/s1/original.jpg', {
      contentType: 'image/jpeg',
      maxBytes: 1024,
    });

    expect(verifySignature({ ...parse(transfer.url), now: new Date() })).toBe('valid');
    expect(transfer.requiredHeaders['content-type']).toBe('image/jpeg');
    expect(transfer.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects a read signature replayed as an upload', async () => {
    const storage = new LocalObjectStorage('.storage-unit');
    const read = await storage.createReadUrl('scans/s1/original.jpg');
    const fields = parse(read.url);

    expect(verifySignature({ ...fields, method: 'put' })).toBe('invalid_signature');
  });

  it('rejects a signature reused for a different key', async () => {
    const storage = new LocalObjectStorage('.storage-unit');
    const transfer = await storage.createUploadUrl('scans/s1/original.jpg', {
      contentType: 'image/jpeg',
      maxBytes: 1024,
    });
    const fields = parse(transfer.url);

    expect(verifySignature({ ...fields, key: 'scans/s2/original.jpg' })).toBe('invalid_signature');
  });

  it('rejects a raised size limit', async () => {
    const storage = new LocalObjectStorage('.storage-unit');
    const transfer = await storage.createUploadUrl('scans/s1/original.jpg', {
      contentType: 'image/jpeg',
      maxBytes: 1024,
    });
    const fields = parse(transfer.url);

    expect(verifySignature({ ...fields, maxBytes: 10_000_000 })).toBe('invalid_signature');
  });

  it('reports expiry separately from tampering', async () => {
    const storage = new LocalObjectStorage('.storage-unit');
    const transfer = await storage.createReadUrl('scans/s1/original.jpg');
    const fields = parse(transfer.url);

    const later = new Date((fields.expires + 1) * 1000);
    expect(verifySignature({ ...fields, now: later })).toBe('expired');
  });

  it('rejects a mutated signature of the same length', async () => {
    const storage = new LocalObjectStorage('.storage-unit');
    const transfer = await storage.createReadUrl('scans/s1/original.jpg');
    const fields = parse(transfer.url);

    const flipped = fields.signature.startsWith('A')
      ? `B${fields.signature.slice(1)}`
      : `A${fields.signature.slice(1)}`;

    expect(verifySignature({ ...fields, signature: flipped })).toBe('invalid_signature');
  });
});
