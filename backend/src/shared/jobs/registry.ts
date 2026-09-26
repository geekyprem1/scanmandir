import type { JobHandler } from './types.js';

const handlers = new Map<string, JobHandler>();

export function registerJobHandler(jobType: string, handler: JobHandler): void {
  if (handlers.has(jobType)) {
    throw new Error(`Job handler already registered for ${jobType}`);
  }
  handlers.set(jobType, handler);
}

export function resolveJobHandler(jobType: string): JobHandler | undefined {
  return handlers.get(jobType);
}

export function registeredJobTypes(): string[] {
  return [...handlers.keys()].sort();
}

/** Test helper. Production code registers handlers once at worker startup. */
export function clearJobHandlers(): void {
  handlers.clear();
}
