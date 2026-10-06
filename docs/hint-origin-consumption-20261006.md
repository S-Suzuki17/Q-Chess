# Dormant hint-origin consumption

This preparation extends public commit `8442c610909c0758b4f56f96cb48b9ac2a1c037b`.
It does not publish, run payments, migrate a hosted database, or open sales or
spending. `CPU_HINT_ORIGIN_CONSUMPTION_RELEASE_READY` remains source-hard false.
The existing CPU hint enable switch still selects the unchanged legacy RPC.

## Accounting contract

The new `buy_cpu_hint_v2` RPC delegates to the existing `buy_cpu_hint` inside one
transaction. That preserves account, server session, revision, clock, turn,
hint-validation and idempotency checks, as well as the existing spend order:

1. Free hint stock
2. Eligible legacy paid hint stock, with its existing binding/expiry rules
3. Earned new-subscription hint stock
4. Purchased hint stock

Subscription grants are cumulative stock in the existing pricing-v2 ledger.
This slice does not add an expiry, require an active membership for already
earned stock, transfer stock across subscriptions, or define payment refund or
clawback rules. Purchased stock is spent last. Sandbox balances never authorize
live gameplay and are never touched by this RPC. All four sources remain
separate wallet columns with the existing safe-integer domain, 0 through
9,007,199,254,740,991; the numeric boundary is not a product stock cap.

Existing hint receipts and request aliases remain the recovery authority.
One server session/revision has one immutable paid hint; retries and fresh
request aliases return that same hint without another debit. A new explicit
hint at a later eligible revision costs one unit. The original coarse receipt
`pool` stays compatible (`free`/`paid`); the append-only
`cpu_hint_wallet_origins` allocation records `subscription` or `purchased` for
new-source receipts. Missing allocation means the original free/legacy source.
Receipt and ranked pool constraints are unchanged. Profile deletion cascades
the private allocation through its receipt; no new public read policy is added.

The service computes and validates a legal hint before the debit transaction.
Queue/busy/auth/cancellation checks run again immediately before RPC dispatch.
The new RPC also holds the profile lock and rejects an active ranked admission
before any debit. The legacy RPC continues to recheck session/revision under
its session lock. Search failure, queue rejection and cancellation observed
before dispatch cost zero.

RPC dispatch is the noncancelable purchase boundary. The RPC has its own
transport timeout, not the request's AbortSignal. A cancellation after dispatch
can race a successful SQL commit, even when cancellation precedes SQL execution.
Stopping the HTTP request cannot undo that commit. A database transaction
failure rolls back debit and receipt together; a canceled request, timeout or
lost transport response is not proof that the transaction failed.

The new v2 purchase and operations-only restoration RPCs require READ COMMITTED
transactions. READ UNCOMMITTED, REPEATABLE READ and SERIALIZABLE are rejected
before accounting. Waiting for a profile lock cannot refresh a repeatable-read
snapshot of admission or legacy membership eligibility; the explicit isolation
contract prevents stale authority/eligibility from authorizing a debit or credit.
The existing legacy purchase RPC is unchanged.

A lost response after commit is recovered from the immutable receipt, including
after a move, close or reconnect. It is never automatically refunded. The
operations-only `restore_cpu_hint_credit` remains unavailable through HTTP;
when an operator has established an unrecoverable delivery it restores the
recorded new source once. It never clears purchased stock or credits another
pool. A full numeric domain in free, new-subscription, purchased or an otherwise
eligible and correctly bound legacy source raises `BALANCE_LIMIT` without a
restoration row, so the same repair remains retryable after headroom becomes
available. Ineligible/expired legacy membership and mismatched subscription
binding retain their existing zero-credit behavior; numeric saturation does
not override those eligibility rules.

## Migration and verification inventory

Supabase CLI 2.119.0 generated
`20261006171022_dormant_hint_origin_consumption.sql` through `migration new`
with a command-scoped `SUPABASE_HOME` after help discovery. No applied migration
is edited. The combined public baseline fixture must apply every pending file:

- `20261004040000_monetization_update.sql`
- `20261004050000_hint_tickets_store.sql`
- `20261006000000_pricing_v2.sql`
- `20261006142305_dormant_durable_legacy_sessions.sql`
- `20261006154443_dormant_legacy_session_runtime.sql`
- `20261006155010_atomic_commerce_fulfillment.sql`
- `20261006171022_dormant_hint_origin_consumption.sql`

