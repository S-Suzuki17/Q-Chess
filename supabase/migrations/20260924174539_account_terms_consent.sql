-- Additive only: legacy Play clients retain their existing access until cutover.
create table public.account_terms_consents (
    user_id text not null references public.profiles(id) on delete cascade,
    version text not null check (version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]{1,3}$'),
    accepted_at timestamptz not null default now(),
    primary key (user_id, version)
);
alter table public.account_terms_consents enable row level security;
revoke all on public.account_terms_consents from public,anon,authenticated,service_role;
grant select,insert on public.account_terms_consents to service_role;
comment on table public.account_terms_consents is 'Explicit versioned terms consent; verified-owner server API only. No IP, token, or user-provided time. Deleted with the account.';
