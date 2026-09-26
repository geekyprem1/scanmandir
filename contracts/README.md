# Contracts

Shared schemas that the app, the backend and the worker must all agree on: API request and response shapes, the vision output contract, the report schema, error codes, and the supported-label catalog.

## Status: mostly blocked

**P1-06 is deliberately not done.** The launch label catalog cannot be fixed before the vision spike, and it is not a cosmetic list — it propagates into the `observations.label` column, into rule conditions, and into Hindi/English display strings. Building all of that around the 22 candidate deity labels in PRD section 10 and then cutting to eight would be expensive rework. See `docs/decisions.md` D-11.

Until then, schemas live where they are used:

| Contract | Current home | Moves here when |
|---|---|---|
| Error codes | `backend/src/shared/errors.ts` and `mobile/lib/core/model/failure.dart` | A generator or shared definition replaces the hand-kept pair |
| Vision output | `spike/vision-eval/src/schema.ts` | The spike fixes the label catalog |
| Label catalog | `spike/vision-eval/src/schema.ts`, marked as candidates | P0-06 is decided |
| Report schema | Not written | Phase 7 |

The error codes are currently duplicated by hand in two languages. That is a known and accepted duplication for Phase 1, and both sides carry a comment saying the strings are a contract. It is worth generating from one source once there are more than a dozen.
