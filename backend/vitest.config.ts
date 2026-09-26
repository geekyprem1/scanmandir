import { defineConfig } from 'vitest/config';
import { TEST_DATABASE_URL } from './test/integration/database-url.js';

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
            // Verification in tests uses a local key set; this only satisfies config.
            SUPABASE_URL: 'https://test-project.supabase.co',
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
            STORAGE_LOCAL_DIR: '.storage-test',
            STORAGE_URL_SECRET: 'integration_test_storage_secret_value',
            // Matches the issuer and audience of the tokens signed in
            // test/support/tokens.ts; verification uses a local key set, so no network.
            SUPABASE_URL: 'https://test-project.supabase.co',
          },
        },
      },
    ],
  },
});
