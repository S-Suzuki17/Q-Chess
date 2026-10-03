# Ranked start admission and recovery design

Status: design and acceptance plan only. Ranked ticket spending remains disabled and is not connected to gameplay. Do not turn on the release gate from this document alone.

## Why the existing receipt RPC cannot be connected yet

`MatchmakingService.connectMatch()` synchronously changes a match to `IN_GAME` and constructs `GameEngine` when the second participant connects. The constructor sets `startsAt` and `clock.lastMoveAt` immediately. `server/src/index.ts` then sends `match_start`; `RankedRuntime.tick()` and `player_action` can advance the engine. `spend_game_tickets` has atomic, idempotent accounting for one or two participants, but it records only receipts. It has no durable match state or inverse operation. If the process dies after that RPC commits, the receipt survives and the engine disappears. If debit is placed after `connectMatch()` or its first emission, a clock or action can happen before debit. A CPU worker failure currently cancels the match in memory without accounting compensation.

The fix is one **admission protocol** shared by matchmaking, settlement, recovery, and account deletion. Calling the existing spend adapter from the `justStartedFlag` hook is not an admission protocol.

## Required invariants

1. Queueing, matching, connection timeout, and cancellation before admission consume neither a daily free start nor a ticket.
2. Both human players in PvP are admitted in one database transaction. Either both have a quota use or ticket debit, or neither does. A CPU fallback has exactly one human participant.
3. The server derives the participant IDs, time control, CPU identity, and match UUID from its authenticated match record. Once attached to a UUID, these values cannot change on retry.
4. No ranked engine clock, action, timeout, CPU move, or `match_start` is exposed until the admission transaction is known to have committed. An uncertain RPC acknowledgement is retried with the same UUID and cannot start a second match.
5. A match the server can no longer resume is durably voided. Its quota use and any ticket debit are compensated exactly once, including a crash between database commit and the first emission and a CPU worker failure after admission.
6. Reconnect to an in-progress admission waits on the same attempt. Reconnect after a process restart receives a deterministic recovered/voided result; it never spends again or silently creates a fresh match UUID.
7. A recorded ranked result and its final admission state commit together. Recovery cannot refund a settled match or settle a voided match.
8. A process that loses ownership of a match cannot keep advancing its engine while another process voids or recovers it.

## Proposed durable state

Create a server-only `ranked_match_admissions` table keyed by match UUID. Store the fixed sorted human IDs, host/joiner IDs, time control, CPU metadata, owner process epoch, state (`admitting`, `active`, `settled`, `voided`), creation and transition times, and a version/fence. The existing ticket receipts remain immutable evidence of allocation, with a unique `(event_kind, event_id, user_id)` key. The admission row and the two receipts must commit in the **same** transaction; two separate PostgREST calls are insufficient. Rows in `public` need RLS, explicit service-role privileges, and no client-role access. Use `security invoker` RPCs restricted to `service_role`, qualified object names, and a fixed search path.

`admit_ranked_match` should take the match UUID and server-derived immutable metadata, lock the admission key and both participant profiles/wallets in sorted order, check account and entitlement eligibility, allocate each account's first three UTC starts before free then eligible paid tickets, and commit the admission plus receipts atomically. It returns `admitted`, `duplicate`, or `insufficient` with the original allocation. A duplicate with changed metadata is an error. It must preserve the current SQL's single database timestamp for both PvP players across a UTC midnight boundary. On RPC timeout, the server retries the same UUID; it never assumes that the transaction rolled back.

`void_ranked_match` should lock the admission row and the same account rows, reject `settled`, and atomically change `active` to `voided` with exactly-once compensation. Deleting a quota receipt releases the quota on the **original** UTC day, without consuming the current day's quota. Crediting a wallet balance directly is insufficient: grants may have filled its 20-ticket cap between admission and void. Store owed refunds separately and make later spending consume refundable credits before new tickets. Preserve whether the source was free or paid and the paid subscription identity; a paid credit must follow the established membership expiry/reversal policy. A repeated void returns the saved outcome. The same transaction must prevent a subsequent settlement.

For process ownership, create a short-lived database lease/fence per server epoch. Renewal failure must stop that process's ranked clocks, CPU work, and actions before the lease can expire. A new process must not void a predecessor's `active` admissions until the predecessor's lease is expired/fenced. Every state-changing path (human action, CPU action, timeout, disconnect forfeit, settlement) must honor the fence. A local `IN_GAME` flag alone is not proof of ownership. If enforcing the lease without a database round trip on every action, document and test the timing bound between renewal, local expiry, and recovery; `GameEngine.getPublicState()` also computes elapsed time and needs a pause/freeze path when ownership is uncertain.

