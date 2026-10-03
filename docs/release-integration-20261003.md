# Web tickets / billing integration — 2026-10-03

This is a local integration checkpoint, not authorization to sell or deploy.

## Integrated sources

- T0 baseline: `9102ad4`.
- T3/T5 wallet, member UI and owner-approved commerce disclosure: `303bb3b`, `ea0a2ed`.
- T1 ranked admission, recovery and refunds: `bae9198` (source `90296db`).
- T2 durable CPU practice / hint fulfillment: `b7cd7bf` (source `caf3fb5`).
- T4 canonical Stripe reconciliation: `5b8d4c3` (source `db7a391`).
- Integration preserves both ranked/CPU routes and test patterns, the dynamic CPU feature gate and all distinct QUBE posts. No unrelated worktree changes were discarded.
- T3's additional refund-credit display and match-preparation/recovery UI are still being verified in its separate task; take only its new commit after the T1 base.

## Integration fixes and evidence

The first merged suite found five failures in the T1 gateway fixture because the new CPU router was not mocked. Add that router to the explicitly isolated gateway dependencies; the real router remains covered by its own HTTP tests.

The Stripe SQL fixture failed because T1's new ranked-void migration expects the existing ranked-settlement function and history/profile schema. Reuse one Stripe fixture with that real historical migration and schema, instead of omitting the dependency or weakening production SQL. Its chain now has 13 raw migrations.

After these fixes:

- All 151 Vitest files / 1,148 tests passed; typecheck and server build passed.
- CPU hint SQL / actual service / search-worker tests passed, including request retries, disconnects, free/paid entitlement changes and ownership.
- Ranked SQL's 13 scenarios and the ranked migration-chain check passed.
- Stripe canonical SQL passed. Native PostgreSQL with independent processes passed lease contention, expired-owner fencing, crashes before/after commit and 12 refund/late-payment races. Test processes and database were stopped.
- The production-configured Web export passed with explicit Webpack. An initial cached build failed inside `WasmHash`; the root worktree's generated cache was moved aside, not source-deleted. The fresh build needed permitted Google Fonts reads and then succeeded. This does not prove every Node/bundler configuration works.
- Known Vite CommonJS configuration and Node local-storage warnings remain visible; they were not suppressed.

## Actual deployment boundary

The previously published Cloudflare Web export was built at `ea0a2ed`: it contains the OFF wallet/UI and commerce disclosure, not the subsequent T1/T2/T4 integration. Its deployment and public assets were checked separately.

Production Supabase has only the free-wallet migration applied in this workflow (`20261003021514`, source `20260930083253_ticket_wallet_daily_login.sql`). Do not reapply it because its recorded timestamp differs. The remaining billing/admission/hint migration chain is not yet applied by the integration owner. No Render update or restart has occurred in this checkpoint. No Android bundle has been rebuilt here.

## Sale and activation gates still open

All source-level ticket, processing, checkout, portal, member-usage and sales-ready gates remain OFF. Advertising is independently OFF.

- Confirm the paid-ticket holding cap; the SQL default of 20 is not owner approval.
- Approve/finalize sales terms and coordinate Web/server/SQL consent versions while preserving older Android access to support, deletion and existing billing management.
- Owner must enter the restricted live key and webhook signing secret directly into server-only Render settings. Do not put keys in chat, source, browser inspection, build output or this document.
- Finish a real sandbox Checkout → signed webhook → membership → daily ticket grant → consumption E2E. Direct API-created subscriptions and local SQL races are not that E2E.
- Check Supabase/PostgREST and target Render capacity, including CPU searches. Local PGlite/native PostgreSQL are useful evidence, not production parity or capacity proof.
- Tax registrations and selling-region responsibilities remain unresolved. Automatic tax is OFF; do not claim tax exemption or regulatory compliance.
- Verify the restricted key against the needed endpoint permissions without live charges. After first sale, processing, portal and deletion cancellation must remain enabled when only new checkout is rolled back.

Use `docs/sales-review-20261003.md`, `docs/stripe-t4-implementation-20261003.md`, `docs/t1-ranked-admission-verification-20261003.md` and `docs/cpu-practice-hints-20261003.md` for the scoped contracts. Do not treat a child task's completed status as production readiness.
