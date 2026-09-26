export interface JobRecord {
  id: string;
  jobType: string;
  dedupeKey: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
}

/**
 * Handlers must be idempotent. A job can run more than once — after a worker crash,
 * a lease expiry, or a duplicate dispatch (ARCHITECTURE.md section 6).
 */
export type JobHandler = (job: JobRecord) => Promise<void>;

/** Transient failure: the job is rescheduled with backoff until the attempt budget runs out. */
export class RetryableJobError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'RetryableJobError';
  }
}

/** Permanent failure, such as invalid input. Retrying would just fail again, so it does not. */
export class PermanentJobError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PermanentJobError';
  }
}
