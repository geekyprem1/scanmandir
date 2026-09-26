-- What the user confirmed, as the immutable input a report is generated from.
--
-- The model's observations are not the input the rules engine reads: what the user approved
-- is (ARCHITECTURE.md sections 6 and 9). One row per input revision, never edited, so a
-- report can always name the revision it was generated from and a stale client's edit
-- cannot silently change a report that already exists.

CREATE TABLE scan_inputs (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id           UUID        NOT NULL REFERENCES scans(id) ON DELETE CASCADE,

    -- Starts at 1 for the first confirmation and increments on every later one.
    input_revision    INTEGER     NOT NULL CHECK (input_revision > 0),

    -- Which image the user was looking at. Stored so a confirmation can be traced to the
    -- analysis behind it, and so a stale edit is refused by comparison rather than by trust.
    image_revision    INTEGER     NOT NULL CHECK (image_revision > 0),

    -- The confirmed objects: every model observation that survived review, with corrections,
    -- plus anything the user added. A JSON document rather than a table because it is read as
    -- a whole by the rules engine and never queried by one of its fields.
    objects           JSONB       NOT NULL,

    -- Tradition and context answers, including explicit "prefer not to say" values. Absent
    -- answers stay absent rather than defaulting to a tradition the user never chose.
    context           JSONB       NOT NULL DEFAULT '{}',

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE scan_inputs IS
    'Immutable confirmed input per revision. A second confirmation inserts a new revision.';

CREATE UNIQUE INDEX scan_inputs_scan_revision_idx ON scan_inputs (scan_id, input_revision);
