# Ranked limits and candidate propagation — 2026-10-04

Status: implementation and local verification complete; Web and Render publication pending.

## Changes
- Preserve `INSUFFICIENT_FUNDS` from both queue errors and match cancellation. Show a localized ranked-limit explanation, daily UTC reset, ticket-balance location, and Home action instead of generic cancellation/retry.
- Remove King from a captured superposition when another live King candidate remains, matching practice. Preserve terminal capture of the last possible King. Reject moves that discard the mover's own last King candidate.
- Propagate quotas across all original pieces, including captured identities. Two captured Knights may legitimately leave no live Knights; this is different from losing the two original Knight identities.
- Publish `capture-king-v2` in server health for rollout verification. Retain compatibility assertions for historical replays without snapshot deltas.
- Add one non-development QUBE conversation entry and synchronize its manual-post draft.

## Evidence
- Regression tests initially reproduced retained captured King candidates and self-discard of the last King.
- `npm run test -- --reporter=dot`: 165 files, 1,295 tests passed.
- `npm run typecheck`: passed.
- `npm run test:board`: 33 tests passed.
- `npm run build --prefix server`: passed.
- Allowlisted Web release build: passed.
- `node scripts/qa/check-commerce-export.mjs web --sales=on`: passed. Existing membership/ticket flags retained; ad SDK absent.
- `node scripts/release/prepare-pages.mjs`: passed; 209 files, 141,743,524 bytes.
- Browser: actual notice component in an isolated local fixture, desktop 1280×720 and mobile 390×844; Home action and candidate icon rerender checked. The fixture does not connect to production or establish an end-to-end live match test.
- Actual `GameEngine` snapshots for both players, replay delta, and `chooseCpuMove` reply are covered by regression tests.

No production test accounts, purchases, balance changes, or Android build were performed. Live rollout must be verified separately.
