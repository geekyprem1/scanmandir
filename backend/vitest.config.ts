import { defineConfig } from 'vitest/config';
import { TEST_DATABASE_URL } from './test/integration/database-url.js';
import { SUPABASE_TEST_URL } from './test/support/supabase-test-project.js';

/**
 * Two projects, matching the layers in ARCHITECTURE.md section 16.
 *
 *   unit         pure logic, no dependencies, runs anywhere including CI without services
 *   integration  real PostgreSQL, because revision conflicts, lease expiry, dedupe and
 *                SKIP LOCKED behaviour cannot be verified against a mock
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
          environment: 'node',
          env: {
            NODE_ENV: 'test',
            // Never connected to by unit tests; config validation only requires it to exist.
            DATABASE_URL: 'postgres://unit-tests-do-not-connect',
            // Pinned so a development .env pointing at real services cannot leak in.
            STORAGE_DRIVER: 'local',
            // Verification in tests uses a local key set; this only satisfies config.
            SUPABASE_URL: SUPABASE_TEST_URL,
            // Storage stays on the local driver in tests; the value only satisfies the
            // Supabase driver's constructor in its own unit tests.
            SUPABASE_SERVICE_KEY: 'sb_secret_unit_tests',
          },
        },
      },
      {
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['test/integration/global-setup.ts'],
          // Shared database: parallel files would fight over the same tables.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
          env: {
            NODE_ENV: 'test',
            DATABASE_URL: TEST_DATABASE_URL,
            // Pinned: the suite writes and deletes objects, and a development .env that
            // points at real services must never let it touch a real bucket.
            STORAGE_DRIVER: 'local',
            STORAGE_LOCAL_DIR: '.storage-test',
            STORAGE_URL_SECRET: 'integration_test_storage_secret_value',
            // Must agree with the issuer and audience used in test/support/tokens.ts.
            SUPABASE_URL: SUPABASE_TEST_URL,
            // Present so config never demands it here; the driver is not selected.
            SUPABASE_SERVICE_KEY: 'sb_secret_integration_tests',
            // Small enough that an oversized upload is cheap to construct in a test.
            UPLOAD_MAX_BYTES: '65536',
          },
        },
      },
    ],
  },
});
