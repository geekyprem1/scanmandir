import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { getPool } from './pool.js';
import { getLogger } from '../logger.js';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../migrations');

/** One arbitrary but stable key, so two deploys cannot migrate concurrently. */
const ADVISORY_LOCK_KEY = 4_812_553_901;

export interface MigrationResult {
  applied: string[];
  alreadyApplied: string[];
}

async function ensureRegistry(): Promise<void> {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    TEXT PRIMARY KEY,
      checksum    TEXT NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function listMigrationFiles(): Promise<string[]> {
  const entries = await fs.readdir(MIGRATIONS_DIR);
  return entries.filter((name) => name.endsWith('.sql')).sort();
}

function checksum(contents: string): string {
  // Normalizes line endings so a Windows checkout and a Linux CI agent agree.
  return createHash('sha256').update(contents.replace(/\r\n/g, '\n')).digest('hex');
}

/**
 * Forward-only migrations, applied in filename order. Each file runs inside its own
 * transaction, so a failing migration leaves no partial schema behind.
 *
 * An already-applied file whose contents changed is a hard error: editing applied
 * migrations silently desynchronizes environments.
 */
export async function runMigrations(): Promise<MigrationResult> {
  const pool = getPool();
  const logger = getLogger();

  await ensureRegistry();

  const lock = await pool.connect();
  try {
    await lock.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);

    const files = await listMigrationFiles();
    const { rows } = await pool.query<{ filename: string; checksum: string }>(
      'SELECT filename, checksum FROM schema_migrations',
    );
    const applied = new Map(rows.map((row) => [row.filename, row.checksum]));

    const result: MigrationResult = { applied: [], alreadyApplied: [] };

    for (const filename of files) {
      const contents = await fs.readFile(path.join(MIGRATIONS_DIR, filename), 'utf8');
      const digest = checksum(contents);
      const previous = applied.get(filename);

      if (previous !== undefined) {
        if (previous !== digest) {
          throw new Error(
            `Migration ${filename} was modified after it was applied. ` +
              'Add a new migration instead of editing an applied one.',
          );
        }
        result.alreadyApplied.push(filename);
        continue;
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(contents);
        await client.query('INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)', [
          filename,
          digest,
        ]);
        await client.query('COMMIT');
        result.applied.push(filename);
        logger.info({ filename }, 'migration applied');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw new Error(`Migration ${filename} failed: ${String(error)}`, { cause: error });
      } finally {
        client.release();
      }
    }

    return result;
  } finally {
    await lock.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]).catch(() => undefined);
    lock.release();
  }
}
