# T2 CPU practice and immutable hints (2026-10-03)

Base: `9102ad4a2230bf88379f53550362f70d1fd439c2` (`integration/t0-ticket-off-20261003`). Work branch: `codex/t2-cpu-practice-20261003`. No push, production DB change, release-gate activation, live payment or deployment is part of T2.

The Web `src/quantum-engine` modules now re-export the canonical pure engine under `server/src/quantum-engine`. Existing Web rule/search implementations are preserved; the legacy display adapter stays on Web. `quantum-practice-v1` pins persisted sessions and receipts. Both local practice and the server use the same transition, full-board candidate deduction, promotion, special moves and terminal rules. CPU and hint search use the same Qoppelia evaluator as practice. Search runs in bounded, cancellable server workers, at most two at a time.

## API contract for integration

All endpoints require an identity-bound Bearer proof (existing legacy registered-account proof or verified non-anonymous Supabase session). The server rechecks proof/account consent, restriction and deletion state. Authenticated ownership comes from the proof, never a request user ID. Requests are rate/body bounded and responses are `no-store`.

| Method and path | Request | Result |
| --- | --- | --- |
| POST `/cpu-practice/sessions` | `sessionId` UUID, `playerSide` white/black, `level` 1/3/5, `seconds` 10/180/600 | Owned durable initial session, or same session on retry |
| GET `/cpu-practice/sessions/:sessionId` | none | Current authoritative state, accepted history, revision and remaining clocks |
| POST `/cpu-practice/sessions/:sessionId/moves` | `operationId` UUID, `revision`, `actor` human/cpu; one `move` for human only | Validate and commit one human move or generate/commit a CPU move |
| POST `/cpu-practice/sessions/:sessionId/hints` | `requestId` UUID, `revision` | Immutable `{receiptId,sessionId,revision,stateHash,rulesVersion,hint,move,deliveryState}` |
| GET `/cpu-practice/sessions/:sessionId/hints/:revision/:requestId` | none | The same paid receipt, or null; never purchases |
| POST `/cpu-practice/sessions/:sessionId/close` | empty object | Mark the owned session finished; never debits |

No board, move history, mode, side, amount or wallet pool is accepted for buying a hint. Human moves contain only `{pieceId,target:{row,col},chosenType?,promotionTarget?}`. The server owns initial state and every revision and generates CPU moves. A request ID reused for another owner/session/revision or a move operation reused with another intent fails. Session hashes canonicalize JSON object keys so Postgres JSONB reordering cannot change their meaning.

Hints exist only for a human turn in an active owned `cpu_practice` session. The server refuses current online/ranked matches and queueing. Queue/connect handlers refuse entry while a practice hint/move is in flight. The old `request_cpu_hint` socket always refuses submitted history, including after release. Web has no paid-hint Worker fallback; campaign/online/ranked screens do not expose the paid action. While tickets are hard OFF, existing free local practice and its Worker hints still work.

## Purchase, recovery and expiry

The server computes and independently validates a legal move before calling the service-only transaction. Account/profile and session locks check the current revision/clock/status again. A unique `(session_id,revision)` receipt and request aliases ensure simultaneous different request IDs and retries consume one ticket and return the first immutable hint. Existing receipts also avoid another search. Invalid, terminal, stale, illegal, canceled-before-dispatch and failed/timed-out searches consume zero.

Session/move/hint state is durable. The client saves IDs in session storage before dispatch, reopens the owned session, reconstructs display history from accepted moves, and exposes a read-only saved-hint recovery button. Disconnect before the purchase transaction prevents dispatch. Once committed, a response loss cannot discard the receipt; reauthentication and the same IDs restore it without another debit, even after a move, clock expiry, close, membership expiry or refund. This is durable retrievability, not a claim that browser pixels were painted. Two server workers also let close/disconnect/ranked guards run during search.

`spend_game_tickets` continues to own free-first and currently-bound eligible live paid-pool policy. A refused purchase still commits any invalid-paid-pool expiry; it creates no hint/spend receipt. Test-mode/expired/off-price/refunded/canceled pools are unavailable. Account deletion blocks access first, then cascades sessions, immutable operations, receipts, aliases and restoration records with the profile.

For an operator-confirmed unrecoverable delivery, service-role-only `restore_cpu_hint_credit(receipt_id,user_id,'unrecoverable_delivery')` writes a separate immutable restoration record, at most once. It respects the existing 20 cap, restores only the original pool, and cannot revive expired/reversed/replaced paid subscriptions. No user HTTP route invokes it. Receipts have no service-role UPDATE/DELETE grant; even recovery leaves the hint unchanged.

## Verification and release boundary

`npm --prefix server run build`; `node scripts/qa/test-cpu-hint-sql.mjs` executes the real compiled service against disposable PGlite PostgreSQL, including concurrent requests and failures before/after commit. `node scripts/qa/test-ticket-migration-chain.mjs` applies all 11 ticket migrations in dependency order against a minimal fixture. HTTP tests use the real service/database and an actual dropped HTTP connection. Web client tests cover persisted retry IDs, a read-only recovery request, campaign/online/ranked exclusion, and replay/display equality. Existing engine, board, OFF-gate and ranked regressions remain in the full Vitest suite. The production search worker is separately exercised from compiled output.

Final local acceptance: all 143 Vitest files / 1085 tests passed, Web typecheck, Web production export (`npm run build -- --webpack`), server build, the 11-migration SQL chain and CPU hint acceptance passed. The CPU hint acceptance includes the default compiled search worker, a real database purchase on a server-seeded valid concrete-identity position and independent move legality. The full-superposition opening was observed both completing and exhausting its 4-second budget; the latter returns `SEARCH_TIMEOUT` with unchanged balance and no receipt. Target-server search capacity/budget needs integration verification. `node scripts/qa/cpu-practice-board-smoke.mjs <local-export-url> <output-directory>` passed at 1440×960 and 360×800: human capture, CPU response, free Worker hint, no horizontal overflow, no page errors and zero paid API requests with the gates OFF.

PGlite executes PostgreSQL, but is one backend with fixture account/billing tables. It does not establish full Supabase migration-chain/advisor parity or multi-process lock/load behavior. Those development-Supabase integration checks, paid ON Web/Android UI/real-device checks, and release activation belong to the integration owner. This file replaces the documented never-released `20261001000000` draft; the owner must check deployed migration history before applying it anywhere. Do not reapply an already recorded migration.

Keep server `CPU_HINT_TICKETS_RELEASE_READY=false` and Web `CPU_HINT_TICKETS_ENABLED=false` until integration acceptance. The 20 paid-ticket cap and current terms version are shared existing policy, not owner decisions made by T2. A new terms rollout must update this account check together with shared wallet SQL. No billing/advertising/play-limit gate is enabled here.

Local disk: only this task's physically copied dependency directories were removed after path/reparse checks; canonical dependencies were retained and shared through junctions. Web verification uses `next build --webpack`. QUBE has one new light conversation draft in `src/data/devDiary.ts`, locally verified and unpublished, with no external social posting.
