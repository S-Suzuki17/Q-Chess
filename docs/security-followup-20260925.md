# Security follow-up — 2026-09-25 JST

This is a partial remediation of the 40-item audit, not an all-clear for commercial release.

## Completed in the production database

- Owner explicitly requested deletion of three exact accounts. All three standard deletion jobs completed after repairing a real production ACL mismatch. Profiles, Auth identities, owned Storage photos, recovery bindings and identified replay rows for the targets were absent in the post-check. Three anonymous completion receipts remain. Other 171 profile IDs/ratings had the identical aggregate fingerprint before and after. No synthetic production users or games were created. Names/IDs are deliberately not published in this report or QUBE.
- The existing private-history migration had revoked `DELETE` from `service_role`; the deletion QA fixture had incorrectly granted every table privilege. Reproduced the failure, tightened the fixture and verified successful erasure after the minimal grant. The owner approved the service-role blast radius after an automatic safety rejection. Migration `20260924145512` grants DELETE only on `game_records` to the trusted backend; browser roles and TRUNCATE are unchanged.
- Migration `20260924145927` fixes the search path of five existing functions. Browser roles cannot CREATE in either trusted schema. Caller and temporary-schema shadowing tests pass. No legacy signature or EXECUTE grant was removed.
- Migration `20260924150213` gives legacy password verification a shared 10-check/60-second budget, including direct RPC and old email-update calls. Counters are in a private, RLS-enabled table with no API-role access; contain a hashed ID, timestamp and count only; are removed on account erasure and cleaned after one hour on subsequent known-account verification (not a scheduled TTL guarantee). Unknown/OAuth-only IDs cannot fill the table. Correct passwords also count; a saturated account must wait up to a minute. Existing hashes/passwords are unchanged.
- Password verification locks its profile row, rejects durable pending-deletion jobs, and uses explicit schema qualification. Brute-force failures return false so the counter commits. This does NOT address all signup bot abuse or all legacy profile ownership issues.

## Server change to deploy with this commit

- At most 16 concurrent legacy login checks across accounts. Overload returns 503 and Retry-After rather than creating an unbounded queue. Existing per-peer/ID limits now include Retry-After on 429.
- Durable pending-deletion checks before/after credential verification, so a restarted server cannot forget a pending deletion. Lookup failure fails closed with a generic 503; admission slots release in finally. No upstream exception/password/token is exposed.
- These are server/database changes compatible with the existing clients, including AAB18. No AAB was rebuilt in this follow-up. QUBE t7 describes only feature changes, never private deletion requests.

## Verification

- Deletion SQL: 7 isolated PGlite scenarios, now reproducing the actual prior replay ACL.
- Fixed search paths: 5 functions, all 3 API roles; temporary/caller schemas cannot redirect profile access or crypto resolution. Crypto is a deterministic test double, not a pgcrypto benchmark.
- Password budgets: 7 isolated PGlite scenarios (private ACL, bounded storage, shared budget, expiry, deletion, cleanup).
- Gateway/Auth/deletion routes: 91 tests passed; server TypeScript build passed. Release-wide selection: 772 tests across 86 files passed (expensive quantum-engine suites and RankCpuSearch excluded). Real loopback HTTP/Socket.IO: 6 passed. Shared typecheck passed.
- Post-migration catalog checks: all 5 fixed search paths present; browser roles cannot read/write budget counters or delete replay rows; service DELETE exists but TRUNCATE remains denied. Supabase advisor no longer reports mutable function search paths. Remaining intentional private-table notices and legacy definer/leaked-password-protection warnings are NOT advertised as a clean audit.
- Production checks are catalog/row-count checks and the specifically requested deletions. No remaining user's password, rating or gameplay was altered to test the changes.

## Necessary next work, in order

1. Move registration, profile creation/rename, friend reads/writes and match-list writes behind authenticated owner-scoped server APIs; prevent stale clients recreating a deleted legacy profile. Then remove broad browser database writes. This needs a staged Web/Android release; disabling the old paths before an updated Android build is available would break existing installations.
2. Per-account circuit progress/cloud merge, versioned terms acceptance/re-acceptance, explicit global logout with live Auth-session validation, and operational maintenance/update controls.
3. Account-based moderation, support-ID copy, private diagnostic collection with redaction/retention, and verified Play-signature OAuth/store QA.

Conditional/not adopted: iOS-only Apple login, IAP limits/refunds without IAP, paid automatic scaling, device fingerprinting, forced adblock login denial and unannounced dormant-account deletion. Ads/limits/reward distribution stay OFF; no age gate added.

## References

- [Supabase function search-path warning](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable)
- [Supabase public SECURITY DEFINER RPC risk](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
- [Auth deletion and outstanding JWTs](https://supabase.com/docs/guides/auth/managing-user-data)

RLS-without-policy notices on intentionally service-only tables are not fixed by adding public access. Public legacy authentication RPCs remain intentionally compatible for now; their exposure and remaining registration abuse risk are not marked resolved merely because a budget was added.
