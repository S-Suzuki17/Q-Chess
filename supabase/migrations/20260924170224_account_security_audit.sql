begin;
-- Minimal approved security history. No free-form payload, IP, device or credential columns.
create table qg_private.security_events (
    id bigint generated always as identity primary key,
    occurred_at timestamptz not null default now(),
    event text not null check(event in ('login','registration','logout_all','block','unblock','upstream_error')),
    outcome text not null check(outcome in ('success','denied','error')),
    user_id text references public.profiles(id) on delete cascade
);
create index security_events_retention_idx on qg_private.security_events(occurred_at);
create index security_events_owner_idx on qg_private.security_events(user_id,occurred_at desc);
alter table qg_private.security_events enable row level security;
revoke all on qg_private.security_events from public,anon,authenticated;
grant select,insert,delete on qg_private.security_events to service_role;
grant usage on sequence qg_private.security_events_id_seq to service_role;
create function public.record_security_event(p_event text,p_outcome text,p_user_id text default null)
returns void language sql security invoker set search_path=pg_catalog as $$
    insert into qg_private.security_events(event,outcome,user_id)
    values(p_event,p_outcome,(select id from public.profiles where id=p_user_id))
$$;
revoke all on function public.record_security_event(text,text,text) from public,anon,authenticated;
grant execute on function public.record_security_event(text,text,text) to service_role;
create function public.set_account_restriction(p_user_id text,p_blocked boolean)
returns void language plpgsql security invoker set search_path=pg_catalog as $$ begin
    if p_blocked is null then raise exception 'Invalid action' using errcode='22023';end if;
    perform 1 from public.profiles where id=p_user_id for update;
    if not found then raise exception 'Unknown account' using errcode='22023';end if;
    insert into public.account_restrictions(user_id,blocked) values(p_user_id,p_blocked)
    on conflict(user_id) do update set blocked=excluded.blocked,updated_at=now();
    perform public.record_security_event(case when p_blocked then 'block' else 'unblock' end,'success',p_user_id);
end $$;
revoke all on function public.set_account_restriction(text,boolean) from public,anon,authenticated;
grant execute on function public.set_account_restriction(text,boolean) to service_role;
-- Only these new logs expire. Profiles, inactive accounts, matches and ratings are never scheduled for removal.
create function qg_private.purge_security_events()
returns bigint language plpgsql security invoker set search_path=pg_catalog as $$
declare removed bigint;
begin
    delete from qg_private.security_events where occurred_at < now()-interval '30 days';
    get diagnostics removed=row_count;return removed;
end $$;
revoke all on function qg_private.purge_security_events() from public,anon,authenticated;
grant execute on function qg_private.purge_security_events() to service_role;
commit;
