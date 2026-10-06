# Crown first-attempt preparation

This change is dormant. It does not deploy SQL, publish a build, enable a provider, or add a new public game limit.

The selected rank mapping is null on both the server and client, and verified-provider readiness is false. Neither environment variables nor client request fields can select a mapping. The route returns FEATURE_DISABLED before authentication or database access while either release gate is closed. Campaign retains its existing membership/interstitial behavior while the gate is closed.

## Unresolved rank policy

The existing campaign has 100 stable stage IDs, with CPU strengths 1–34 repeated across three time controls. The approved per-rank requirement does not specify whether the authorization belongs to one stage or to a CPU-strength group. Both candidate mappings have isolated tests, but neither is selected:

- stage_v1: crown:stage:v1:<stage ID>, 100 possible keys
- strength_v1: crown:strength:v1:<strength>, 34 possible keys

Before activation, obtain the rank mapping decision, verify a real provider proof flow with its account/target binding and replay tests, then review coordinated server/client activation. Existing 100-stage descriptions are not evidence of a selected ad frequency. This preparation cannot validate a real provider signature or claim an ad completed.

## Durable contract

authorize_crown_first_attempt uses the actual shared verified_rewarded_ad_grants ledger and canonical get_shared_match_entitlement function. Only the trusted service role can call it. A free account requires one unconsumed, independently verified grant with purpose crown_first_attempt and the exact account/stable key. The function locks the account and grant, inserts one authorization, and consumes one grant in the same transaction. Duplicate/concurrent requests retrieve that same authorization. No daily allowance, extra-three credit, client adViewed boolean, local progress flag, or timestamp-based attempt key grants access.

Earned grants have no activated expiry. Cancelled UI work cannot activate a board, but a legitimately committed authorization remains retrievable by a later authenticated request. Unused grants remain unconsumed. Paid first attempts create the same reusable authorization so that retries remain free after the subscription expires. Standard/Plus use canonical plan/noAds; legacy299 retains only Campaign's existing local exemption and is not assigned global unlimited/ad-free rights.

Profile erasure cascades Crown authorizations. The shared grant ledger drops the account binding while retaining the provider transaction replay fence. Recreating an account with the same name cannot recover an erased authorization or replay an old provider transaction. Restrictions and pending deletion block both first attempts and retries.

Canonical current ticket terms are required before a **new** monetized Crown authorization or ad-credit consumption. Retrieving an already-established no-charge retry does not add a new ticket-terms requirement: existing identity, restriction, deletion and general TermsGate checks continue to apply. An old authorization cannot unlock a different rank or consume another credit. Expired/refund-blocked membership cannot establish new subscription-exempt ranks. No terms version or default-off legacy Campaign behavior changes here; activation still requires the coordinated terms review.

The RPC rejects read-uncommitted, repeatable-read and serializable transactions before reading authorization state or waiting for the account lock. READ COMMITTED is mandatory so an older transaction snapshot cannot authorize from stale entitlement, restriction or verified-ad data after another transaction changes them.

## Server/UI integration

Mount createCrownAdmissionRouter(auth, createCrownAdmissionStore(client), verifyUser, accountGate). The only accepted request body is {stageId}; the server derives the stable key from its selected mapping. Existing legacy/Supabase authority is rechecked before and after the store call. AccountWriteGate covers each operation, and the SQL account lock covers other processes/erasure. No provider route is added.

Campaign captures the login revision before its first asynchronous operation. Repeated clicks share one pending entry; account changes, cancellation, Back, browser navigation, stage/side changes, previews, and unmount invalidate its continuation. A retry uses the durable endpoint instead of browser-stored credit. Existing campaign rewards, progress and game ownership remain unchanged.

## Verification

Verified in the isolated cloud worktree on 2026-10-06 UTC:

- 57 focused tests in 7 files passed, including existing Campaign access/cosmetics/result regressions
- 17 native PostgreSQL 17.6 scenarios passed against shared foundation c6be9be (the test runner also counts the parent suite, reporting 18/18)
- Frontend typecheck, server npm build, targeted ESLint and diff checks passed
- The small real-Campaign browser fixture compiled successfully

Browser interactions and screenshots were **not run successfully**. Installed cloud Chromium failed before opening a page because its required local Unix socket was denied by the execution environment. A supported scoped execution retry encountered the same restriction. No security setting was changed. No full frontend build, full aggregate test, real device, hosted Supabase advisor, live provider, payment, or production/publication verification is claimed by this worktree. Final integrated checks must include the other workers' pending migrations and runtime hooks. See crown-first-attempt-results-20261006.json for source hashes and native case names.

Reproduction commands:

- Focused controller, receipt, route, access and cosmetics tests: node node_modules/vitest/vitest.mjs run --config vitest.crown.config.ts --maxWorkers=1
- Actual PostgreSQL fixture: node scripts/qa/crown-postgres-local.mjs /absolute/trusted/postgres/bin (set its required native library directory via command-scoped LD_LIBRARY_PATH)
- Small Campaign browser fixture: node scripts/qa/crown-browser.mjs (optional QG_TEST_CHROMIUM selects an already installed trusted browser)

The native runner creates a fresh unique temporary cluster, disables Unix sockets, selects a loopback TCP port, and deletes the cluster after the run. It accepts no database URL, hosted credentials or existing PGDATA. It applies the public historical fixture, all six original pending migrations, the actual shared-admission migration, and the Crown migration without SQL rewriting. Coverage includes ACL/RLS, exact purpose/account/key binding, provider replay, no grant expiry, real independent-backend contention/rollback, paid and legacy retries, restrictions, erasure and recreation. This is an incremental public-source fixture, not a claim of complete hosted schema equivalence or provider validation.

The strengthened native proof also checks all three rejected isolation levels against a pre-existing eligible snapshot followed by a separately held profile lock/restriction change, a newly committed verified grant, and subscription expiry. Every rejected call leaves the target rank without a new authorization and the earned grant unconsumed. Current-ticket-terms cases prove denial on a new rank without debit, successful no-charge retrieval of an old authorization, and no additional rights from that old receipt.

The browser fixture uses real Campaign/entry/client code with controlled transport replies and stubs unrelated visuals/progress. It does not substitute a second mock reward ledger for the native SQL tests. Its screenshots and results are written under /tmp/qg-crown-browser-results. No external provider or account is contacted.

For an environment without browser-launch support, node scripts/qa/crown-browser.mjs --build-only compiles the fixture and explicitly makes no interaction claim. The final integration owns the consolidated development-diary entry/export and default Crown test discovery; this isolated branch does not duplicate that shared-file update.