The current `settle_ranked_match` RPC needs an admission-aware version that writes the rating result/history and marks the admission `settled` in one transaction. Recovery treats a stale `active` admission without a committed result as an infrastructure void. If result persistence is uncertain, it retries settlement by match UUID before considering a void. Account deletion must check durable `admitting`/`active`/unresolved voids, not only `MatchmakingService.accountBusy()`, and may proceed after final settlement/compensation.

## Server transition sequence

| Phase | Server and database behavior | Client-visible behavior |
| --- | --- | --- |
| Queue / match / connect | Existing memory-only queue and 15-second connection timeout; no admission call | Existing queue and `match_found` events |
| Both ready | Synchronously mark the match `ADMITTING`, coalesce concurrent connect/reconnect calls by UUID, and keep the engine absent/frozen | Preparation; no `match_start` or running clock |
| Admission succeeds | Construct the engine with a future start time only after the committed RPC response; record active ownership | Send one `match_start`, then normal sync |
| Admission is insufficient | Cancel the paired match without an engine | Give both PvP players a clear insufficient/unavailable result; neither is charged |
| RPC result is uncertain | Retry/read the same UUID while the match remains frozen | Preparation or retryable error; never a new charge |
| CPU worker fails | Stop engine actions/clocks, call idempotent void, and retry an uncertain void before clearing the account's busy state | Send `match_cancelled` after durable compensation |
| Process dies | New owner fences stale match, idempotently voids or completes a committed settlement, and reports the result on reconnect | No second debit; explicit cancellation for a voided match |

`justStartedFlag` is an emission hint, not a stable admission state. The transition to `ADMITTING` must happen synchronously before the first `await` in the second `connect_match` path so a second socket cannot activate the match in parallel. The rank check before queue entry is only an early user experience check; eligibility is decided again inside the atomic admission RPC.

## Acceptance tests before wiring the feature

Use a disposable PostgreSQL fixture for transaction tests and fault injection around every server/database boundary. No production database is needed.

- Four ranked starts on one UTC day allocate `quota, quota, quota, free/paid`; a new UTC day resets only the quota. Concurrent different match UUIDs for one user cannot each claim the third free start.
- Two-player admission with one ineligible or out-of-tickets player leaves both balances and both quota counts unchanged. Concurrent reversed participant order does not deadlock. Duplicate UUID with changed participants, time control, or CPU metadata fails.
- CPU fallback debits only the human. A PvP match that times out before both players connect debits neither.
- Drop the admission RPC response after commit. Retry and reconnect return the same committed allocation and start the engine once. Drop it before commit and verify no engine or clock starts until a successful retry.
- Kill the server at each point: before admission, after DB commit but before engine creation, before `match_start`, after `match_start`, during a human action, during a CPU move, and during settlement. Recovery must either resume an explicitly durable engine or void exactly once with no ticket/quota loss.
- Make the CPU worker reject, return no move, return an illegal move, and exceed its deadline. Every infrastructure cancellation must settle as a void/refund without a rating change. Repeated cancellation and process recovery must not double compensate.
- Cross UTC midnight between admission and void; release the original day's quota. Fill a wallet to its cap through later grants before void; the refund credit must remain spendable. Check paid ticket termination/reversal policy separately.
- Start an old and new process simultaneously. Force the old owner to miss lease renewal while connected sockets continue sending actions and `request_sync`; no clock/action/settlement may advance after fencing or while refunding.
- Commit ranked settlement, then lose its RPC response and crash. Recovery must return the saved result, never void or refund. Race settlement against void and assert only one wins.
- Account deletion during `ADMITTING`, `active`, unresolved void, and `settled` respects the durable state; reconnect after restart receives the match's final status idempotently.

## Implementation order and release gate

1. Add schema and RPCs in a local migration and execute disposable PostgreSQL tests for locks, atomic admission, compensation, cap, UTC, and settlement/void exclusion.
2. Add server-owned lease, frozen admission state, and failure injection tests. Prove `GameEngine` time cannot advance before admission or after lease loss.
3. Wire connect/reconnect, CPU cancellation, settlement, and account deletion together; run the server unit/integration tests and complete migration chain on a development database.
4. Only after those checks pass, review the release gate and user-facing quota disclosure. Keep spending OFF until then.

Relevant current files: `server/src/matchmaking/MatchmakingService.ts`, `server/src/index.ts`, `server/src/game/GameEngine.ts`, `server/src/game/RankedRuntime.ts`, `server/src/services/TicketSpendStore.ts`, `server/src/services/SupabaseService.ts`, and `supabase/migrations/20260930133414_atomic_ticket_spending.sql`.
