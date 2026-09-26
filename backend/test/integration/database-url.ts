/**
 * Single source for the integration database URL.
 *
 * Both vitest.config.ts (which runs in Vitest's main process) and global-setup.ts read
 * this, so the migration step and the test workers cannot end up pointing at different
 * databases.
 *
 * Port 5443 rather than the default: other projects on a developer machine commonly
 * already hold 5432 and 5433. Override with TEST_DATABASE_URL in CI.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://mandir:mandir_local_dev@127.0.0.1:5443/mandir_test';
