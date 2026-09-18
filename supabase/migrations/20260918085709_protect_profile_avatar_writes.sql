-- Ship with the authenticated /profile/avatar routes. Existing images are kept.
begin;
set local lock_timeout = '3s';

create or replace function public.guard_profile_avatar_writes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
    if current_user in ('service_role','postgres') then return new; end if;
    if (tg_op = 'INSERT' and new.avatar_url is not null)
        or (tg_op = 'UPDATE' and new.avatar_url is distinct from old.avatar_url) then
        raise exception 'Avatar changes require the authenticated profile service' using errcode = '42501';
    end if;
    return new;
end;
$$;
revoke all on function public.guard_profile_avatar_writes() from public, anon, authenticated;
create trigger guard_profile_avatar_writes
before insert or update of avatar_url on public.profiles
for each row execute function public.guard_profile_avatar_writes();
grant select (id,avatar_url), update (avatar_url) on public.profiles to service_role;

-- Uploaded avatar bytes now go through server-side image validation. Do not
-- alter SELECT policies or remove existing objects while retiring direct writes.
drop policy if exists "Users can upload their own avatar." on storage.objects;
drop policy if exists "Users can update their own avatar." on storage.objects;

commit;
