-- Durable job queue and transactional outbox.
--
-- Scope note: this migration deliberately contains no domain tables. Users, scans,
-- media, observations, rules, reports, quota and the rest arrive in P3-03, once the
-- label catalog and identity provider are settled. Phase 1 only needs the machinery
-- that lets a worker survive a crash.
--
-- Design follows ARCHITECTURE.md section 6 "Delivery guarantees":
--   - a state change and its outbox event are written in one transaction
--   - a dispatcher turns unpublished outbox events into jobs
--   - a worker claims jobs under a lease and may run the same job more than once
--   - retries are bounded

CREATE TABLE outbox_events (
    id              BIGSERIAL PRIMARY KEY,
    event_type      TEXT        NOT NULL,
    aggregate_type  TEXT        NOT NULL,
    aggregate_id    TEXT        NOT NULL,
    payload         JSONB       NOT NULL DEFAULT '{}'::jsonb,

    -- Identifies the logical effect this event should cause exactly once. The
    -- dispatcher passes it through to the job, where it is enforced by a unique index.
    dedupe_key      TEXT        NOT NULL,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at    TIMESTAMPTZ,
    publish_attempts INTEGER    NOT NULL DEFAULT 0,
    last_error      TEXT
);

COMMENT ON TABLE outbox_events IS
    'Append-only. Written in the same transaction as the state change that caused it.';

-- Partial index: the dispatcher only ever scans unpublished rows, and this stays small
-- even when the table itself grows large.
CREATE INDEX outbox_events_unpublished_idx
    ON outbox_events (id)
    WHERE published_at IS NULL;

CREATE INDEX outbox_events_aggregate_idx
    ON outbox_events (aggregate_type, aggregate_id, created_at DESC);

CREATE TABLE jobs (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type         TEXT        NOT NULL,

    -- Globally unique, across every status. Enqueueing the same logical work twice is
    -- a no-op rather than a second provider call. A genuine retry resets this row; it
    -- never inserts a second one. Distinct work carries a distinct key, for example a
    -- new input revision of the same scan.
    dedupe_key       TEXT        NOT NULL UNIQUE,

    payload          JSONB       NOT NULL DEFAULT '{}'::jsonb,
    status           TEXT        NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')),

    attempts         INTEGER     NOT NULL DEFAULT 0,
    max_attempts     INTEGER     NOT NULL CHECK (max_attempts > 0),

    run_after        TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Set when claimed. An expired lease means the worker died mid-job; a reconciler
    -- returns the row to pending. The already-incremented attempt count is kept on
    -- purpose so a crash loop cannot run forever.
    lease_expires_at TIMESTAMPTZ,
    locked_by        TEXT,

    last_error       TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at      TIMESTAMPTZ,

    CONSTRAINT jobs_lease_present_when_running
        CHECK (status <> 'running' OR (lease_expires_at IS NOT NULL AND locked_by IS NOT NULL)),
    CONSTRAINT jobs_finished_at_set_for_terminal
        CHECK (status NOT IN ('succeeded', 'failed', 'cancelled') OR finished_at IS NOT NULL)
);

COMMENT ON TABLE jobs IS
    'Durable work queue. Handlers must be idempotent: a job may execute more than once.';

CREATE INDEX jobs_claimable_idx
    ON jobs (run_after)
    WHERE status = 'pending';

CREATE INDEX jobs_expired_lease_idx
    ON jobs (lease_expires_at)
    WHERE status = 'running';

CREATE INDEX jobs_type_status_idx
    ON jobs (job_type, status);
