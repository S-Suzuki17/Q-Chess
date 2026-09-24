-- Version aligned with the migration applied to production.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

-- These compatibility RPCs use unqualified table/pgcrypto names. Keep their
-- signatures, grants and behavior, but never inherit a caller's search_path.
-- Both application schemas must be non-writable by browser roles. Abort rather
-- than silently widening or changing any existing client privilege.
do $$ begin
    if exists (
        select 1 from pg_namespace n where n.nspname in ('public','extensions')
        and (has_schema_privilege('anon',n.oid,'CREATE')
            or has_schema_privilege('authenticated',n.oid,'CREATE'))
    ) then raise exception 'Untrusted schema CREATE privilege must be reviewed first'; end if;
end $$;

alter function public.register_user(text,text) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.login_user(text,text) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.update_user_email(text,text,text) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.record_match_result(uuid,text,text,text,integer) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.update_ratings_on_match() set search_path = pg_catalog, public, extensions, pg_temp;

-- This closes name-resolution hijacking, NOT the legacy direct-RPC brute-force
-- path. Revoking those endpoints needs a versioned client/server cutover.
commit;