The explicit pending-file discovery guard remains in place. After combining
another additive slice, extend the inventory to the union and rerun it.

## Local validation

Verified 2026-10-06 UTC on an isolated public-baseline worktree. The initial
checkpoint `e8eba11` passed:

- Client `npm run typecheck` and server `npm --prefix server run build`: passed
- Service/PGlite, existing CPU routes/fallback, membership database and ticket
  gates: 67/67 tests across five files; the new origin suite contributes 11
- Existing atomic-commerce and webhook database suites: 35/35 tests
- Fresh-history blocker guards: 2/2 after explicitly extending the file count
  from 40 to 41 and the expected final migration inventory
- Native PostgreSQL 17.6 origin scenarios: 21/21 (22 Node tests including the
  parent); six real SQL pack grants and Plus10 feed consumption/restoration
- Existing combined native commerce scenarios: 35/35 (36 Node tests)
- Existing combined native session/runtime scenarios: 45/45 (46 Node tests)
- `git diff --check`: passed

The review follow-up corrects the cancellation boundary description and the
inherited free/legacy overflow restoration behavior, and requires READ COMMITTED
for the new purchase and operations restoration RPCs. Final follow-up results:

- Actual-service/PGlite origin and existing membership database tests: 48/48
  across two files (12 origin cases and 36 membership cases)
- Native PostgreSQL 17.6 origin scenarios: 25/25 (26 Node tests including parent)
- Client typecheck and `git diff --check`: passed

The delayed-transport service test cancels the request after purchase dispatch,
executes and commits real SQL afterward, drops the response, and recovers exactly
one receipt with one debit and no restoration. Native SQL proves retryable
numeric overflow for free and eligible bound legacy stock, preserves ineligible,
expired and mismatched-binding zero-credit behavior, and rejects all three
unsupported isolation levels in both RPCs without changing balances/receipts.
An initial test cleanup grouped DELETE with the next BEGIN; separating those
test transactions removed later duplicate-fixture failures. Final runs pass.
Aggregate verification of the combined release belongs to the integration
worktree; the initial aggregate counts above describe the earlier checkpoint.

The native suites each rebuilt a fresh loopback-only database from the public
fixture and applied all seven pending migrations. The origin suite observes
independent-backend lock waits for replay, alias, final-unit, rollback, ranked
row entry and restoration races. The ranked case manually locks the profile
and inserts an active admission row; it does not exercise `admit_ranked_match`
or prove the reverse admission/hint lock order. Those actual-admission races
remain integration checks. The suite also covers numeric bounds, failed allocation
and repair writes, pending deletion/cancellation, profile deletion/recreation,
immutable receipt recovery, role denials and a non-BYPASSRLS SELECT probe.
Its source hashes and scenario inventory are retained in
`docs/hint-origin-postgres-results-20261006.json`. The separate
`verify-hint-origins.yml` workflow runs this proof in a fresh PostgreSQL service;
remote CI has not run for this unpublished branch.

The first native attempt exposed a synthetic fixture omitting the mandatory
legacy subscription binding in its maximum-balance test. The binding was added
without changing product constraints. The fresh-history regression exposed the
expected 40-file count guard; it was extended explicitly, not removed. Final
runs above pass. The existing fresh-install duplicate-settlement and unavailable
PGlite `pg_cron` blockers remain asserted and are not claimed resolved.

Reproduce native origin checks with
`node scripts/qa/hint-origin-postgres-local.mjs /absolute/postgres/bin`, or with
the CI fixture `node --test --test-timeout=180000 scripts/qa/hint-origin-postgres.test.mjs`.
The runner accepts only trusted local PostgreSQL binaries, allocates a new
loopback port/cluster, uses the fixed disposable `commerce_upgrade` database,
and removes only its own cluster. No hosted connection URL is accepted.

No full repository regression suite, browser, hosted-schema equivalence,
PostgREST, real Stripe transaction, production or release-readiness claim is
made. Legacy restoration retains its existing membership eligibility rules;
eligible-source overflow repair remains retryable as described above. The parent
integration owns the consolidated diary entry and union migration verification.
