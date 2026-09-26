import { describe, expect, it } from 'vitest';
import { AppError, ERROR_CODES, toErrorResponse } from '../../src/shared/errors.js';

describe('error responses', () => {
  it('maps known codes to their documented status', () => {
    expect(new AppError(ERROR_CODES.REVISION_CONFLICT, 'stale').status).toBe(409);
    expect(new AppError(ERROR_CODES.QUOTA_EXCEEDED, 'no allowance').status).toBe(402);
    expect(new AppError(ERROR_CODES.IMAGE_EXPIRED, 'gone').status).toBe(410);
    expect(new AppError(ERROR_CODES.RESOURCE_DELETED, 'deleted').status).toBe(410);
    expect(new AppError(ERROR_CODES.ANALYSIS_UNAVAILABLE, 'provider down').status).toBe(503);
  });

  it('passes safe details through for expected errors', () => {
    const error = new AppError(ERROR_CODES.UPLOAD_INVALID, 'too large', {
      details: { maxBytes: 100 },
    });
    const { status, body } = toErrorResponse(error, 'req-1');

    expect(status).toBe(400);
    expect(body.error.code).toBe('UPLOAD_INVALID');
    expect(body.error.details).toEqual({ maxBytes: 100 });
    expect(body.error.requestId).toBe('req-1');
  });

  it('never leaks internal exception text to the client', () => {
    const leaky = new Error('connection string postgres://user:password@host/db failed');
    const { status, body } = toErrorResponse(leaky, 'req-2');

    expect(status).toBe(500);
    expect(body.error.code).toBe('INTERNAL');
    expect(body.error.message).toBe('Unexpected server error.');
    expect(JSON.stringify(body)).not.toContain('password');
    expect(body.error.details).toBeUndefined();
  });

  it('omits requestId when there is none rather than sending undefined', () => {
    const { body } = toErrorResponse(new AppError(ERROR_CODES.NOT_FOUND, 'missing'));
    expect('requestId' in body.error).toBe(false);
  });
});
