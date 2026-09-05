-- Apply after deploying clients that use PUBLIC_PROFILE_COLUMNS.
-- Login/register/email-update RPCs run as their existing postgres owner.
BEGIN;

-- Realtime honors column SELECT privileges. Publication column lists alone
-- are not sufficient with this project's wal2json-based Realtime reader.
REVOKE SELECT ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
REVOKE SELECT (password_hash, email) ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, name, rating, created_at, rating_10s, rating_3m, rating_10m, avatar_url)
    ON public.profiles TO anon, authenticated;

DO $$
DECLARE target_table text;
BEGIN
    FOREACH target_table IN ARRAY ARRAY['active_matches', 'friends', 'game_records', 'profiles']
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
              AND tablename = target_table
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', target_table);
        END IF;
    END LOOP;
END $$;

COMMIT;
