-- Vision analysis: the record of each provider call, and the observations it produced.
--
-- Observations are immutable. A re-analysis writes a new run and new rows rather than
-- editing what a previous run reported, so a scan's history stays auditable and the
-- confirmed input revision is what downstream stages read (ARCHITECTURE.md sections 6, 7
-- and 9; TASKS P5-04).

CREATE TABLE analysis_runs (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id           UUID        NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    image_revision    INTEGER     NOT NULL CHECK (image_revision > 0),

    -- What produced this analysis. The versions are code constants, stored so any stored
    -- observation can be traced to the prompt and schema that produced it.
    model             TEXT        NOT NULL,
    provider          TEXT,
    prompt_version    TEXT        NOT NULL,
    schema_version    TEXT        NOT NULL,

    -- Provider-reported usage and timing, for the cost and latency accounting that
    -- docs/decisions.md D-05 now measures instead of estimating.
    latency_ms        INTEGER,
    prompt_tokens     INTEGER,
    completion_tokens INTEGER,
    attempts          INTEGER     NOT NULL DEFAULT 1,

    -- The quality and relevance gate's own answer (TASKS P5-02).
    image_usable      BOOLEAN     NOT NULL,
    looks_like_home_mandir BOOLEAN NOT NULL,
    quality_reasons   TEXT[]      NOT NULL DEFAULT '{}',

    -- The validated response, kept verbatim: it is the evidence behind every row in
    -- observations, and re-deriving them must not need another paid call.
    response          JSONB       NOT NULL,

    -- What the adapter had to change to make the response usable (TASKS P5-03), and the
    -- contract rules it broke without being changed. Both are recorded because a rising
    -- count is the signal that the prompt or the schema needs work.
    normalization     TEXT[]      NOT NULL DEFAULT '{}',
    contract_violations TEXT[]    NOT NULL DEFAULT '{}',

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE analysis_runs IS
    'One row per provider call. Never edited after insert; a re-analysis inserts a new row.';

CREATE INDEX analysis_runs_scan_idx ON analysis_runs (scan_id, created_at DESC);

CREATE TABLE observations (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_run_id   UUID        NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
    scan_id           UUID        NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    image_revision    INTEGER     NOT NULL CHECK (image_revision > 0),

    -- The model's own short id, kept so a report or a support question can point at the
    -- same object the raw response did.
    display_id        TEXT        NOT NULL,

    category          TEXT        NOT NULL
                          CHECK (category IN ('deity_representation', 'puja_object', 'other')),

    -- A label from the candidate catalog. Anything outside it was normalized to an
    -- unknown/other label before it got here, with the change recorded on the run.
    label             TEXT        NOT NULL,

    representation_type TEXT      NOT NULL,
    group_id          TEXT,
    member_labels     TEXT[],

    -- Null means "not localized", which is a legitimate answer the UI must respect: no
    -- overlay is drawn rather than an invented one (ARCHITECTURE.md section 7).
    bounding_box      JSONB,

    -- The model's own number. Uncalibrated and never presented as a probability (PRD
    -- section 10): it orders nothing and gates nothing until the evaluation says it can.
    model_confidence  DOUBLE PRECISION NOT NULL CHECK (model_confidence >= 0 AND model_confidence <= 1),
    verification_required BOOLEAN NOT NULL,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE observations IS
    'Immutable per analysis run. A correction is a new user-confirmed revision, not an edit.';

CREATE INDEX observations_scan_idx ON observations (scan_id, image_revision);
CREATE UNIQUE INDEX observations_run_display_idx ON observations (analysis_run_id, display_id);

-- Why a scan was sent back for a retake, in the gate's own codes, so the app can explain
-- it and the reason can be counted (TASKS P5-02).
ALTER TABLE scans ADD COLUMN retake_reason TEXT[] NOT NULL DEFAULT '{}';
