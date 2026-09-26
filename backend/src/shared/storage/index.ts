import { getConfig } from '../config.js';
import { LocalObjectStorage } from './local.js';
import type { ObjectStorage } from './types.js';

let storage: ObjectStorage | null = null;

/**
 * Returns the configured storage driver. Only `local` exists today; an S3-compatible
 * driver is added once the hosting decision is made (docs/decisions.md D-07).
 */
export function getObjectStorage(): ObjectStorage {
  if (storage) return storage;
  const config = getConfig();

  switch (config.STORAGE_DRIVER) {
    case 'local':
      storage = new LocalObjectStorage();
      return storage;
    default: {
      // Exhaustive: config validation already restricts the driver enum.
      const unreachable: never = config.STORAGE_DRIVER;
      throw new Error(`Unsupported storage driver: ${String(unreachable)}`);
    }
  }
}

export function resetObjectStorage(): void {
  storage = null;
}

export * from './types.js';
