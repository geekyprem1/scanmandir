-- The reviewed knowledge base: sources, rules, and what a report actually evaluated.
--
-- These tables are meant to be empty at launch, and an empty table here is the honest
-- state rather than a gap (knowledge/README.md). They exist so that when a person reviews
-- a reference, what the product shows is what that person approved — and so the database
-- itself refuses the shortcuts:
--
--   * a rule cannot be published while any source it cites is unreviewed or missing;
--   * a published version cannot be edited afterwards, only retired and replaced;
--   * a published version must name a reviewer, a date, both languages, and at least one
--     source version.
--
-- Guidance that cannot be traced to a reviewed source is not a content problem to be fixed
-- later. It is the one thing this product promises never to do (PRD section 23), so the
-- constraints live here rather than in the code that happens to write rows.

CREATE TABLE sources (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    slug       TEXT        NOT NULL UNIQUE,
    kind       TEXT        NOT NULL CHECK (
        kind IN ('scripture', 'book', 'practice_record', 'institutional', 'other')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE sources IS
    'A reference work or practice record. Identity only: the text that was reviewed lives in source_versions.';

CREATE TABLE source_versions (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id          UUID        NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    version            INTEGER     NOT NULL CHECK (version > 0),

    title              TEXT        NOT NULL,
    edition_or_section TEXT,
    url                TEXT,
    attribution        TEXT        NOT NULL,

    -- Traditions this reference speaks for. Empty means it is not tradition-specific.
    tradition_ids      TEXT[]      NOT NULL DEFAULT '{}',

    review_status      TEXT        NOT NULL DEFAULT 'draft'
        CHECK (review_status IN ('draft', 'reviewed', 'retired')),
    reviewer           TEXT,
    reviewed_at        TIMESTAMPTZ,

    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- A reviewer only exists once someone has actually reviewed it.
    CONSTRAINT source_versions_reviewed_has_reviewer CHECK (
        review_status = 'draft'
        OR (reviewer IS NOT NULL AND reviewed_at IS NOT NULL)
    ),
    -- There has to be somewhere for a reader to look: a section, a page range, or a URL.
    CONSTRAINT source_versions_has_locator CHECK (
        edition_or_section IS NOT NULL OR url IS NOT NULL
    ),

    UNIQUE (source_id, version)
);

COMMENT ON TABLE source_versions IS
    'Immutable citation metadata. A correction is a new version, so a rule keeps pointing at the text that was reviewed.';

CREATE TABLE rules (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    key        TEXT        NOT NULL UNIQUE,
    topic      TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE rules IS
    'Stable identity for a rule across versions. Content never lives here.';

CREATE TABLE rule_versions (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id            UUID        NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
    version            INTEGER     NOT NULL CHECK (version > 0),

    category           TEXT        NOT NULL CHECK (
        category IN ('practice', 'safety', 'vastu', 'direction', 'materials', 'other')
    ),

    -- Which kind of finding this rule produces. The types stay distinct all the way to the
    -- report: a visual observation is never presented as traditional guidance (TASKS P6-07).
    finding_type       TEXT        NOT NULL CHECK (
        finding_type IN ('visual', 'traditional', 'vastu', 'safety', 'verification')
    ),

    -- Empty means the rule is not tradition-specific. A tradition-specific rule must never
    -- be shown as a universal one, so this array is what decides applicability (TASKS P6-08).
    tradition_ids      TEXT[]      NOT NULL DEFAULT '{}',
    region_scope       TEXT,

    -- Inputs the rule needs before it can answer at all. A missing prerequisite is
    -- not_assessed with a reason, never a silent pass (TASKS P6-05).
    required_inputs    JSONB       NOT NULL DEFAULT '[]'::jsonb,

    -- A restricted declarative tree, never executable code from the database
    -- (ARCHITECTURE.md section 7). The evaluator refuses what it does not understand.
    condition          JSONB       NOT NULL,
    exceptions         JSONB       NOT NULL DEFAULT '[]'::jsonb,

    -- Localized for every supported language, stored together so a report can snapshot it.
    explanation        JSONB       NOT NULL,
    recommendation     JSONB       NOT NULL,

    source_version_ids UUID[]      NOT NULL,

    lifecycle_status   TEXT        NOT NULL DEFAULT 'draft'
        CHECK (lifecycle_status IN ('draft', 'reviewed', 'published', 'retired')),
    reviewer_id        TEXT,
    reviewed_at        TIMESTAMPTZ,
    published_at       TIMESTAMPTZ,
    retired_at         TIMESTAMPTZ,
    retired_reason     TEXT,

    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT rule_versions_published_is_complete CHECK (
        lifecycle_status <> 'published'
        OR (
            reviewer_id IS NOT NULL
            AND reviewed_at IS NOT NULL
            AND published_at IS NOT NULL
            -- cardinality, not array_length: array_length of an empty array is NULL, and a
            -- NULL check passes, which would let a rule with no sources be published.
            AND cardinality(source_version_ids) >= 1
            AND explanation ? 'en' AND explanation ? 'hi'
            AND recommendation ? 'en' AND recommendation ? 'hi'
        )
    ),
    CONSTRAINT rule_versions_reviewed_has_reviewer CHECK (
        lifecycle_status = 'draft'
        OR (reviewer_id IS NOT NULL AND reviewed_at IS NOT NULL)
    ),

    UNIQUE (rule_id, version)
);

COMMENT ON TABLE rule_versions IS
    'One immutable content version per rule. Draft and reviewed versions may be edited; a published one may only be retired and replaced.';

CREATE TABLE rule_lifecycle_events (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_version_id UUID        NOT NULL REFERENCES rule_versions(id) ON DELETE CASCADE,
    from_status     TEXT,
    to_status       TEXT        NOT NULL,
    actor           TEXT        NOT NULL,
    reason          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE rule_lifecycle_events IS
    'Who moved a rule version between lifecycle states, when, and why. Append-only.';

-- Publication is the moment the product starts speaking in a tradition's name, so the
-- transition is a database function rather than an UPDATE in a handler: it checks the
-- lifecycle and re-checks every cited source in one transaction, and it always leaves an
-- audit row behind.
CREATE FUNCTION publish_rule_version(p_rule_version_id UUID, p_actor TEXT)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_status      TEXT;
    v_cited       UUID[];
    v_unreviewed  INTEGER;
BEGIN
    IF p_actor IS NULL OR btrim(p_actor) = '' THEN
        RAISE EXCEPTION 'RULE_PUBLISH_REFUSED: publishing needs a named actor';
    END IF;

    SELECT lifecycle_status, source_version_ids
      INTO v_status, v_cited
      FROM rule_versions
     WHERE id = p_rule_version_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'RULE_VERSION_NOT_FOUND: %', p_rule_version_id;
    END IF;

    IF v_status <> 'reviewed' THEN
        RAISE EXCEPTION
            'RULE_PUBLISH_REFUSED: lifecycle status is %, and only a reviewed rule can be published',
            v_status;
    END IF;

    IF v_cited IS NULL OR cardinality(v_cited) = 0 THEN
        RAISE EXCEPTION
            'RULE_PUBLISH_REFUSED: a rule must cite at least one source version';
    END IF;

    SELECT count(*) INTO v_unreviewed
      FROM unnest(v_cited) AS cited(id)
      LEFT JOIN source_versions sv ON sv.id = cited.id
     WHERE sv.id IS NULL OR sv.review_status <> 'reviewed';

    IF v_unreviewed > 0 THEN
        RAISE EXCEPTION
            'RULE_PUBLISH_REFUSED: % cited source version(s) are missing or not reviewed',
            v_unreviewed;
    END IF;

    UPDATE rule_versions
       SET lifecycle_status = 'published',
           published_at     = now()
     WHERE id = p_rule_version_id;

    INSERT INTO rule_lifecycle_events (rule_version_id, from_status, to_status, actor)
    VALUES (p_rule_version_id, 'reviewed', 'published', p_actor);
END;
$$;

COMMENT ON FUNCTION publish_rule_version IS
    'Publishes a reviewed rule version only if every source it cites has itself been reviewed.';

CREATE FUNCTION retire_rule_version(p_rule_version_id UUID, p_actor TEXT, p_reason TEXT)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_status TEXT;
BEGIN
    IF p_actor IS NULL OR btrim(p_actor) = '' THEN
        RAISE EXCEPTION 'RULE_RETIRE_REFUSED: retiring needs a named actor';
    END IF;

    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
        RAISE EXCEPTION 'RULE_RETIRE_REFUSED: retiring needs a reason';
    END IF;

    SELECT lifecycle_status INTO v_status
      FROM rule_versions
     WHERE id = p_rule_version_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'RULE_VERSION_NOT_FOUND: %', p_rule_version_id;
    END IF;

    IF v_status IN ('draft', 'retired') THEN
        RAISE EXCEPTION
            'RULE_RETIRE_REFUSED: lifecycle status is %, which is not in use', v_status;
    END IF;

    UPDATE rule_versions
       SET lifecycle_status = 'retired',
           retired_at       = now(),
           retired_reason   = p_reason
     WHERE id = p_rule_version_id;

    INSERT INTO rule_lifecycle_events (rule_version_id, from_status, to_status, actor, reason)
    VALUES (p_rule_version_id, v_status, 'retired', p_actor, p_reason);
END;
$$;

COMMENT ON FUNCTION retire_rule_version IS
    'Retires a reviewed or published rule version, with a reason, leaving the history intact.';

-- A published version is a promise to users: the text they read cannot quietly change
-- afterwards. Retirement is a separate state and stays allowed.
CREATE FUNCTION rule_versions_reject_content_edit() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.lifecycle_status IN ('published', 'retired')
       AND (
            NEW.condition           IS DISTINCT FROM OLD.condition
         OR NEW.exceptions          IS DISTINCT FROM OLD.exceptions
         OR NEW.explanation         IS DISTINCT FROM OLD.explanation
         OR NEW.recommendation      IS DISTINCT FROM OLD.recommendation
         OR NEW.source_version_ids  IS DISTINCT FROM OLD.source_version_ids
         OR NEW.tradition_ids       IS DISTINCT FROM OLD.tradition_ids
         OR NEW.region_scope        IS DISTINCT FROM OLD.region_scope
         OR NEW.required_inputs     IS DISTINCT FROM OLD.required_inputs
         OR NEW.category            IS DISTINCT FROM OLD.category
         OR NEW.finding_type        IS DISTINCT FROM OLD.finding_type
       )
    THEN
        RAISE EXCEPTION
            'RULE_VERSION_IMMUTABLE: a % rule version cannot be edited; publish a new version instead',
            OLD.lifecycle_status;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER rule_versions_content_is_immutable
    BEFORE UPDATE ON rule_versions
    FOR EACH ROW
    EXECUTE FUNCTION rule_versions_reject_content_edit();

-- What the rules engine answered for one report, kept so a report can explain itself later
-- even after a rule is retired or replaced.
CREATE TABLE report_rule_evaluations (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id       UUID        NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    rule_version_id UUID        NOT NULL REFERENCES rule_versions(id),
    outcome         TEXT        NOT NULL
        CHECK (outcome IN ('applies', 'does_not_apply', 'not_assessed')),

    -- Why it answered that: missing inputs, an unknown tradition, a condition the
    -- evaluator refuses to run. Never empty for not_assessed.
    reasons         JSONB       NOT NULL DEFAULT '[]'::jsonb,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (report_id, rule_version_id)
);

COMMENT ON TABLE report_rule_evaluations IS
    'One row per rule version considered for a report, with the outcome and its reasons.';
