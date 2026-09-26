-- The generated report, one row per confirmed input revision.
--
-- A report is a document, not a set of queryable rows: it is read as a whole by the screen
-- and by anything that exports it, and it is written once from one confirmed revision.
-- Storing it whole means a report can never drift from the input it claims to describe.

CREATE TABLE reports (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id        UUID        NOT NULL REFERENCES scans(id) ON DELETE CASCADE,

    -- The confirmed input this report was generated from. Two reports for one revision
    -- would be two answers to the same question.
    input_revision INTEGER     NOT NULL CHECK (input_revision > 0),
    image_revision INTEGER     NOT NULL CHECK (image_revision > 0),

    body           JSONB       NOT NULL,

    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE reports IS
    'Generated reports. Immutable: a new confirmation produces a new revision and a new report.';

CREATE UNIQUE INDEX reports_scan_input_idx ON reports (scan_id, input_revision);
