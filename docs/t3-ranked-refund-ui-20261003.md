# T3 additional integration: ranked refund balances and recovery UI

Date: 2026-10-03. Branch: `feature/t3-ranked-refund-ui-20261003`.

## Integration scope

This work depends on T1 `90296db` and the previous T3/T5 changes `164ea93` / `142c6bd`. Local merge `7255855` exists only to combine those prerequisites for verification. **Do not cherry-pick the merge into root.** Root should take the two new commits: authenticated read API `29c2e82`, then the UI commit containing this document. T1's admission/recovery implementation and migrations are reused, not reimplemented.

`server/src/index.ts` changes only import and mount the new read router. Existing ranked protocol handlers are untouched. Existing QUBE posts were preserved when the local prerequisite merge conflicted; this additional work adds no diary entry or export.

## Read contract

`GET /tickets/ranked-refunds` takes a Bearer session and no query/body-selected identity. Response:

```json
{"userId":"authenticated-owner","enabled":true,"freeRankedRefunds":43,"paidRankedRefunds":27}
```

The router calls the existing `SupabaseService.rankedRefundBalance(userId)` through an injected reader. T1's service-only `get_ranked_refund_balance` RPC remains the sole paid-credit eligibility policy. The API neither sums capped wallet tickets nor clamps credits to 20. It rejects malformed/non-integer/negative/unsafe counts, authenticates legacy and OAuth sessions, checks deletion, rechecks identity and deletion after the read, sets `Cache-Control: no-store` / `Vary: Authorization`, and bounds polling. Errors do not expose database details.

The route defaults to the existing `rankedAdmissionRecoveryEnabled` gate so it can remain useful during a rollback that stops new admissions but retains recovery. It returns `503 {code:"FEATURE_DISABLED",enabled:false}` before auth/store work while OFF. Actual failures use `REFUND_BALANCE_UNAVAILABLE`; the client never interprets these as a zero balance.

## Wallet and match UI

- New client source gate `RANKED_REFUND_BALANCE_ENABLED = false`. Reads and UI remain OFF. It is independent of sales, daily rewards, and ordinary member-ticket offers.
- The account wallet has a separate section for returned free and returned member tickets. All 12 languages explain that these are spendable ranked credits outside the ordinary 20-ticket cap, and that only eligible paid credits from the last check are displayed.
- The panel refreshes on mount, visible focus/resume, and every 30 seconds while visible. It removes old counts while refreshing, on hidden-page transition, and after errors; request aborts and owner/revision checks prevent cross-account results. This is a balance snapshot, not a guarantee of future admission. The server rechecks eligibility at match admission.
- The same use-only panel is available to an eventual Android release. It contains no price, purchase CTA, portal, or external payment links.
- Online matches handle `match_preparing`: `admitting` means preparing; `voiding`, `owner_recovery`, and `owner_unavailable` mean recovering; `recovery_unavailable` explains temporary failure; unknown future reasons use a generic status without exposing raw text.
- While preparing/recovering, the stale interactive board is replaced with an accessible status and Home action. Move/selection/promotion/castling/resign/intro and local clock advancement are paused. The client requests status for the same match every 5 seconds while connected; it never creates a new match or debits tickets.
- Matching authoritative snapshots resume the board. Cancellation clears the waiting state. A matching saved rating receipt produces the recovered-result screen even without an engine snapshot, removes the local active-match marker, and takes precedence over a late cancellation. Other-room/other-account or older-version messages do not clear recovery; terminal state ignores delayed preparation messages. Listeners and timers are cleaned up on account/room/socket changes and unmount.

## Verification

- New API/client/panel/preparation-hook/online-board tests: 34 passed.
- Final full local Vitest suite: **153 files / 1,157 tests passed** (98.58 seconds).
- Android-target wallet and commerce boundaries: **4 files / 26 tests passed**.
- `npm run typecheck`: passed; `npm --prefix server run build`: passed.
- Web build `npm run build -- --webpack`: passed; Web export commerce check passed.
- Final Android-target Web build and Android export commerce check: passed.
- Disposable PGlite: all **13 ranked SQL scenarios passed**, now including direct refund-balance assertions for active, paused, canceled, refunded, expired, reversal-blocked, restored and spent paid credits. No migration SQL changed.
- `git diff --check`: passed. Prior terms, sales configuration, daily/member/admission/recovery gates, and migrations have no diff from the local integration base.

The initial Web build was blocked by sandbox access to public Google Fonts; the permitted retry succeeded. The initial existing gateway tests needed a mock for the new read router; both gateway suites then passed, followed by the full suite. Dependencies remain junctions to canonical dependencies; no new dependency installation was needed.

## Remaining integration verification

All release gates and the new refund display gate remain OFF. Terms remain `2026-09-25.1`. No publishing, push, production database operation, Stripe operation or new QUBE post was performed.

The local tests do not replace a merged deployment against the actual Supabase/PostgREST function cache, full HTTP/Socket.IO recovery with real authentication, browser visual checks, or Android device testing. PGlite does not establish multi-connection locking guarantees; T1's separate native PostgreSQL evidence remains the source for that property. Root should verify the merged T4 entitlement policy uses the same RPC eligibility contract before enabling release gates. Balance snapshots can change between refresh and admission; only the admission RPC authorizes consumption.
