# Dormant commerce HTTP integration

This checkpoint connects the prepared new-SKU contracts without activating
sales or production reconciliation. It preserves the legacy USD 2.99 path.

## Runtime and release gates

`StripeBillingRuntime.ts` is the composition used by `index.ts`.
`COMMERCE_RUNTIME_RELEASE_VERIFIED` is hard-false and separate from purchase
readiness. While it is false, no commerce store/status adapter is constructed;
legacy webhook/status/portal traffic does not query pending commerce tables.
The composition's explicit override exists for isolated fixture tests. No
production caller supplies it, and environment flags cannot override it.

`readyCommerceSkus()` remains empty, and frontend
`NEW_SKU_RELEASE_VERIFIED` remains false. No provider Price, database binding,
provider account setting, production environment or deployment is changed.
Future receipt processing must remain available when new sales are paused;
the independent runtime gate is not a purchase toggle.

## Checkout and paid delivery

An authenticated request supplies only one SKU. The route retains account
checks, session rechecks, the current ticket-consent requirement and atomic
registration before returning a Stripe URL. Monthly products retain the
existing unresolved-subscription/pending-checkout preflight. One-time packs
use their own registration and do not pretend to be another subscription.
Registration failure expires the unrevealed session when possible and returns
an error, never a payable URL.

The public route calls `register_stripe_commerce_checkout_intent`, including
server-owned identity, SKU, exact price, USD cents and mode. It never falls back
to legacy registration. The database verifies the reviewed mode-specific price
binding and serializes ownership. No client amount, quantity, grant, Price ID,
identity or consent snapshot is accepted.

`StripeMembershipApi` accepts an optional immutable server-only checkout
catalog for fixture/approved integration use. It can vary the Price ID for the
selected test/live mode, but cannot change the approved SKU, USD amount,
inclusive tax, billing interval, payment mode or hint grant. Every Checkout
still verifies the canonical provider Price. The production composition injects
no such authority, so sandbox sales are not enabled by this change.

The shared webhook verifies the raw signature and mode before any dispatch.
New-SKU dispatch requires an owned database intent; canonical metadata can
identify an unresolved app payment requiring retry, but cannot establish
ownership or grant stock. Fulfillment re-reads the canonical subscription under
the reconciliation lease and validates Checkout, line, Price, invoice,
InvoicePayment, PaymentIntent and captured Charge evidence before one atomic
RPC. No successful response precedes durable fulfillment or a durable duplicate.
Provider/DB failures, busy leases and post-commit release failures are retryable.

Refund/dispute/credit-note routing resolves the canonical payment graph.
Owned new-commerce risk events return `COMMERCE_RISK_POLICY_REQUIRED` with HTTP
503 and Retry-After. They cannot be silently treated as an unrelated legacy
payment. Unsupported asynchronous failure handling likewise stays explicit and
retryable. This checkpoint does not invent a new refund, proration, upgrade,
reversal or deleted-account policy.

Original paid-contract consent, bounded historical backfill and explicit
`COMMERCE_RECONCILIATION_REVIEW_REQUIRED` behavior are documented in
[the additive migration review](commerce-consent-reconciliation-20261006.md).
The JS paid path does not impose fresh current consent. New checkout/spend
continue to require current consent. Original acceptance capture is not an
approval that existing product disclosures are sufficient for new sales.

## Public status and ordinary billing management

Legacy status fields retain their meaning. An optional nested `commerce`
object contains owner ID, mode, active billing state, monthly SKU/period,
scheduled cancellation, live benefit flags and separate
`balances.purchased` / `balances.subscription` pools. The existing atomic
`stripe_commerce_status` RPC proves owner, price, paid-period, refund and
retirement state. Both pools use safe nonnegative integers without business
stock caps. Test balances remain distinct, and test mode never returns live
unlimited-play or ad-free flags.

The existing unique owner-scoped portal lookup supports new monthly
subscriptions. The portal still requires payment-method management and
cancellation at period end, with no proration and plan changes disabled. It
remains independent of new checkout consent/readiness. No provider portal
configuration is changed. Android remains consumption-only with no Stripe CTA.

## Verification boundaries

Focused HTTP tests mount the actual routers/composition over loopback. The
complete synthetic Checkout -> signed webhook -> ledger -> status path uses
PGlite (PostgreSQL/WASM) with a narrow in-process SQL transport adapter and
synthetic pinned-SDK provider responses. It is neither PostgREST nor a native
PostgreSQL HTTP bridge and is not genuine Stripe sandbox evidence.

The separate native PostgreSQL 17.6 migration/transaction rehearsal executes
22 public historical dependencies plus all ten pending migrations. The
[SQL manifest](commerce-consent-reconciliation-results-20261006.json) records
162 scenarios across all five native suites, all 44 raw migration hashes and
unchanged prior history. It includes actual independent-backend contention,
rollback, replay, stale-isolation, legacy compatibility and original-consent
checks. Existing fresh-install history remains blocked by the historical
duplicate settlement migration; no applied history was rewritten.

Remaining release decisions include reviewed provider test/live prices and
bindings, new-product disclosures, genuine provider payment and webhook
acceptance, hosted PostgREST/schema/role parity, explicit new risk/deletion
policies and the full purchase-to-consumption acceptance chain. This checkpoint
does not authorize production SQL, activation, merge, publication or deployment.
