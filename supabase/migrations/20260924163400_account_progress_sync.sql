begin;
create table public.account_progress (
    user_id text primary key references public.profiles(id) on delete cascade,
    progress jsonb not null check(jsonb_typeof(progress)='object' and octet_length(progress::text)<=16384),
    revision bigint not null default 1 check(revision>0),
    updated_at timestamptz not null default now()
);
alter table public.account_progress enable row level security;
revoke all on public.account_progress from public,anon,authenticated;
grant select,insert,update,delete on public.account_progress to service_role;
-- Compare-and-swap prevents a late device save from overwriting newer progress.
create function public.save_account_progress(p_user_id text,p_revision bigint,p_progress jsonb)
returns boolean language plpgsql security invoker set search_path=pg_catalog
as $$ begin
    if p_revision<0 or p_progress is null or jsonb_typeof(p_progress)<>'object' or octet_length(p_progress::text)>16384 then
        raise exception 'Invalid progress' using errcode='22023';
    end if;
    if p_revision=0 then
        insert into public.account_progress(user_id,progress) values(p_user_id,p_progress) on conflict(user_id) do nothing;
    else
        update public.account_progress set progress=p_progress,revision=revision+1,updated_at=now()
        where user_id=p_user_id and revision=p_revision;
    end if;
    return found;
end $$;
revoke all on function public.save_account_progress(text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.save_account_progress(text,bigint,jsonb) to service_role;
commit;
