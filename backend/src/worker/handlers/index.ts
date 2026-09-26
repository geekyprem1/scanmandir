import { registerJobHandler } from '../../shared/jobs/registry.js';
import { INTERNAL_ECHO_JOB, internalEchoHandler } from './internal-echo.js';

/**
 * Single place where job types are wired to handlers. Later phases add the vision,
 * report generation, retention and deletion handlers here.
 */
export function registerAllJobHandlers(): void {
  registerJobHandler(INTERNAL_ECHO_JOB, internalEchoHandler);
}
