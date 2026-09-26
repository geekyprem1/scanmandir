-- Users: the internal identity every owned record will reference.
--
-- Scope note: this is the one domain table that does not depend on the label catalog
-- (P0-06). Scans, media, observations, rules, reports and the rest still wait in P3-03;
-- they arrive with the phases that use them. Creating `users` now is what lets the API
-- resolve a verified token to a stable owner (P3-04) and serve a profile (P3-05).
--
-- Design follows ARCHITECTURE.md section 9: user-owned records use internal UUIDs, and
-- the identity provider's subject is a unique mapping onto that UUID rather than the
-- primary key. Possession of a UUID is not authorization — authorization is an
-- ownership constraint checked in the same query that reads the row.

CREATE TABLE users (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

    -- The provider's stable subject (Supabase `sub`). Unique, and the only way a
    -- verified token maps onto this row. Never exposed as an identifier of owned data.
    identity_subject TEXT        NOT NULL UNIQUE,

    -- Mirrors the token's `is_anonymous` claim so operations can tell guests from
    -- registered users without decoding a token. Kept in step on every request, which
    -- is also how an in-place guest upgrade (D-15) becomes visible here.
    is_anonymous     BOOLEAN     NOT NULL,

    -- Chosen UI language. Null until the user picks one; the client falls back to its
    -- own default. Add a migration when a language is added to the launch set.
    language         TEXT        CHECK (language IN ('en', 'hi')),

    -- Deletion is a lifecycle, not a flag: the flow and its ledger arrive in P8-05.
    deletion_status  TEXT        NOT NULL DEFAULT 'active'
                         CHECK (deletion_status IN ('active', 'requested', 'deleted')),

    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Bumped when a profile field actually changes, not on every request.
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Bumped on every authenticated request; useful for support and retention rules.
    last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE users IS
    'Internal identity. Owned records reference users.id, never the provider subject.';
