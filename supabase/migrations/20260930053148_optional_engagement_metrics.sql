begin;

-- One anonymous row per consented browser milestone. Event IDs are independent
-- random retry keys, not installation or account identifiers.
create table public.engagement_events (
    event_id uuid primary key,
    event_type text not null check (event_type in (
        'first_visit', 'tutorial_started', 'tutorial_completed',
        'first_match_started', 'first_match_completed',
        'second_match_started', 'next_day_return'
    )),
    cohort_day date not null,
    received_at timestamptz not null default now()
);
create index engagement_events_cohort_idx on public.engagement_events(cohort_day, event_type);
create index engagement_events_retention_idx on public.engagement_events(received_at);
alter table public.engagement_events enable row level security;

-- The Web browser cannot read or write this table. The Render service-role
-- client can insert only the three event fields, without overriding received_at.
revoke all on table public.engagement_events from public, anon, authenticated, service_role;
grant insert (event_id, event_type, cohort_day) on public.engagement_events to service_role;

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('qg-engagement-events-retention', '17 2 * * *',
    $$delete from public.engagement_events where received_at < now() - interval '90 days'$$);
select cron.schedule('qg-engagement-job-history', '25 2 * * *',
    $$delete from cron.job_run_details where jobid in
      (select jobid from cron.job where jobname in
        ('qg-engagement-events-retention','qg-engagement-job-history'))
      and end_time < now() - interval '7 days'$$);

commit;
