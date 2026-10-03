# Web tickets / billing integration — 2026-10-03

This is the release owner's evidence checkpoint. Production application rollout
is still pending; database preparation is applied. Do not infer sale availability
from committed source flags or the owner's GitHub authentication.

## Integrated sources

- T0 baseline: `9102ad4`.
- T3/T5 wallet, member UI and owner-approved commerce disclosure: `303bb3b`, `ea0a2ed`.
- T1 ranked admission, recovery and refunds: `bae9198` (source `90296db`).
- T2 durable CPU practice / hint fulfillment: `b7cd7bf` (source `caf3fb5`).
- T4 canonical Stripe reconciliation: `5b8d4c3` (source `db7a391`).
- Integration preserves both ranked/CPU routes and test patterns, the dynamic CPU feature gate and all distinct QUBE posts. No unrelated worktree changes were discarded.
- T3's additional refund-credit API/UI are integrated as `4d497df` and `3a80989` (sources `29c2e82` / `35d78d9`).
- The owner confirmed member-ticket caps of 60 each, separate from free caps of 20, and approved `docs/sales-owner-review-20261003.md` for publication on the actual release date.

## Integration fixes and evidence

The first merged suite found five failures in the T1 gateway fixture because the new CPU router was not mocked. Add that router to the explicitly isolated gateway dependencies; the real router remains covered by its own HTTP tests.

The Stripe SQL fixture failed because T1's new ranked-void migration expects the existing ranked-settlement function and history/profile schema. Reuse one Stripe fixture with that real historical migration and schema, instead of omitting the dependency or weakening production SQL. Its chain now has 13 raw migrations.

After these fixes:

- After refund UI and the approved member cap update, all 156 Vitest files / 1,184 tests passed; typecheck and server build passed.
- CPU hint SQL / actual service / search-worker tests passed, including request retries, disconnects, free/paid entitlement changes and ownership.
- Ranked SQL's 13 scenarios and the ranked migration-chain check passed.
- Stripe canonical SQL passed with 14 raw migrations. The new cap suite passed both test/live-mode SQL: 60-cap, partial/full grants, same-day replay, unchanged free cap 20, invalid values and role denial. Native PostgreSQL with independent processes again passed lease contention, expired-owner fencing, crashes before/after commit and 12 refund/late-payment races. Test processes and database were stopped.
- The production-configured Web export passed with explicit Webpack. An initial cached build failed inside `WasmHash`; the root worktree's generated cache was moved aside, not source-deleted. The fresh build needed permitted Google Fonts reads and then succeeded. This does not prove every Node/bundler configuration works.
- Known Vite CommonJS configuration and Node local-storage warnings remain visible; they were not suppressed.

## Actual deployment boundary

The previously published Cloudflare Web export was built at `ea0a2ed`: it contains the OFF wallet/UI and commerce disclosure, not the subsequent T1/T2/T4 integration. Its deployment and public assets were checked separately.

Production Supabase now has the complete billing/ticket/terms chain applied.
Its MCP-assigned history timestamps differ from the source filenames; match the
names below and do not reapply them:

| Production history | Name |
|---|---|
| 20261003021514 | ticket_wallet_daily_login |
| 20261003064752 | stripe_membership_entitlements |
| 20261003064802 | stripe_billing_portal_customer_lookup |
| 20261003064813 | stripe_membership_reversal |
| 20261003064825 | stripe_live_membership_allowlist |
| 20261003064835 | atomic_ticket_spending |
| 20261003064846 | stripe_scheduled_cancellation_projection |
| 20261003065419 | stripe_test_member_ticket_binding |
| 20261003065935 | cpu_hint_receipts |
| 20261003072204 | ranked_match_admissions |
| 20261003072218 | ranked_match_void |
| 20261003072300 | stripe_canonical_reconciliation |
| 20261003072312 | member_ticket_cap_60 |
| 20261003072323 | approved_current_terms_consent |

