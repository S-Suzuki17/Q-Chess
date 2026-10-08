begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

-- Publish the approved pricing/reward/source-aware terms. Old acceptance rows
-- and immutable Checkout snapshots keep their original version and timestamp.
-- Existing status/claim/checkout RPCs read this singleton policy; no consent
-- is backfilled and no feature, price binding or runtime gate is enabled here.
alter table public.current_terms_policy
    drop constraint current_terms_policy_version_check;
update public.current_terms_policy
    set version = '2026-10-07.1', effective_date = '2026-10-07'
    where singleton;
alter table public.current_terms_policy
    add constraint current_terms_policy_version_check check (version = '2026-10-07.1');

notify pgrst, 'reload schema';
commit;
