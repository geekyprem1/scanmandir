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
   * Local development object storage. Production uses private S3-compatible storage;
   * that vendor is still an open decision (docs/decisions.md D-07), so the interface
   * in src/shared/storage is what the rest of the code depends on.
   */
  STORAGE_DRIVER: z.enum(['local']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('.storage'),
  /** Signs local storage URLs so the signed-transfer flow is exercised in development. */
  STORAGE_URL_SECRET: z.string().min(16).default('development_only_storage_secret_change_me'),
  STORAGE_URL_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  /** Public base used when handing signed storage URLs to a client. */
  STORAGE_PUBLIC_BASE_URL: z.string().default('http://127.0.0.1:3000'),

  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  WORKER_BATCH_SIZE: z.coerce.number().int().positive().default(5),
  WORKER_LEASE_MS: z.coerce.number().int().positive().default(60_000),
  JOB_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
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
    env.NODE_ENV === 'production' &&
    env.STORAGE_URL_SECRET === 'development_only_storage_secret_change_me'
  ) {
    throw new Error('STORAGE_URL_SECRET still holds its development default.');
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