The test-member migration is non-destructive (`9d7b974`): nonzero unbound
balances abort instead of being cleared. The hint migration (`70c4af1`) aborts
if an unknown legacy hint RPC exists instead of dropping it. Both guards were
tested before application. Production wallets, memberships and new ranked
admissions were all zero on the post-application read-only check; no test
accounts or user game records were created. Existing ratings were not reset.

The new ten-argument settlement RPC has a default null owner argument and
retains the old nine-named-argument REST contract; actual PostgREST, PvP, CPU
and replay compatibility passed in T1's isolated fixture. Production catalog
confirms only this signature, one default argument, service-role execution and
no anon/authenticated execution. Its migration requests a PostgREST schema
reload; a real production match is not claimed as tested.

The terms policy and Web candidate both use `2026-10-03.1`, effective
`2026-10-03` (the planned JST publication day). If publication slips to another
day, coordinate the actual effective date through a new migration and rebuild;
do not edit already-applied migration history. Old general terms remain
`2026-09-25.1`; new purchase/claim consent is separate. No Android bundle was
rebuilt here.

Post-migration security advisors: new service-only tables intentionally have
RLS with no client policies (INFO). Existing WARNs remain for legacy login,
registration and email-change SECURITY DEFINER RPCs and disabled leaked-password
protection; this is not a claim of zero security advisories. Old Android
compatibility is not revoked as part of this launch.

The owner entered the two live Stripe secrets into Render. Root verified only the saved environment-variable names, never their values. Contrary to the intended Save-only path, Render also performed a Dashboard-triggered deploy at 13:32 JST on 2026-10-03. It reached Live at existing main `1949a6e`, not this billing integration. That deploy does not constitute billing activation. A subsequent read-only `ls-remote` also confirmed `1949a6e` as main.

## Browser sandbox evidence and resource recovery

On 2026-10-03, the owner completed Stripe CLI reauthentication. In the separate sandbox, Root completed the hosted Checkout with Stripe's official test card and fictitious contact information; no live payment was made. The isolated harness used `e77e298` and 14 raw migrations. Its saved evidence confirms:

- Test Checkout paid USD 2.99 and authenticated membership status became active.
- Genuine signed `checkout.session.completed`, `invoice.paid` and `customer.subscription.created` notifications returned HTTP 200.
- The first daily claim credited three ranked and three hint tickets to the test-member pools; an immediate repeat credited zero. Free and live-member pools remained unchanged.
- Signed replay returned HTTP 200 without duplicate grants, while a tampered body returned HTTP 400.
- The production consumer correctly refused test pools. A subsequent isolated
  QA-only explicit-test RPC path exercised the actual RankedAdmissionStore and
  CpuPracticeService/search worker, consuming one test ranked ticket and one
  test hint ticket. Parallel/retried requests did not double debit; final test
  balance was 2+2. Production function hashes were unchanged, and free/live
  pools stayed zero. No test subscription was relabeled as live.
- The disposable sandbox subscription was canceled and its price/product
  archived at 15:48 JST; local server, listener and PostgreSQL were stopped.
  See `docs/stripe-sandbox-consumption-verification-20261003.md` for boundaries.

The C drive previously reached zero free space. With explicit owner approval,
Root removed only two obsolete generated caches (849,241,664 bytes total),
preserving source, release ZIPs/AABs and the latest build. A subsequent 16:17 JST
read showed approximately 14.7 GiB free. Recheck before large builds; do not
infer that old source or releases may be deleted.

## Sale and activation gates still open

Source readiness gates are now verified candidates, but runtime switches still
default OFF. The all-ON Web candidate requires a fresh static build; the live
Cloudflare site and Render process have not been updated to this integration.
Advertising is independently OFF and must remain OFF.

- Approved consent routes, full terms, SQL and Web version/date are integrated.
- Saved live-key and webhook-secret variable names were confirmed in Render. Runtime validity/permissions still require verification after the new server is deployed; do not expose the values in chat, source, inspection output, builds or this document.
- Real sandbox Checkout → signed webhook → membership → grant → consumption
  passed with the isolated test/live boundary described above.
