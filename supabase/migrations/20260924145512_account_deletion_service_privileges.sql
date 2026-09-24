-- Version aligned with the migration applied to production.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

-- Private replay retention deliberately revoked service DELETE. Self-service
-- erasure now needs it for records with no surviving account. The erasure RPC
-- stays SECURITY INVOKER and service-only: do not grant browser roles access or
-- bypass its ownership, durable-intent and Storage cleanup checks with DEFINER.
grant delete on public.game_records to service_role;

commit;
