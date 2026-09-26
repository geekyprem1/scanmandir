import 'dotenv/config';
import { z } from 'zod';

/**
 * Configuration is validated once at startup. A missing or malformed value should
 * stop the process immediately rather than surface later as a confusing runtime error.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  API_HOST: z.string().default('127.0.0.1'),
  API_PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required. See .env.example.'),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  /**
   * Object storage. `local` is the development filesystem driver; `supabase` uses the
   * project's private Storage API (docs/decisions.md D-16) and needs a server-only
   * secret key, because the backend writes, pins and deletes media on the user's behalf.
   */
  STORAGE_DRIVER: z.enum(['local', 'supabase']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('.storage'),
  /** Signs local storage URLs so the signed-transfer flow is exercised in development. */
  STORAGE_URL_SECRET: z.string().min(16).default('development_only_storage_secret_change_me'),
  STORAGE_URL_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  /** Public base used when handing signed storage URLs to a client. */
  STORAGE_PUBLIC_BASE_URL: z.string().default('http://127.0.0.1:3000'),
  /** Private bucket holding scan media when STORAGE_DRIVER=supabase. */
  STORAGE_BUCKET: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/, 'must be a valid bucket name')
    .default('mandir-media'),
  /**
   * Server-only secret (`sb_secret_...` or the legacy service_role key). Never ships in
   * the app: the publishable key cannot write to storage.
   */
  SUPABASE_SERVICE_KEY: z.string().min(1).optional(),

  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  WORKER_BATCH_SIZE: z.coerce.number().int().positive().default(5),
  WORKER_LEASE_MS: z.coerce.number().int().positive().default(60_000),
  JOB_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),

  /**
   * Supabase project (docs/decisions.md D-15). Access tokens are verified against the
   * project's JWKS endpoint, so a request without this configuration cannot be
   * authenticated and the process refuses to start rather than failing open.
   */
  SUPABASE_URL: z.string().url(),
  SUPABASE_JWT_AUDIENCE: z.string().min(1).default('authenticated'),
  /** Defaults to <SUPABASE_URL>/auth/v1. */
  SUPABASE_JWT_ISSUER: z.string().url().optional(),

  /**
   * Upload constraints. They live here, not in the client, so a signed URL cannot be
   * negotiated upward (ARCHITECTURE.md section 6).
   */
  UPLOAD_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(12 * 1024 * 1024),
  UPLOAD_ALLOWED_CONTENT_TYPES: z
    .string()
    .default('image/jpeg,image/png,image/webp')
    .transform((value) =>
      value
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.length > 0),
    ),

  /**
   * Scan allowance. Plans and allowances are server configuration, never hard-coded
   * into the client (ARCHITECTURE.md section 18). Period boundaries are resolved in a
   * fixed-offset timezone — Asia/Kolkata by default, which has no DST — and stored on
   * every ledger entry (docs/decisions.md D-10).
   */
  SCAN_FREE_ALLOWANCE_PER_PERIOD: z.coerce.number().int().nonnegative().default(3),
  QUOTA_PERIOD_OFFSET_MINUTES: z.coerce.number().int().min(-720).max(840).default(330),
});

export type AppConfig = z.infer<typeof EnvSchema> & {
  isProduction: boolean;
  isTest: boolean;
};

function load(): AppConfig {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${detail}`);
  }

  const env = parsed.data;

  if (env.NODE_ENV === 'production' && env.STORAGE_DRIVER === 'local') {
    throw new Error(
      'STORAGE_DRIVER=local is a development-only filesystem driver and must not run in production.',
    );
  }
  if (
    env.STORAGE_DRIVER === 'local' &&
    env.NODE_ENV === 'production' &&
    env.STORAGE_URL_SECRET === 'development_only_storage_secret_change_me'
  ) {
    throw new Error('STORAGE_URL_SECRET still holds its development default.');
  }
  if (env.STORAGE_DRIVER === 'supabase' && !env.SUPABASE_SERVICE_KEY) {
    throw new Error(
      'STORAGE_DRIVER=supabase requires SUPABASE_SERVICE_KEY. The publishable key cannot write media.',
    );
  }

  return {
    ...env,
    isProduction: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
  };
}

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  cached ??= load();
  return cached;
}

/** Test helper: forces the next getConfig() call to re-read process.env. */
export function resetConfigCache(): void {
  cached = null;
}