- Stripe CLI reauthentication was completed by the owner, and the real sandbox purchase evidence is recorded above. Refresh authentication normally if needed; never extract credentials or switch to live purchases for testing.
- Check Supabase/PostgREST and target Render capacity, including CPU searches. Local PGlite/native PostgreSQL are useful evidence, not production parity or capacity proof.
- Tax registrations and selling-region responsibilities remain unresolved. Automatic tax is OFF; do not claim tax exemption or regulatory compliance.
- Verify the restricted key against the needed endpoint permissions without live charges. After first sale, processing, portal and deletion cancellation must remain enabled when only new checkout is rolled back.

## Final integrated candidate

- T1 ten-second CPU fallback and real HTTP/Socket.IO/PostgREST report:
  `ed615e9`, `146c7ee` (sources `962a897`, `d3310cd`). Ten real scenario groups
  passed; observed fallback was 10,041 ms without accelerated clocks.
- T4 startup price/Portal GET validation: `086efc3` (source `5a3d45e`). New
  Checkout requires its independent exact-true environment flag and verified
  price/Portal. Failure does not disable webhooks, status, grants or deletion.
- Whole Vitest suite: **163 files / 1,271 tests passed** after updating the
  prerelease-hard-OFF fixtures and isolated gateway dependencies. No test
  timeout or network guard was loosened. Typecheck and server build passed.
- Final all-eight-public-flags-ON Webpack export passed all 14 routes; commerce
  `--sales=on` and public review guards passed. Prepared (not uploaded) artifact:
  `build/cloudflare-pages-2026-10-03T07-36-52-424Z`, 209 files / 141,711,708 bytes.
  Secret/size guards, both publisher files and all 15 reward-audio copies passed.
- Raw new-terms SQL passed in both test/live fixture modes. Fourteen release
  script tests passed; default-Webpack regression passed separately.
- PR: `https://github.com/S-Suzuki17/Q-Chess/pull/6`, root release branch.
  The owner completed normal GitHub CLI authentication. Exact-head landing
  confirmation remains required by the PR completion workflow.
- The old Vercel preview failed on Turbopack treating shared server TypeScript
  as CommonJS. Standard `npm run build` and the release helper now default to
  the already-verified Webpack path. No check was disabled or bypassed. The
  current site stays on Cloudflare; GitHub push alone is not its deployment.

## Production rollout contract (not an execution record)

1. Land the verified exact-head PR through the normal approved GitHub path.
2. Configure Render billing environment `production`, mode `live`, live
   processing and Portal enabled, success/cancel URL `https://q-gambit.com/`.
   Keep new Checkout OFF on the first configured restart. Retain existing
   owner-entered secrets without reading or printing them.
3. Require startup `checkout_preflight=verified` and no migration/startup
   failures. This check makes GET requests only, not purchases. Runtime
   ticket flags may be enabled after matching Web export is ready.
4. Upload the matched Web artifact to Cloudflare Pages `q-gambit-web`, verify
   public output and new terms. Enable new Checkout only after the remaining
   release checks. Do not create production QA accounts or charge a card.
5. The owner performs the actual paid purchase. Verify that purchase's signed
   webhook, correct account entitlement and grant without making another charge.

If pausing new sales, turn only `STRIPE_MEMBERSHIP_CHECKOUT_ENABLED=false` and
the matching public Checkout flag OFF. Preserve processing, Portal, keys,
deletion cancellation, paid-ticket use and ranked admission recovery.

Use `docs/sales-review-20261003.md`, `docs/stripe-t4-implementation-20261003.md`, `docs/t1-ranked-admission-verification-20261003.md` and `docs/cpu-practice-hints-20261003.md` for the scoped contracts. Do not treat a child task's completed status as production readiness.
