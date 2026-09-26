import { pino, type Logger } from 'pino';
import { getConfig } from './config.js';

/**
 * ARCHITECTURE.md section 12 requires that signed URLs, tokens, photos and sensitive
 * context never reach the logs. Redaction is configured centrally so an individual
 * log call cannot leak these by accident.
 */
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  '*.authorization',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.apiKey',
  '*.password',
  '*.signedUrl',
  '*.uploadUrl',
  '*.readUrl',
  '*.dataUrl',
  '*.imageBase64',
  '*.photo',
  '*.prompt',
  '*.secret',
];

let cached: Logger | null = null;

export function getLogger(): Logger {
  if (cached) return cached;
  const config = getConfig();

  cached = pino({
    level: config.LOG_LEVEL,
    redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
    // Drops pid and hostname: they add noise without helping in a container.
    base: null,
    ...(config.isProduction || config.isTest
      ? {}
      : {
          transport: {
            target: 'pino-pretty',
            options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
          },
        }),
  });

  return cached;
}
