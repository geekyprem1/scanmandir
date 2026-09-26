import { registerJobHandler } from '../../shared/jobs/registry.js';
import type { VisionProvider } from '../../modules/vision/provider.js';
import { INTERNAL_ECHO_JOB, internalEchoHandler } from './internal-echo.js';
import { SCAN_ANALYZE_JOB, createScanAnalyzeHandler } from './scan-analyze.js';
import { SCAN_GENERATE_REPORT_JOB, scanGenerateReportHandler } from './scan-generate-report.js';
import { SCAN_PREPARE_JOB, scanPrepareHandler } from './scan-prepare.js';

/**
 * Single place where job types are wired to handlers. Later phases add the report
 * generation, retention and deletion handlers here.
 *
 * [visionProvider] exists so a test, or the evaluator, can drive the whole chain with a
 * scripted provider instead of reaching a vendor. Production calls this with no argument
 * and gets OpenRouter.
 */
export function registerAllJobHandlers(options: { visionProvider?: VisionProvider } = {}): void {
  registerJobHandler(INTERNAL_ECHO_JOB, internalEchoHandler);
  registerJobHandler(SCAN_PREPARE_JOB, scanPrepareHandler);
  registerJobHandler(
    SCAN_ANALYZE_JOB,
    options.visionProvider
      ? createScanAnalyzeHandler({ provider: options.visionProvider })
      : createScanAnalyzeHandler(),
  );
  registerJobHandler(SCAN_GENERATE_REPORT_JOB, scanGenerateReportHandler);
}
