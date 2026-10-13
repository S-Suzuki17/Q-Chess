begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
-- Publish together with Web/backend and the available Android candidate.
-- Existing consents and immutable purchase snapshots retain their original versions.
alter table public.current_terms_policy drop constraint current_terms_policy_version_check;
update public.current_terms_policy set version='2026-10-13.1',effective_date='2026-10-13' where singleton;
alter table public.current_terms_policy add constraint current_terms_policy_version_check check(version='2026-10-13.1');
notify pgrst,'reload schema';
commit;
