# Dormant durable authentication runtime

Local verification only; not applied, deployed, activated, or approved for production.
`DURABLE_LEGACY_RUNTIME_RELEASE_READY=false` rejects `LEGACY_SESSION_MODE=durable`
at startup. The memory default remains in place, with no fallback after selecting
durable mode. Both SQL protocol versions report `activationReady:false`.

## Implemented boundary

- `SupabaseService.durableSessionAuthority()` uses the existing server service
  client. The strict adapter sends SHA-256 hashes, keeps the original bearer
  format and absolute one-hour / 720-hour lifetimes, awaits every operation and
  sanitizes failures. Ambiguous issuance cleans up only that attempted token.
- The additive `inspect_legacy_session` RPC reads the session and account fence
  in one READ COMMITTED snapshot and returns DB `serverNow`. Issuance uses its
  existing DB `issuedAt`. HTTP issuance/status explicitly project public fields;
  incarnation/generation never reach the browser. No application-host clock is
  compared to a DB expiry to manufacture validity.
- `inspect_live_legacy_sessions` takes 1–200 server-owned hashed-token and account
  fences (bounded to 150 KB), checks service role, pins `search_path`, and returns
  `valid`, `expired`, `revoked`, or `evidence_lost`. Account erasure/recreation and
  generation changes remain distinguishable after expired-session cleanup.
- Each live legacy socket retains its verified fence. Polling runs every five
  seconds, queries independent 200-socket batches concurrently, and never overlaps
  sweeps. With a responsive event loop and all DB calls completing within the
  adapter's ten-second deadline, explicit revocation is observed within at most
  25 seconds (two query deadlines plus one poll interval); with sub-second calls,
  normally within six seconds. This bound requires retained token evidence for
  token-specific logout. An outage has no promised revocation latency.
- Only a positively revoked current socket binding is disconnected. Expiry,
  missing expired-token evidence, and DB failure preserve existing games. New
  registered random/ranked/private admissions reverify identity after asynchronous
  work; queues, CPU fallback and game activation also enforce conservative
  monotonic/wall deadlines. Expiry before a charged ranked game starts uses the
  existing cancellation/refund path, not a rated forfeit. There is no DB query
  per move and no new multi-device login policy or horizontal matchmaking claim.
- Delayed poll/admission results are checked against the current socket, account,
  token, binding and matchmaking owner. `session_replaced` retains credentials;
  `session_revoked` clears only the matching browser legacy proof and revision,
  without network logout or affecting OAuth/unrelated proofs. Background refresh
  does not disconnect an already connected game solely for legacy expiry.
- Account restriction stays separate from identity. The existing restriction
  poll disconnects a restricted game socket without globally revoking identity,
  preserving recovery/deletion access.

## Native evidence and inventory

The new migration `20261006154443_dormant_legacy_session_runtime.sql` was created
with official Supabase CLI 2.119.0 `migration new` after help discovery, then
filled with the reviewed additive SQL. It adds functions only; it does not alter
retention, install a scheduler, add leases or retain account-hash tombstones.

The native fixtures execute 22 raw public historical dependencies and all five
pending migrations. The original 35 auth and 31 commerce scenarios remain; ten
new native runtime scenarios exercise the actual compiled TypeScript adapter,
two SQL backends, a restarted process, DB clock consistency, absolute expiry,
local/global logout, real password reset/deletion, service-only access, bounded
batch input, ambiguous issuance cleanup, HTTP response projection, and real
loopback Socket.IO delivery while preserving GameEngine state on expiry/outage.
The report includes an explicit inventory, source digests, and no-skips totals.

`scripts/qa/session-runtime-rpc.mjs` is a parameterized native SQL RPC bridge. It
proves the actual adapter-to-SQL contract, not PostgREST, HTTP RPC transport,
hosted Supabase permissions, Auth JWT validation or provider behavior. Ordinary
Vitest tests also load actual `index.ts` over loopback HTTP/Socket.IO with isolated
persistence mocks to cover random/ranked/private admissions, guests, delayed
replacement and an active game across expiry/outage. No provider traffic occurs.

Run `npm run build --prefix server` before the native session suite. CI builds
that adapter, then runs `node --test --test-timeout=180000
scripts/qa/session-postgres.test.mjs` against a fresh PostgreSQL 17 service. Local
fresh-cluster runner: `node scripts/qa/session-postgres-local.mjs
/absolute/postgres/bin`, and add `--commerce` for the 31 commerce scenarios.
Local native version is 17.6; CI pins 17.11. This is not a hosted-schema capture.

## One unresolved owner decision, blocking activation

The ten-second game mode resets the moving side's clock each turn
(`GameEngine.processAction`); there is no proven 24-hour game-duration ceiling.
Cleanup deletes expired/revoked session evidence after 24 hours. If an expired
row is already gone, a later token-only logout cannot produce shared positive
revocation evidence. Treating absence as revocation would invent a forfeit;
treating it as valid would allow admissions. Current dormant behavior therefore
preserves the game, denies new admission, and reports `evidence_lost` internally.
The native test explicitly proves this limitation. Indefinite DB outages also
cannot support an immediate-revocation guarantee.

Owner decision for later review: approve a bounded authorization-loss pause with
fresh reauthentication and evidence tied to a live lease, or choose a different
retention/continuity contract. A candidate lease would retain only live-token
rows, cascade with account deletion, use conservative deadlines and never let a
stale instance renew across a gap. Both clocks would have to freeze before
cleanup may erase evidence; resumption needs an explicit GameEngine clock-shift
primitive and fresh proof. Existing ranked ownership leases permanently freeze
and void/refund on loss, so they cannot simply be repurposed as resumable auth
leases. Ranked pause would remain subordinate to ownership; random/private need
separate pause/recovery UX. None of that proposed behavior is implemented here.
Production application, activation, merge, and the release gate remain held.

## Final local verification

- Full default Vitest inventory: 179 files, 1,729 tests passed, none skipped;
  `npm test -- --maxWorkers=1 --reporter=dot --reporter=json` and the repository
  completeness checker passed without changing any timeout or assertion
- Native PostgreSQL/pgcrypto: 45 auth/runtime scenarios (46 Node tests) and 31
  commerce scenarios (32 Node tests), all passed with the final five-file inventory
- The review follow-up adds ten client regressions: failed/aborted newer login,
  revocation during pending success, duplicate notices and revoked-token reuse.
  All 108 focused client/restoration checks and scoped ESLint pass; the full
  1,729-case rerun includes them
- Root typecheck, server TypeScript build, frontend production build and diary
  export completed; the diary is local only and no X posting occurred
- The initial unconstrained test run lost workers and concurrent typecheck was
  killed. A two-worker rerun passed 1,718 cases but exceeded the existing
  60-second legacy-perft limit. The complete serial rerun passed that benchmark
  and every other case; failed attempts remain recorded separately
- Hosted/PostgREST verification, exact-head remote CI and actual browser CI are
  separate release steps, not claimed by these local results
