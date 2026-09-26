import { describe, expect, it } from 'vitest';
import { SupabaseObjectStorage } from '../../src/shared/storage/supabase.js';

interface RecordedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

type Responder = (request: RecordedRequest) => Response;

/**
 * The driver talks HTTP only, so a fake fetch exercises every branch without a network
 * call or a Supabase project.
 */
function createStorage(responder: Responder) {
  const requests: RecordedRequest[] = [];

  const fetchImpl = async (input: string, init?: RequestInit): Promise<Response> => {
    const request: RecordedRequest = {
      method: init?.method ?? 'GET',
      url: input,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: init?.body ?? null,
    };
    requests.push(request);
    return responder(request);
  };

  return { storage: new SupabaseObjectStorage({ fetchImpl }), requests };
}

/** Answers the bucket lookups the way an empty project would, then defers. */
function withEmptyProject(responder: Responder): Responder {
  return (request) => {
    if (request.method === 'GET' && request.url.includes('/bucket/')) {
      return new Response(JSON.stringify({ statusCode: '404', error: 'Bucket not found' }), {
        status: 404,
      });
    }
    if (request.method === 'POST' && request.url.endsWith('/bucket')) {
      return new Response(JSON.stringify({ name: 'mandir-media' }), { status: 200 });
    }
    return responder(request);
  };
}

describe('Supabase storage driver', () => {
  it('creates the private bucket once, with the configured limits', async () => {
    const { storage, requests } = createStorage(withEmptyProject(() => new Response(null, { status: 200 })));

    await storage.putObject('scans/a/b/original', Buffer.from('one'), 'image/png');
    await storage.putObject('scans/a/b/other', Buffer.from('two'), 'image/png');

    const bucketCreates = requests.filter(
      (request) => request.method === 'POST' && request.url.endsWith('/bucket'),
    );
    expect(bucketCreates).toHaveLength(1);
    expect(JSON.parse(String(bucketCreates[0]?.body))).toMatchObject({
      id: 'mandir-media',
      public: false,
      file_size_limit: 12 * 1024 * 1024,
      allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'],
    });
    expect(requests.filter((request) => request.method === 'PUT')).toHaveLength(2);
  });

  it('uploads with upsert so a retried pin is idempotent', async () => {
    const { storage, requests } = createStorage(withEmptyProject(() => new Response(null, { status: 200 })));

    await storage.putObject('scans/u/s/r1/original', Buffer.from([1, 2, 3]), 'image/jpeg');

    const put = requests.find((request) => request.method === 'PUT');
    expect(put?.url).toContain('/storage/v1/object/mandir-media/scans/u/s/r1/original');
    expect(put?.headers['content-type']).toBe('image/jpeg');
    expect(put?.headers['x-upsert']).toBe('true');
    expect(put?.headers.authorization).toContain('Bearer sb_secret_');
  });

  it('signs upload URLs, with the content type as a required header', async () => {
    const { storage, requests } = createStorage(
      withEmptyProject(
        () =>
          new Response(JSON.stringify({ url: '/object/upload/sign/mandir-media/k?token=abc' }), {
            status: 200,
          }),
      ),
    );

    const transfer = await storage.createUploadUrl('scans/u/s/r1/staging/x', {
      contentType: 'image/png',
      maxBytes: 1024,
    });

    const sign = requests.find((request) => request.url.includes('/object/upload/sign/'));
    expect(sign?.method).toBe('POST');
    expect(transfer.url).toBe(`${storageUrl()}/object/upload/sign/mandir-media/k?token=abc`);
    expect(transfer.requiredHeaders).toEqual({ 'content-type': 'image/png' });
    expect(transfer.expiresAt.getTime()).toBeGreaterThan(Date.now() + 60 * 60 * 1000);
  });

  it('signs read URLs with the configured lifetime', async () => {
    const { storage, requests } = createStorage(
      () =>
        new Response(JSON.stringify({ signedURL: '/object/sign/mandir-media/k?token=def' }), {
          status: 200,
        }),
    );

    const transfer = await storage.createReadUrl('scans/u/s/r1/original');

    const sign = requests.find((request) => request.url.includes('/object/sign/'));
    expect(JSON.parse(String(sign?.body))).toEqual({ expiresIn: 300 });
    expect(transfer.url).toBe(`${storageUrl()}/object/sign/mandir-media/k?token=def`);
  });

  it('reads size and content type from HEAD without downloading', async () => {
    const { storage, requests } = createStorage(
      () =>
        new Response(null, {
          status: 200,
          headers: { 'content-length': '70', 'content-type': 'image/png' },
        }),
    );

    const metadata = await storage.headObject('scans/u/s/r1/original');

    expect(metadata).toEqual({
      key: 'scans/u/s/r1/original',
      size: 70,
      contentType: 'image/png',
      lastModified: expect.any(Date),
    });
    expect(requests[0]?.method).toBe('HEAD');
    expect(requests[0]?.url).toContain('/object/authenticated/mandir-media/');
  });

  it('treats a missing object as absent rather than an error', async () => {
    const { storage } = createStorage(() => new Response(null, { status: 404 }));

    await expect(storage.headObject('scans/u/s/r1/original')).resolves.toBeNull();
  });

  it('downloads object bytes', async () => {
    const { storage } = createStorage(() => new Response(new Uint8Array([9, 8, 7]), { status: 200 }));

    const bytes = await storage.getObject('scans/u/s/r1/original');

    expect([...bytes]).toEqual([9, 8, 7]);
  });

  it('deletes idempotently, but surfaces a real failure', async () => {
    const absent = createStorage(() => new Response('missing', { status: 404 }));
    await expect(absent.storage.deleteObject('scans/u/s/r1/original')).resolves.toBeUndefined();

    const failing = createStorage(() => new Response('boom', { status: 500 }));
    await expect(failing.storage.deleteObject('scans/u/s/r1/original')).rejects.toThrow(/500/);
  });

  it('treats a missing bucket as no object, so a readiness probe passes on a fresh project', async () => {
    // Storage answers 400 "Bucket not found" until the first upload creates the bucket.
    const { storage } = createStorage(
      () =>
        new Response(JSON.stringify({ statusCode: '400', error: 'Bucket not found' }), {
          status: 400,
        }),
    );

    await expect(storage.headObject('healthcheck/probe')).resolves.toBeNull();
  });

  it('refuses an unsafe key before making any request', async () => {
    const { storage, requests } = createStorage(() => new Response(null, { status: 200 }));

    await expect(storage.getObject('../secrets.txt')).rejects.toThrow(/Unsafe object key/);
    expect(requests).toHaveLength(0);
  });

  it('reports a failed write with the status and body', async () => {
    const { storage } = createStorage(
      withEmptyProject(() => new Response('quota exceeded', { status: 413 })),
    );

    await expect(storage.putObject('scans/u/s/r1/original', Buffer.from('x'), 'image/png')).rejects.toThrow(
      /413.*quota exceeded/s,
    );
  });
});

/** The storage API base the driver builds from the test Supabase URL. */
function storageUrl(): string {
  return 'https://test-project.supabase.co/storage/v1';
}
