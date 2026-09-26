/**
 * Stable machine-readable error codes. The client maps a code to localized text, so
 * these strings are a contract: renaming one is a breaking API change.
 *
 * The domain-specific codes come from ARCHITECTURE.md section 10.
 */
export const ERROR_CODES = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',

  IMAGE_UNUSABLE: 'IMAGE_UNUSABLE',
  IMAGE_EXPIRED: 'IMAGE_EXPIRED',
  UPLOAD_INVALID: 'UPLOAD_INVALID',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  ANALYSIS_UNAVAILABLE: 'ANALYSIS_UNAVAILABLE',
  REVISION_CONFLICT: 'REVISION_CONFLICT',
  RESOURCE_DELETED: 'RESOURCE_DELETED',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

const DEFAULT_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  INTERNAL: 500,

  IMAGE_UNUSABLE: 422,
  IMAGE_EXPIRED: 410,
  UPLOAD_INVALID: 400,
  QUOTA_EXCEEDED: 402,
  ANALYSIS_UNAVAILABLE: 503,
  REVISION_CONFLICT: 409,
  RESOURCE_DELETED: 410,
};

export interface AppErrorOptions {
  /** Safe to send to a client. Never put provider responses or stack traces here. */
  details?: Record<string, unknown>;
  status?: number;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = options.status ?? DEFAULT_STATUS[code];
    this.details = options.details;
  }
}

export interface ErrorResponseBody {
  error: {
    code: ErrorCode;
    /** Diagnostic text for developers. Clients must localize from `code`, not from this. */
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
  };
}

/**
 * Builds the wire response. Anything that is not an AppError becomes INTERNAL with a
 * fixed message, so unexpected exception text cannot leak to a client.
 */
export function toErrorResponse(
  error: unknown,
  requestId?: string,
): { status: number; body: ErrorResponseBody } {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
          ...(requestId ? { requestId } : {}),
        },
      },
    };
  }

  return {
    status: 500,
    body: {
      error: {
        code: ERROR_CODES.INTERNAL,
        message: 'Unexpected server error.',
        ...(requestId ? { requestId } : {}),
      },
    },
  };
}
