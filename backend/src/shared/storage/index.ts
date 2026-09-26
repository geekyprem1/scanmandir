import { getConfig } from '../config.js';
import { LocalObjectStorage } from './local.js';
import { SupabaseObjectStorage } from './supabase.js';
import type { ObjectStorage } from './types.js';

let storage: ObjectStorage | null = null;

/**
 * Returns the configured storage driver: the development filesystem driver, or Supabase
 * Storage for a real deployment (docs/decisions.md D-16).
 */
export function getObjectStorage(): ObjectStorage {
  if (storage) return storage;
  const config = getConfig();

  switch (config.STORAGE_DRIVER) {
    case 'local':
      storage = new LocalObjectStorage();
      return storage;
    case 'supabase':
      storage = new SupabaseObjectStorage();
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
