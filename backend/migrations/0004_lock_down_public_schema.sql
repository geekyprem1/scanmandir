-- Lock the application schema down for Supabase.
--
-- Supabase exposes the `public` schema through PostgREST, and the anon/authenticated
-- roles can reach tables created there. Our tables carry identity mappings, storage keys
-- and scan state, so they must never be reachable with the publishable key that ships in
-- the app.
--
-- Two independent measures:
--   * row level security on, with no policies — nothing is visible through PostgREST;
--   * the API roles lose their grants entirely, so there is nothing to bypass.
-- The backend connects as the table owner, which is not subject to row level security,
-- so it keeps full access (and the driver in CI/local Postgres runs as its own owner).
--
-- The role names only exist on Supabase-shaped databases, hence the guard: this
-- migration must also apply cleanly to the local and CI Postgres instances.

DO $$
DECLARE
    target RECORD;
BEGIN
    FOR target IN
        SELECT tablename
          FROM pg_tables
         WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target.tablename);
    END LOOP;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated';
    END IF;
END
$$;
