# Server hint contract, 2026-10-08

Practice and tutorial hints use the existing free local QUBE worker. Online ranked, random, private and Crown hints use the immutable ticket ledger. A ranked CPU fallback keeps the original ranked mode; its matchmaking wait remains `CPU_FALLBACK_MS = 10_000`.

This release requires current terms `2026-10-08.1` and the forward migration `20261008054904_match_hint_tickets_and_free_practice.sql`. `CPU_HINT_TICKETS_ENABLED` controls new paid requests; it still defaults OFF. Existing receipt reads remain available when new purchases are disabled.

## HTTP contracts

All routes require the currently verified registered legacy proof or nonanonymous Supabase identity. Query parameters and undocumented body fields are rejected. The server derives user, side, mode, amount, board, history and clocks.

| Route | Request |
| --- | --- |
| `POST /match-hints/:matchId` | `{requestId: UUID, revision: number}` |
| `GET /match-hints/:contextId/:revision/:requestId` | No body |
| `POST /crown-hints/runs` | `{runId: UUID, stageId: 1..100, playerSide: 'white' \| 'black'}` |
| `GET /crown-hints/runs/:runId` | No body |
| `POST /crown-hints/runs/:runId/moves` | `{operationId: UUID, revision, actor: 'human' \| 'cpu', move: canonical Move}` |
| `POST /crown-hints/runs/:runId/close` | `{}` |
| `POST /crown-hints/runs/:runId/hints` | `{requestId: UUID, revision}` |
| `GET /crown-hints/receipts/:contextId/:revision/:requestId` | No body |

Online POST uses the room/match ID. Public game state adds `hintContextId`, a server UUID unique to that GameEngine. Crown `runId` is the client operation identity; each server run also has its own `hintContextId`. The ledger and recovery GET use this server context UUID. This avoids collision after room/run reuse, registry eviction or restart.

Successful hint responses are the receipt directly, with `receiptId`, `contextId`, `kind`, `mode`, `revision`, `stateHash`, `rulesVersion`, canonical `move`, `hint: HintAdvice`, and `deliveryState: 'paid_retrievable'`. GET returns that same receipt or `null`; it never initiates a purchase. Persist context UUID, revision and request UUID before dispatch. A recovered hint belongs to its recorded position and must not be drawn on a different current position.

`HINT_RECOVERY_PENDING` means the purchase outcome still needs recovery; keep the original request identity. `HINT_PURCHASE_PENDING` refuses another purchase or an explicit position mutation while the purchase fence is held. `PRACTICE_HINTS_FREE` is returned by the retired paid-practice POST without search or ledger access. Historical CPU-practice GET receipts retain their old URLs.

## Position and search authority

Online purchase requires a current connected participant, matching socket proof, own turn, revision, active clock, completed intro, and live match ownership. Search uses an explicit public field projection, so hidden identities and extra fields never enter worker data or the state hash. Current public candidates are mapped to stable canonical IDs and inverted coordinates (`row = 7 - native y`).

Hints use the strongest existing neutral QUBE profile: maximum depth 16, quiescence depth 4, and up to 15 seconds, shortened by the actual remaining clock/lease with one second reserved. Native online legality filters root choices and is checked again before purchase. Online promotion must be a playable N/B/R/Q choice; canonical decline-promotion roots are excluded only from online hints. CPU strength/personality profiles and free practice/Crown rules are preserved.

Moves remain possible during analysis. After asynchronous clock/auth checks, the service obtains a fresh canonical position, validates the selected move, and synchronously acquires a separate mutation fence. Stale search, disconnect, replaced socket, revoked proof, expired lease, missing move and illegal advice cannot dispatch a purchase.

## Purchase and recovery fence

The service reads DB time after search, then rechecks identity and the current position. It adds `min(real turn duration remaining, owner lease duration remaining, 5 seconds)` to the earlier DB observation to form the SQL `validUntil`. Response/auth latency makes this deadline conservative, including when host and DB absolute clocks differ.

After dispatch, a purchase RPC runs independently of the client HTTP socket. Success or a definite SQL rollback releases the fence. Unknown transport/result failures preserve it and return `HINT_RECOVERY_PENDING`. The real game clock continues; natural timeout and abandonment still finish the game. Explicit MOVE/RESIGN and Crown move/close are fenced. Pending work also keeps account deletion/recovery and new queue entry busy after the HTTP write barrier has released.

Recovery reads use the original `validUntil` as `notBefore`. SQL acquires the same profile lock used by purchase/refund/risk/delete. A saved receipt can return immediately. An absent receipt becomes a final `null` only after DB time reaches `notBefore`, so a late purchase can no longer debit. Failed verification retains the fence and retries with bounded backoff. No HTTP recovery path automatically refunds or restores credit.

Success is sent only after a fresh proof/connection check. A revoked/replaced connection receives no successful hint response; a fresh authenticated GET can recover the committed receipt. SQL owns uniqueness, aliases, origin allocation and operator-only restoration. The service does not invent a practice session or accept a client-provided purchase context.

## Crown registry boundary

The registry seeds the fixed canonical initial state and derives the 100 existing stages' strength and 600/180/10-second clocks. Human and CPU moves are applied independently using canonical rules and actor validation. Ten-second clocks reset per accepted move. The registry verifies actual moves; it does not prove that a client CPU used a specific search profile.

The current legacy Campaign entrance is preserved. `CROWN_VERIFIED_PROVIDER_READY` remains false. These routes grant no entry authorization, stage progress or ad reward, and do not call admission authorization again. Finished, unlocked runs and their operation records can be reclaimed at capacity; active or unresolved-purchase runs are retained. Receipt recovery does not depend on the registry surviving.

## Validation boundary

Targeted tests cover native legal roots/compiled and source workers, privacy, clock/lease expiry, strict/authenticated HTTP, identity races, aliases, response loss, DB-clock offset, expired-null settlement, deletion busy and terminal/gate-OFF recovery. Historical PGlite practice fixtures are used only to prove old receipt recovery and HTTP retirement.

`scripts/qa/match-hint-runtime-postgres.test.mjs` runs the actual compiled index, Socket.IO, Worker, Supabase adapter and PostgREST against disposable PostgreSQL 17. It applies the public dependency fixture, historical raw13 release and new forward policy. Its report records input hashes and distinguishes that scope from all46 hosted schema/Auth/Storage equivalence. Provider purchase/signature, browser and device verification remain separate integration checks.
