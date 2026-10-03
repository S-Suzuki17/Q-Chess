# T1 ranked admission and recovery — local verification, 2026-10-03

Base: `9102ad4a2230bf88379f53550362f70d1fd439c2` (T0).
Branch: `fix/ranked-admission-recovery-20261003`.
Worktree: `C:/Users/souta/Documents/Codex/2026-10-03/q-gambit-t1-ranked-20261003/work/q-gambit-t1`.

Implementation and disposable tests are complete locally. All ticket source gates remain false, including the new recovery gate. No production database, Render, deployment, push to main, or external publication was performed. T0's commit contained all prerequisites; no untracked source from the shared checkout was imported.

## Resulting behavior

The second ready connection synchronously moves a ranked match to ADMITTING. No engine exists until the same UUID receives a confirmed admission and both players remain connected. Admission requests and reconnects coalesce. A lost response retries the UUID without another charge. Reconnecting after a disconnect during admission activates the confirmed allocation once. Private room codes retain their existing path; an unknown queue UUID after a crash returns an explicit match_not_found cancellation.

One database transaction binds UUID, human roles, time control, CPU identity/profile, and owner epoch. It allocates both PvP humans together, or one human for CPU on either side. Profiles and wallets lock in sorted order. The third daily quota slot cannot be claimed by concurrent different UUIDs, and one user cannot have two durable active admissions. Insufficient funds produce a permanent rejected UUID with no partial debit; invalid eligibility rolls back the transaction.

Infrastructure cancellation freezes the engine and retains the busy state until durable void or saved settlement is confirmed. A missing admission can be tombstoned before a late request arrives. Settlement, admission finalization, Elo, and history commit together under the same match lock. A settled result wins over recovery even if its response was lost. There is no durable engine snapshot: an expired owner's unfinished admission is voided.

Quota voids release the original UTC day's receipt. Ticket voids create uncapped refund credits instead of filling capped wallets. Spending a credit and voiding again reopens the original credit, so repeated failures do not multiply refunds. Paid credits retain their original subscription and expiry and require the current eligible live entitlement; pause suspends use, while expiry, cancellation, refund, and reversal make them unavailable.

Deletion intent and profile deletion share the profile lock with admission and reject an active admission with ACCOUNT_BUSY. Final profile deletion cascades user allocations/refunds, removes their admission IDs, and randomizes the metadata fingerprint; the UUID tombstone remains to prevent a late replay.

## Ownership timing

- Database owner TTL: 20 seconds. Renewal refuses to revive an expired epoch.
- Renewal starts every 3 seconds; each RPC has a 5 second abort timeout.
- Local authority lasts at most 10 seconds measured from renewal request start, using both monotonic and wall clocks. A delayed acknowledgement cannot extend the previous deadline or bridge a gap.
- Failed or late renewal permanently retires the process epoch and freezes its admitted matches. Recovery may void a peer only after its database lease expires.
- The nominal margin between local authority expiry and database expiry is at least 10 seconds. The engine checks authority for moves, intro, timeout, CPU replies, forfeit, and public clock projection. Synchronous rule work is staged and rolled back if the deadline passes while computing.

This requires normally progressing database time. Clock anomalies retire local ownership; arbitrary large database clock jumps and the deployment's actual clock configuration were not exercised by these local fixtures.

## Database contract and rollout

The two unpublished T1 migrations were replaced in place:

1. `20261001000001_ranked_match_admissions.sql`: server leases, permanent admission ledger, allocations, uncapped credits, renewal and atomic admit RPC.
2. `20261001000002_ranked_match_void.sql`: idempotent void, expired-owner recovery, participant read, durable busy check, deletion triggers, admission-aware settlement, refund balance, protocol readiness.

All four tables have RLS and explicit grants. RPCs are service-role-only, security invoker, and use an empty search path. The full protocol readiness RPC returns version 2 only after the second migration commits. The old nine-argument settlement function is replaced by a ten-argument function with a default null owner, preserving free ranked calls while preventing them from bypassing an existing admission.

The disposable fixture applies the actual ranked settlement migration `20260918072145` and the 11 dependent ticket migrations in explicit order. It does not apply the historical duplicate `20260918062045` or unrelated migration files. The parent must check production migration history and select the pending files deliberately. If either T1 version was already applied anywhere, prepare a new forward migration instead of editing that database's migration history.

