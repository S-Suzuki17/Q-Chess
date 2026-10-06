# Commerce safety checkpoint — 2026-10-06

This branch is a safety checkpoint, not the completed Standard/Plus/hint-pack launch. Do not enable purchases, apply production migrations or merge to an auto-deployed branch solely because unit CI passes.

## Implemented

- Display catalog: Standard USD 3/month total including tax; Plus USD 6/month total including tax with 10 hints per paid monthly period; one-time hint packs 1/$1, 13/$10, 27/$20, 44/$30, 77/$50, 166/$100.
- Requests identify only a named SKU. Stripe Price IDs, amounts, mode, currency and fulfillment quantities are server-owned.
- New SKU availability is empty in source. Legacy environment sales flags cannot open these products. The frontend independently keeps new checkout readiness closed.
- Existing legacy USD 2.99 contracts remain valid. Canonical Price/session/line/invoice/InvoicePayment/PaymentIntent/captured-Charge checks bind exact amounts and identity. Existing sessions are not canceled or repriced by this release.
- Existing billing management remains available independently of new sales. Play/Android purchase and external-payment surfaces remain blocked.
- Product selection clears purchase consent. Account revision/unmount aborts stale responses. The three skipped commerce tests are executable again.
- The three previously unreleased migration files are repaired. Historical migration files are untouched.
- Balance storage is widened to bigint with a nonnegative, JavaScript-safe integer bound. Free, legacy-member, purchased, and new subscription hints remain separate; the legacy daily 3+3 grant still respects its existing 60-ticket policy.
- The database advertises rewardPolicyVersion=2 for the new seven-day free-reward cycle. Clients preserve old previews when that version is absent. New cycle: ranked [1,1,2,2,3,3,3], hints [0,0,0,0,0,0,1], day eight returns to one, missed UTC days reset.
- New one-time fulfillment and paid-period ledgers have transactional replay fences, account ownership checks, retirement guards and arithmetic rollback. New price bindings are empty. These dormant RPCs are not connected to public purchase or consumption paths.
- Existing ranked admission and receipt-pool constraints are preserved. No unverified ad completion or new ad-dependent hard gate is introduced.

## Verification scope and limits

The default test suite includes real PGlite SQL execution. It executes 17 relevant raw historical dependency migrations and all three repaired release migrations against a minimal pre-migration account/role fixture. It verifies replay, different-event/same-period deduplication, all hint-pack quantities, retirement, test/live separation, integer limits, upgrade balance preservation, free-hint restoration and legacy refund behavior. HTTP Stripe tests use mocks and are not proof of real payment fulfillment.

Fresh installation is explicitly **not ready**. Executing the sorted list of all 37 files fails at the second file because 20260918062045_ranked_server_settlement.sql and 20260918072145_ranked_server_settlement.sql create the same table. The latter documents the former as an old local draft. No applied history was rewritten to hide this. A separate test also proves pg_cron is unavailable in PGlite; it does not replace the scheduler with a mock.

The fixture omits unrelated historical features and serializes statements. It does not prove complete production-schema equivalence, native PostgreSQL extension compatibility, cross-process locking/races or a full empty-database install. Those are deployment blockers, not skipped successes.

CI requires every discovered test to pass with zero skipped/todo tests, client typecheck, server build and frontend static build. A desktop/mobile Chromium check verifies the closed commerce page and no overflow/runtime error. Local browser execution is sandbox-blocked, so local static markup tests alone are not called browser verification. CI builds without production settings are verification artifacts and must never be published.

## Production rollout hold

1. Review the exact PR head and required CI. Main may auto-deploy the server; Cloudflare frontend Direct Upload is a separate operation.
2. Verify the current production schema and migration history against an isolated native PostgreSQL upgrade rehearsal, including extensions, roles, account deletion/recovery, RLS and concurrent transactions. Resolve/document the old duplicate migration for a separate fresh-install path.
3. Review free-reward/current terms and effective consent version before changing the live reward policy. Legacy contract corrections must not silently migrate existing subscribers or force unrelated new purchase terms.
4. Deploy compatible server and frontend with all new SKU and ad-dependent gates closed. Verify existing legacy session fulfillment, status and billing management.
5. Apply reviewed additive migrations only after schema/upgrade proof and a recovery plan. Never downcast balances to SMALLINT or restore an old snapshot over newer purchase ledgers as an automatic rollback; use a reviewed forward repair.
6. Complete new-SKU canonical webhook fulfillment, subscription entitlement/status, hint consumption/recovery, refund/dispute and verified account-deletion handling. Bind verified test/live prices separately.
7. Prove genuine Stripe sandbox purchase → signed webhook → durable ledger → entitlement/consumption → duplicate/reordered event → refund/deletion behavior. UI return URLs and mocked HTTP do not prove payment.
8. Coordinate reviewed new product disclosures, production configuration and authenticated deployment access. Enable each purchase SKU only after its full flow passes.

## Remaining feature acceptance

- Shared online/ranked three-started-match UTC quota, explicit ticket/ad choice, no queue/cancel charge, atomic PvP participants and reconnect dedupe
- Unlimited paid play and zero ads for Standard/Plus; stable-rank Crown first-attempt unlock/retry persistence
- Independent verified rewarded-ad completion and actual provider approval; leave new gates off until available
- Paid monthly Plus grants exposed through verified live fulfillment, separate-origin stock consumption and recoverable QUBE receipts
- Persistent/revocable web/mobile authentication, actual browser/domain/CSRF and Socket verification
- QUBE image/animation verification and measured engine strength improvements

These remaining items are not claimed complete by this PR.
