import type { z } from 'zod';
import { AppError, ERROR_CODES } from '../shared/errors.js';

/**
 * Parses a request body or params against a schema, reporting every issue in the
 * documented error shape.
 *
 * Kept in one place so no route invents its own failure format (P3-07 grows from here).
 */
export function parseOrThrow<Schema extends z.ZodType>(schema: Schema, value: unknown): z.infer<Schema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'Request failed validation.', {
      details: {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
  }
  return parsed.data;
}
