begin;

-- A daily job can run almost 24 hours after a row reaches its threshold.
-- Delete after 89 days so stored events never reach 90 full days.
select cron.unschedule('qg-engagement-events-retention');
select cron.schedule('qg-engagement-events-retention', '17 2 * * *',
    $$delete from public.engagement_events where received_at < now() - interval '89 days'$$);

commit;
