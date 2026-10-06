# Dormant commerce endpoint integration

This checkpoint extends public PR17 commit
`e915a433f9201d2ffb015c4ce812b91ac2880bf7` (tree
`906cc6bb7716cdcfe2cef2d6352f0f7c18119ded`). It integrates server checkpoint
`730d98cc47c1f2e996d50a761f52befef37ad492`, client checkpoint
`fbacc7127a6127d4bdeb15973a9df359edea4b9c`, actual-index regression coverage and
mandatory CI browser verification. All new commerce runtime and sales source
gates remain closed. No production migration, provider configuration or payment
was performed.

## Resulting behavior

- New SKU Checkout uses its atomic commerce registration contract and a
  server-owned, mode-specific catalog. It cannot fall back to legacy USD 2.99
  registration. Default catalog readiness remains empty
- Signed webhook routing uses trusted intent ownership and canonical provider
  evidence. Retired subscription replays check their durable fence before
  provider or erased-intent reads; live fulfillment retains its reconciliation
  lease, and legacy fallback releases before the legacy handler reacquires
- New intents record immutable, server-selected original consent. Paid delivery
  and replay can reconcile that contract after a policy change; new Checkout
  still requires current terms. Ambiguous historical evidence produces an
  explicit review/retry error without consuming receipts or granting stock
- Legacy membership fields remain separate from Standard/Plus state and
  purchased/earned hint balances. Sandbox stock is labeled and cannot confer
  live benefits. New-plan displays do not reuse legacy USD 2.99 or legacy stock
  expiry language. Android displays consumption-only status
- Validated hint delivery/recovery emits an account-scoped event to refresh
  wallet reads. It does not grant, decrement or merge balances on the client.
  Host/device clocks do not override database-confirmed membership activity
- The independent hard-false runtime gate is lazy: actual `index.ts` HTTP tests
  enable legacy billing while making new-commerce factories unavailable, and
  prove legacy status and signed webhook processing do not touch pending schema

## Combined local verification

The original integrated application source is
`16617f0652617fd359e8cacd196835e841a91a1d`. Subsequent changes are evidence
documents, the browser-test assertion correction and the dormant entitlement-read
gate described below.

- Full default Vitest: **198 files / 2,183 tests passed**, zero skipped/todo,
  plus the repository completeness guard. Tests ran serially with their
  existing timeouts and assertions
- Client typecheck, server build and frontend production build passed. The
  frontend build is a verification build, not a configured deployment artifact
- Native PostgreSQL **17.6** with pgcrypto: **162 scenarios passed** across
  commerce 43, auth/runtime 45, hint origins 30, shared admission 27 and Crown 17
- Each native suite executed the same **22 public historical dependencies plus
  all ten pending raw migrations**. All 44 repository migration hashes are
  recorded; 132 available report source digests were checked against this tree
- The focused PGlite fixture now explicitly requires its 17 historical and six
  commerce release files. The first aggregate passed 2,151 tests and failed one
  stale 22-file assertion; its correct fixture inventory is 23. The assertion
  was corrected and the complete aggregate rerun passed. No migration was
  omitted or rewritten to obtain a pass
- Independent review reproduced and closed the retirement dispatch regression;
  it also checked mode/owner separation, consent/backfill, lazy composition,
  replay/lease ordering and the complete migration inventory
- The actual-panel browser fixture compiles. It covers six contract/stock
  cases in English/Japanese, desktop/mobile widths, Web/simulated Android,
  repeated billing clicks and account replacement. Browser interaction/layout
  was not run locally because of the established Chromium host restriction

The [source/evidence manifest](commerce-endpoint-verification-20261006.json)
records source hashes and exact counts. Mounted payment-flow tests use PGlite
with synthetic provider responses; separate native suites prove real SQL
transactions and independent-backend contention. Neither is hosted PostgREST or
genuine Stripe evidence.

The first PR18 CI head, `8b7113b0102a4c4bfa1a6f47915d125fedeae7fb`, passed the
2,183-test guard, typecheck, both builds, all five native PostgreSQL 17.11 suites
and the four prior browser fixtures. Its new status fixture failed because an
overbroad Android assertion rejected the existing Japanese legacy disclosure
word `決済取消` (payment reversal). The application disclosure is preserved.
The fixture now rejects purchase prompts, prices, provider references, links,
purchase controls and catalog/review surfaces, while permitting that existing
consumption-only rule. Fixture syntax/compilation passed; exact-head browser CI
must verify the correction before this checkpoint is called green.

The corrected CI head `61b565f31cf556d84de52ed82ebc8734d86b6cc7` passed all three
workflows/six jobs, including all 48 status-browser cases. A later rollout audit
found that the socket entitlement refresh still queried a pending RPC even with
shared admission disabled. That missing-schema error was caught, but a code-only
release should not make the new query at all. The follow-up adds an independent
hard-false `SHARED_MATCH_ENTITLEMENT_RELEASE_READY` gate. Both environment values
return unknown entitlement without touching pending schema; existing identity
and account checks remain. Future paid no-ad status can be released independently
of free-match quota/ad enforcement.

This follow-up passed 77 affected tests across nine files, root typecheck and
server build. Actual `index.ts`/Socket.IO tests prove zero new entitlement calls
for initial and repeated refreshes with the environment switch both on and off.
Separate released-path transport coverage retains Standard no-ad/unlimited
status while shared admissions stay disabled. Legacy admission, original hint
RPC selection, billing portal/cancellation and closed-commerce index regressions
also pass. SQL and activation values are unchanged. The new exact-head CI must
pass before calling the updated candidate green.

## Required release follow-through

Exact-head GitHub Actions must pass all three workflows: aggregate/typecheck,
both builds, actual restoration/choice/Crown/commerce/status browser fixtures,
and all five native suites. This local report does not claim that remote result.

Current terms still describe the prior rules and identify new products as being
prepared. Capturing their version is not approval to sell the new products under
them. Coordinated terms/version, provider test/live bindings, risk/deletion and
genuine purchase-to-consumption review remain required. New runtime activation
is independent of sales readiness, so future sales pauses must preserve paid
reconciliation and cancellation.

The known duplicate historical settlement still blocks an all-files fresh
install; incremental public-source verification does not establish exact hosted
schema/ACL parity. Existing Crown mapping/provider and long-game authentication
decisions remain held. Physical Android/Play validation is separate. No held
QUBE/CPU benchmark payload or new diary/social post is included here.
