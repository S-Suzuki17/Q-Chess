# Self-service account deletion — released 2026-09-24

2026-09-24: shared Web/server source `fe8b473` is deployed; AAB18 is built. Production migration `20260924140124` is applied and the public capability endpoint returns `available:true`. Contact/privacy pages explain the deletion entry point in all12 languages. No actual production account was deleted during verification. See `release-1.13-code18.md` for evidence and remaining wider-audit limitations.

## Verified baseline

- No existing self-service deletion. Account settings only log out; privacy/contact offers email requests.
- Production Q-Chess `gtxbvbsplfkkjlmnqath` catalog read only: profiles, friends, active_matches, game_records, ranked_match_settlements, system_status. No public foreign keys. Ad allowances/founders migrations are local only and remain OFF.
-32 game_records;8 have neither participant ID. Do not guess their owners from non-unique display names or delete unrelated records.
- avatars is the only storage bucket. Current upload ownership is `u/<sha256(userId)>/<uuid>.webp`; past photos deliberately retained by the old uploader. Must delete all owned photos, not only the latest URL. Storage has owner_id (text) and owner (uuid).
- Existing profile trigger blocks client deletion. Use service-only server authorization, never trust a supplied user ID. Supabase JWT is verified with getUser; legacy account uses existing password-verified opaque proof. Guest/raw ID must fail.
- Auth admin deletion and Storage APIs required, not client service credentials. Deleting Auth alone does not revoke unexpired JWTs; reject deleted users through server getUser and guard stale direct writes.

## Planned safe workflow

1. Settings > Account > Delete account (all12 locales). Clear irreversible warning, final typed DELETE confirmation. Do not start while a match or its settlement is active.
2. Durable service-only deletion job and random256-bit client-held retry ticket. Save ticket before initiation; return no arbitrary user data. Resume after a failed response/restart without requiring an already-deleted Auth identity.
3. Block new actions for a deleting account, revoke all its legacy proofs and disconnect only its sockets. Reject deletion while account writes/uploads are in flight; do not race a photo upload or recreate deleted records.
4. Delete every owned Storage object via Storage API (metadata enumeration is read-only); errors retain retry job. No external Google photo deletion.
5. Atomic application-data deletion: own profile/name/email/password/rating, friends both directions, active-match rows, own single-player history; scrub deleted participant from shared records and settlement receipts; keep opponent accounts and ratings. Optional native allowance/entitlement rows deleted only if tables exist. User CONFIRMED retaining anonymized opponent win/loss only and erasing replay moves.
6. Delete Auth identity via server admin API only when proven OAuth identity owns the job. Missing Auth user on retry is acceptable; permission/network errors are not success.
7. After every phase succeeds, erase job personal IDs and keep a non-identifying completion receipt so a lost final response can be retried. Receipts older than24h are currently cleaned on the next deletion initiation (not a scheduled TTL guarantee). Client clears Q-Gambit account/session/progress data on this device and logs out. Local storage failures get a separate completion warning, not a false server failure. Other devices lose authentication; cannot remotely erase offline storage, downloads, Google account, or backup snapshots.
8. Update Web privacy/contact/deletion-access explanation truthfully. Do not promise instant deletion from backups or copies held by others. No production test accounts/data or real-user deletion in QA.

## Verification before enabling

Current local evidence:34 route/client/avatar tests,43 with ranked gateway regressions;7 actual migration scenarios in disposable PGlite;6 loopback online scenarios;server build and shared typecheck passed. Avatar leases now outlive HTTP disconnect, and an ambiguous begin response keeps writes blocked until the DB outcome is known. Verified Auth identities with missing application profiles can delete themselves.

Remaining: actual React/native UI flow; generic account write migration/old clients; stale-token and late-write threat review; public deletion webpage/policy; production migration and phased server deployment. See `commercial-release-audit-20260924.md`.

- Local route authentication/body/rate-limit/IDOR tests; cross-account and guest denial; duplicate/retry and partial Storage/Auth/DB failure; active-match rejection.
- Disposable database executes actual migration with two local users: deletion scope, opponent ratings unchanged, grants/RLS, rollback, retry, no personal data in completion receipts.
- UI confirmation/no-write-before-confirm and cleanup/error-retry tests, Web/native build, real QA-device core smoke.
- Production schema/server rollout and public capability check only. User has not authorized production test account creation. No Play upload, real ads, quotas or preregistration distribution activation.
