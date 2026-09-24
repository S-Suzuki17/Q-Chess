begin;
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('qg-security-audit-retention','0 * * * *',
    'select qg_private.purge_security_events()');
-- Only this job's own execution history expires; other operators' jobs are untouched.
select cron.schedule('qg-security-audit-job-history','15 0 * * *',
    $$delete from cron.job_run_details where jobid in
      (select jobid from cron.job where jobname in ('qg-security-audit-retention','qg-security-audit-job-history'))
      and end_time < now()-interval '7 days'$$);
commit;
