# Backend

TypeScript and Fastify. One codebase, two processes: the API and the analysis worker, per `ARCHITECTURE.md` section 1.

## What exists today

Phase 1 foundation only:

- Validated configuration, redacting logger, stable error codes
- PostgreSQL connection pool, transaction helper, forward-only migration runner
- Durable job queue with leases, bounded retry and abandoned-lease recovery
- Transactional outbox and dispatcher
- Object storage interface with a development filesystem driver and signed transfers
- Health and readiness endpoints
- A single `internal.echo` job so the machinery is testable end to end

## What does not exist yet

**There is no authentication, no authorization, and no rate limiting.** Do not add any route that reads or writes user data until those land — P3-01, P3-04 and P3-07.

There is also no domain schema. `users`, `scans`, `media_objects`, `observations`, `rules`, `reports`, `quota_ledger` and the rest arrive in P3-03, once the label catalog (blocked on the vision spike) and identity provider are settled. See `docs/decisions.md`.

## Setup

```powershell
cd backend
npm install
Copy-Item .env.example .env

docker compose -f ..\infra\docker-compose.yml up -d
npm run migrate
```

Postgres runs on **5442** for development and **5443** for tests. The defaults are avoided because other projects commonly hold them.

## Running

```powershell
npm run dev:api       # http://127.0.0.1:3000
npm run dev:worker
```

Verify:

```powershell
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/health/ready
```

With the worker running, push work through the real path:

```powershell
npm run enqueue:demo                      # outbox -> dispatcher -> job
npm run enqueue:demo -- --direct          # straight into the queue
npm run enqueue:demo -- --fail=retryable  # bounded retry with backoff
npm run enqueue:demo -- --key=fixed       # run twice: the second is deduplicated
```

## Tests

```powershell
npm run test              # unit, no services needed
npm run test:integration  # needs the test database container
npm run test:all
npm run check             # format check, typecheck, unit tests
```

Integration tests run against real PostgreSQL on purpose. `SKIP LOCKED` claiming, lease expiry, dedupe under concurrency and transaction rollback cannot be verified against a mock.

## Layout

```text
src/
  api/        Fastify server, routes, request/response types
  worker/     Worker loop and job handlers
  modules/    Domain modules (directories reserved; see the table below)
  shared/     config, logger, errors, db, jobs, storage
migrations/   Forward-only SQL, applied in filename order
test/
  unit/         No external dependencies
  integration/  Real PostgreSQL
```

Module responsibilities, from `ARCHITECTURE.md` section 5. The directories exist; the code does not yet.

| Module | Responsibility |
|---|---|
| `identity` | Verify provider tokens, map subjects to users, anonymous-account linking |
| `scans` | Ownership, lifecycle, idempotency, revisions, quota reservations |
| `media` | Signed uploads, file validation, normalization, private retrieval, deletion |
| `vision` | Provider invocation, timeouts, output parsing, schema validation |
| `context` | User-confirmed detections, tradition, direction, contextual answers |
| `knowledge` | Rule versions, sources, review workflow, publication |
| `rules` | Evaluate applicable published rules against confirmed inputs |
| `reports` | Build immutable report revisions with evidence and source references |
| `mandirs` | Profiles and reusable user-confirmed context |
| `billing` | Verified purchases, entitlements, quota ledger, restore and reconciliation |
| `privacy` | Scan and account deletion jobs, retention policies |
| `operations` | Health, audit events, metrics, alerts, administrative access |

## Notes on the design

**Migrations are forward-only and checksummed.** Editing an applied migration is a hard error rather than a silent divergence between environments. An advisory lock stops two deploys migrating at once.

**Job dedupe keys are globally unique.** Enqueueing the same logical work twice is a no-op instead of a second provider call. A retry resets the existing row rather than inserting another, so duplicate taps cannot produce duplicate charges.

**Attempts increment at claim time, not at completion.** A worker that dies mid-job still consumes an attempt, so a crash loop terminates.

**Unknown errors are treated as retryable.** The bounded attempt budget makes that safe, and a handler that knows a failure is permanent throws `PermanentJobError`.

**The storage driver is behind an interface.** Production uses private S3-compatible storage, but that vendor is undecided (`docs/decisions.md` D-07). The local filesystem driver mimics the production shape — private objects, short-lived signed transfers, explicit content type and size limits — and the process refuses to start with it when `NODE_ENV=production`.

**`/v1/dev-storage` is development-only and trusts only its HMAC signature.** It performs no ownership check. It is never registered in production.
