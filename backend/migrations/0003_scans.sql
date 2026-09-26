-- Scans, their media objects, and the quota ledger.
--
-- These are the tables the first vertical slice needs: a guest creates a scan, uploads
-- one photo, and the server reserves allowance before any paid provider work. None of
-- them depend on the label catalog (P0-06), which observations and rules still wait on.
--
-- Design follows ARCHITECTURE.md sections 6, 9 and 18.

CREATE TABLE scans (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

    -- The owner. Every read and write joins on this; possession of a scan id is not
    -- authorization (ARCHITECTURE.md section 9).
    user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Optional profile. `mandirs` arrives in Phase 8; the constraint is added then.
    mandir_id         UUID,

    status            TEXT        NOT NULL DEFAULT 'awaiting_upload'
                          CHECK (status IN ('awaiting_upload', 'queued', 'analyzing',
                                            'needs_retake', 'awaiting_confirmation',
                                            'generating_report', 'completed', 'failed')),

    -- Identifies immutable visual input; a retake increments it (section 6).
    image_revision    INTEGER     NOT NULL DEFAULT 1 CHECK (image_revision > 0),
    -- Identifies the analysis-input snapshot; confirmation increments it.
    input_revision    INTEGER     NOT NULL DEFAULT 0 CHECK (input_revision >= 0),

    -- Which stage exhausted its retries, so a retry resumes in the right place.
    failed_stage      TEXT,

    -- Terminal, and it takes precedence over worker completion: a deleted scan is never
    -- published even if a job finishes later. Kept as a timestamp so the prior status
    -- survives for support and audit.
    deleted_at        TIMESTAMPTZ,

    -- Idempotency is scoped by owner and operation (section 6). The request hash is
    -- stored so reusing a key with different input is a conflict, not a silent replay.
    creation_idempotency_key TEXT,
    creation_request_hash    TEXT,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE scans IS
    'One photo journey. Deleted scans are tombstoned with deleted_at, never recreated.';

-- A client that retries creation with the same key must find the same scan.
CREATE UNIQUE INDEX scans_owner_idempotency_idx
    ON scans (user_id, creation_idempotency_key)
    WHERE creation_idempotency_key IS NOT NULL;

-- History listing (Phase 8) scans one owner's non-deleted scans newest first.
CREATE INDEX scans_owner_created_idx
    ON scans (user_id, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE media_objects (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id           UUID        NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    image_revision    INTEGER     NOT NULL CHECK (image_revision > 0),

    -- What the object is for. Staging uploads are transient and never recorded here:
    -- only the pinned object is (section 6, "pin an immutable object version").
    purpose           TEXT        NOT NULL CHECK (purpose IN ('original', 'derivative', 'thumbnail')),

    -- Server-generated, immutable once written. A new revision gets a new key.
    storage_key       TEXT        NOT NULL UNIQUE,
    content_type      TEXT,
    byte_size         BIGINT,

    validation_status TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (validation_status IN ('pending', 'valid', 'rejected', 'expired')),

    retention_deadline TIMESTAMPTZ,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE media_objects IS
    'Private stored media. Access is only ever through signed URLs issued after an ownership check.';

-- One pinned object per scan, revision and purpose.
CREATE UNIQUE INDEX media_objects_scan_revision_purpose_idx
    ON media_objects (scan_id, image_revision, purpose);

CREATE TABLE quota_ledger (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scan_id               UUID        REFERENCES scans(id) ON DELETE CASCADE,

    -- reserve | consume | release. Append-only: a reservation is never updated, only
    -- superseded by a later entry naming it.
    kind                  TEXT        NOT NULL CHECK (kind IN ('reserve', 'consume', 'release')),

    -- The reservation this entry acts on, for consume and release.
    reservation_key       TEXT,

    -- Globally unique per logical operation, so a retried request cannot double-count.
    operation_key         TEXT        NOT NULL UNIQUE,

    -- Resolved on the server and stored with every entry; never derived from a device
    -- clock (docs/decisions.md D-10).
    allowance_period_start TIMESTAMPTZ NOT NULL,
    allowance_period_end   TIMESTAMPTZ NOT NULL,

    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT quota_ledger_reservation_reference
        CHECK ((kind = 'reserve' AND reservation_key IS NULL)
            OR (kind IN ('consume', 'release') AND reservation_key IS NOT NULL))
);

COMMENT ON TABLE quota_ledger IS
    'Append-only allowance accounting. Reserved counts against the period until consumed or released.';

CREATE INDEX quota_ledger_user_period_idx
    ON quota_ledger (user_id, allowance_period_start);
