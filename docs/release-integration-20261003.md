# Web tickets / billing integration — 2026-10-03

This is a local integration checkpoint, not authorization to sell or deploy.

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

Production Supabase has only the free-wallet migration applied in this workflow (`20261003021514`, source `20260930083253_ticket_wallet_daily_login.sql`). Do not reapply it because its recorded timestamp differs. The remaining billing/admission/hint migration chain is not yet applied by the integration owner. No Android bundle has been rebuilt here.

The owner entered the two live Stripe secrets into Render. Root verified only the saved environment-variable names, never their values. Contrary to the intended Save-only path, Render also performed a Dashboard-triggered deploy at 13:32 JST on 2026-10-03. It reached Live at existing main `1949a6e`, not this billing integration. That deploy does not constitute billing activation. A subsequent read-only `ls-remote` also confirmed `1949a6e` as main.

## Browser sandbox evidence and resource recovery

On 2026-10-03, the owner completed Stripe CLI reauthentication. In the separate sandbox, Root completed the hosted Checkout with Stripe's official test card and fictitious contact information; no live payment was made. The isolated harness used `e77e298` and 14 raw migrations. Its saved evidence confirms:

- Test Checkout paid USD 2.99 and authenticated membership status became active.
- Genuine signed `checkout.session.completed`, `invoice.paid` and `customer.subscription.created` notifications returned HTTP 200.
- The first daily claim credited three ranked and three hint tickets to the test-member pools; an immediate repeat credited zero. Free and live-member pools remained unchanged.
- Signed replay returned HTTP 200 without duplicate grants, while a tampered body returned HTTP 400.
- Ticket consumption is **not yet verified end to end**: the existing consumer correctly rejects the test-member pools because it currently reads live-member pools only. Keep sandbox/live isolation; do not relabel a test subscription as live to make the test pass.

The C drive subsequently reached zero free space and prevented command startup. With explicit owner approval, Root removed only its two obsolete generated caches: `outputs/qg-next-cache-before-relocation-20261003` in the parent workspace, and this checkout's `scratch/webpack-cache-before-integration-20261003` (849,241,664 bytes total). They are reproducible caches; source, release ZIPs/AABs and the latest build were preserved. Free space recovered but fluctuates below 1 GB, so avoid concurrent builds or new dependency/database installations. Recheck capacity before a final export.

## Sale and activation gates still open

All source-level ticket, processing, checkout, portal, member-usage and sales-ready gates remain OFF. Advertising is independently OFF.

- Implement the now-approved sales terms and coordinate Web/server/SQL consent versions while preserving older Android access to support, deletion and existing billing management.
- Saved live-key and webhook-secret variable names were confirmed in Render. Runtime validity/permissions still require verification after the new server is deployed; do not expose the values in chat, source, inspection output, builds or this document.
- Finish a real sandbox Checkout → signed webhook → membership → daily ticket grant → consumption E2E. Direct API-created subscriptions and local SQL races are not that E2E.
- Stripe CLI reauthentication was completed by the owner, and the real sandbox purchase evidence is recorded above. Refresh authentication normally if needed; never extract credentials or switch to live purchases for testing.
- Check Supabase/PostgREST and target Render capacity, including CPU searches. Local PGlite/native PostgreSQL are useful evidence, not production parity or capacity proof.
- Tax registrations and selling-region responsibilities remain unresolved. Automatic tax is OFF; do not claim tax exemption or regulatory compliance.
- Verify the restricted key against the needed endpoint permissions without live charges. After first sale, processing, portal and deletion cancellation must remain enabled when only new checkout is rolled back.

Use `docs/sales-review-20261003.md`, `docs/stripe-t4-implementation-20261003.md`, `docs/t1-ranked-admission-verification-20261003.md` and `docs/cpu-practice-hints-20261003.md` for the scoped contracts. Do not treat a child task's completed status as production readiness.