Release admission and recovery source gates together only after integration verification. Rollback turns off new admission while keeping recovery enabled via its independent source and environment gates. Environment variables alone cannot enable this branch's false source gates.

Socket preparation uses `match_preparing {matchId, reason}`; terminal infrastructure recovery uses `match_cancelled`; a saved result uses `rating_settled`. `get_ranked_refund_balance` and `SupabaseService.rankedRefundBalance()` expose eligible `freeRankedRefunds` and `paidRankedRefunds` separately from capped wallets.

## Verification

- PGlite 0.5.8: all 13 SQL scenario groups passed after the final SQL change. Covers role denial, UTC quota, CPU both sides, metadata retries, tombstones, atomic insufficiency/eligibility, original-day void, capped-wallet refunds and reuse, settlement exclusion, legacy free settlement, deletion, paid policy, and live/expired owner recovery.
- Native disposable PostgreSQL 18.4.0-beta.17: all 13 scenario groups passed after the final SQL change. Includes reversed two-player locks and identical allocation timestamps, parallel duplicate debit/refund, eight real settlement/void races with alternating initiation order, and deletion/admission races.
- Eight forced child-process terminations passed: before admission, after DB commit, before match_start, after match_start, human action, actual CPU worker move, during settlement, and after settlement commit. Recovery is run twice; each match has exactly one allocation/refund or saved result.
- The native child uses the real built GameEngine and CPU worker and an IPC match_start boundary. It does not boot a full HTTP/Socket.IO deployment. Gateway tests exercise the server handlers with mocked transport/store and real matchmaking/engine.
- Final full Vitest suite: 144 files / 1,106 tests passed after all source changes (89.37 seconds). Targeted coordinator, gateway, store, feature gate, runtime, and deletion tests also passed during development.
- Root typecheck, server TypeScript build, and Web production build passed. Web used `npm run build -- --webpack` because dependency junctions are shared with the canonical checkout. Build needed access to public Google Fonts; no deployment followed.

Reproduction from this worktree:

```text
npm test -- --maxWorkers=2
npm run typecheck
npm --prefix server run build
npm run build -- --webpack
node scripts/qa/test-ticket-migration-chain.mjs
node scripts/qa/test-ranked-admission-sql.mjs
node scripts/qa/ranked-admission-native.mjs
```

The native runner accepts no remote URL or credentials, binds only 127.0.0.1 on a random port, and stops its cluster in finally. Its pinned scratch setup command is in the script header. PGlite dependencies use the existing scratch/ticket-sql fixture. Node dependencies are junctions to T0's canonical dependencies; scratch binaries, databases, logs, build output, and junctions are not committed.

## Parent integration remaining

1. Merge/cherry-pick this branch after T0; reconcile only the ranked sections of shared server files with other task branches.
2. T3/T5 must include available refund credits in the displayed ranked balance/availability and label the preparation/recovery state. Credits can exceed the wallet cap; do not truncate them to 20.
3. T4 must preserve one authoritative entitlement policy for both ordinary paid tickets and refunds when merging membership changes.
4. Verify the merged app with its actual Supabase/PostgreSQL version and PostgREST function cache, validate production migration history, and run the complete server/socket flow before enabling either source gate.
5. Integrate the new QUBE diary entry and its export into the canonical publication. It is local and unpublished here; the shared checkout was left untouched.

## Files

Server: `MatchmakingService.ts`, `GameEngine.ts`, `RankedRuntime.ts`, `index.ts`; `RankedAdmissionCoordinator.ts`, `RankedAdmissionStore.ts`, their tests and `RankedAdmissionGateway.test.ts`; `SupabaseService.ts`, `AccountDeletion.ts`, `TicketFeatureGates.ts` and its test.

SQL/QA: both ranked migrations; `ranked-admission-fixture.mjs`, `ranked-admission-native.mjs`, `ranked-crash-child.mjs`, `test-ranked-admission-sql.mjs`, `test-ticket-migration-chain.mjs`; `vitest.config.ts`.

Documentation/diary: this report, `ranked-start-admission-recovery.md`, `src/data/devDiary.ts`, and `outputs/qube-drafts/t18-ranked-recovery-20261003.txt`.
