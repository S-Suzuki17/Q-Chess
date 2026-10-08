# Dormant new-SKU fulfillment boundary

Historical preparation record. The current release candidate adds source
accounting, risk reconciliation, retirement and shared entitlement admission.
See [deployment sequence](commerce-production-release-20261008.md); the gate
state and incomplete scope below describe the original 2026-10-06 checkpoint.

Local implementation only. No deployment, new sales, price registration, payment,
tax registration, refund, dispute decision or legacy migration was performed.
All new SKU sales remain source-gated by `readyCommerceSkus() === []`; the SQL
price-binding table remains empty after applying the migrations. Existing
environment flags cannot mount or activate the new modules. This commerce slice
adds no frontend changes or new Stripe CTA on Android/Play.

## Exact scope and legacy contract

The server catalog remains Standard USD 3 per month, Plus USD 6 per month with 10
hints per paid monthly subscription period, and hint packs 1/13/27/44/77/166 for
USD 1/10/20/30/50/100. All totals include tax. Membership status uses the existing
dormant SQL entitlement contract (unlimited ranked/online and ad-free). This slice
does not connect those entitlements to gameplay, ads, or hint spending.

Legacy USD 2.99 remains the explicit `LEGACY_MEMBERSHIP_PRODUCT` contract. Its
checkout, snapshot, cancellation, portal, refunds and grants retain their current
implementation. No subscription is repriced, canceled, migrated or reinterpreted.
The new boundary does not accept a legacy checkout as a new SKU.

## Canonical evidence and durable application

`StripeCommerceFulfillment.fulfillWebhook(rawBody, headers)` verifies the raw
signature and pinned API version before any provider or database call. The
signed event supplies routing identifiers only. The stored server checkout
intent and its mode-specific reviewed DB price binding select the SKU and owner.
The handler checks effective, approved account terms; the SQL RPC checks them
again under the account lock before any durable mutation.

`StripeCommerceEvidence` makes read-only requests through the existing pinned SDK
client (`2026-08-26.dahlia`). It checks:

- Retrieved Checkout ID, owner, SKU consistency, mode, complete/paid state, exact
  USD total, single quantity-one line, reviewed Price ID and current Price terms
- Price USD unit amount, explicit inclusive tax, one-time versus explicitly licensed monthly
  recurring mode, interval count one, per-unit billing, no tier/custom/quantity
  transformation, and matching test/live mode; archived prices remain valid for
  historical fulfillment
- Completed automatic-tax calculation when configured, exact inclusive-tax
  accounting, no discounts or shipping; any present adaptive-pricing,
  managed-payments or adjustable-quantity option must be a plain object with
  its own `enabled: false` field
- For subscriptions, one canonical subscription item with the approved Price,
  customer and current period; a paid latest invoice is required for active state
- Exact fully paid invoice, one non-prorated subscription line, 27–32-day monthly
  service period, correct Price and subscription, zero balance/credit-note/
  discount adjustments, automatic collection, and subscription create/cycle reason
- One paid invoice-payment allocation to a succeeded PaymentIntent and a fully
  captured, unrefunded, undisputed charge with exact amount/customer/currency/mode

The Checkout `amount_subtotal` is pre-tax. With inclusive tax, it may be less than
the approved final total; the reader checks subtotal + tax = total. Invoice
`subtotal` includes inclusive tax, while `subtotal_excluding_tax` and
`total_excluding_tax` explicitly exclude it. The new reader checks these fields
according to their separate meanings rather than copying a legacy assumption.

Provider references checked 2026-10-06:

- [Stripe tax behavior](https://docs.stripe.com/tax/products-prices-tax-codes-tax-behavior)
- [Checkout Session](https://docs.stripe.com/api/checkout/sessions/object)
- [Checkout line items](https://docs.stripe.com/api/checkout/sessions/line_items)
- [Invoice](https://docs.stripe.com/api/invoices/object)
- [Invoice line item](https://docs.stripe.com/api/invoice-line-item/object)
- [Invoice payment allocation](https://docs.stripe.com/api/invoice-payment/object)
- The installed Stripe 22.6.2 generated API types confirm the pinned field meanings

`StripeCommerceStore` calls one atomic RPC per application:

- `fulfill_stripe_commerce_one_time(p_evidence jsonb)` validates owner, catalog,
  price binding and consent, then invokes the existing checkout/event-deduplicated
  purchase ledger. Only the purchased-hint origin changes
- `fulfill_stripe_commerce_subscription(p_evidence jsonb)` requires the existing
  reconciliation lease acquired before canonical reads, applies the current
  snapshot, records the event's own verified invoice period, and invokes the
  existing subscription/mode/period business-key ledger in one transaction

A grant failure rolls back the projection, customer link, paid evidence and
receipts together. A retry after a successful commit is harmless. Subscription
updates and Checkout completion can project state but never mint monthly hints.
Only `invoice.paid` carries a grant request. A reordered older paid invoice can
use its own service period while retaining the current canonical period. The
existing refund barrier and historical reversal checks still apply. Purchased
stock and subscription-origin stock are never merged or cleared here.

## Integration contract; not wired to production

The new modules are deliberately absent from `index.ts`, `SupabaseService.ts`, and
the mounted legacy router. The deployment owner must not route new-SKU events
through the legacy $2.99 handler. A future reviewed dispatcher needs immutable
stored checkout/ownership classification for legacy versus new commerce,
including reversal lineage; metadata alone cannot select a fulfillment policy.

For a new-SKU-only integration, construct `StripeCommerceEvidence` with the
reviewed server key mode and automatic-tax configuration, then construct
`createStripeCommerceStore(client, legacyStore)` to reuse only its reconciliation
lease methods. Call `fulfillWebhook` with the untouched Buffer and signature
headers. A returned result may be acknowledged. Invalid signatures/schema/mode
are terminal invalid-webhook responses; provider errors, store errors, lease
errors, unsupported policy and unbound checkouts must return a retryable failure.
Do not acknowledge a thrown error, and do not fall back to legacy on error.

The additive migration is
`20261006155010_atomic_commerce_fulfillment.sql`, generated by Supabase CLI 2.119.0.
The combined native fixture explicitly applies six pending migrations in
chronological order, including `20261006142305_dormant_durable_legacy_sessions.sql`
and `20261006154443_dormant_legacy_session_runtime.sql`.
Any newly discovered file fails the inventory assertion until deliberately added.
The runtime and atomic commerce migrations share that same complete inventory.

## Explicit unsupported cases and activation blockers

- New-SKU refund/dispute/fraud/credit-note policy is not implemented. Risk events
  throw a retryable policy-required error. Canonically refunded/disputed payments
  fail validation. This does not reverse an already-issued new-origin balance
- The existing account-retirement subscription tombstone remains a
  no-resurrection acknowledgment barrier: a retired reconciliation result returns
  zero credit without provider reads or grants. Missing stored checkouts or
  profiles remain retryable failures. A future new-SKU retirement policy beyond
  that existing barrier remains unapproved; this slice does not invent one
- A late previously ungranted paid period when the canonical subscription is
  canceled, suspended, off-price or refund-blocked cannot satisfy the existing SQL
  grant contract. It remains retryable; an unsuccessful grant also rolls back its
  accompanying snapshot. Separate unchanged-price subscription cancellation
  events can project cancellation with no paid-period request
- Tier changes, proration, overlapping/revised invoices, customer credit,
  off-Stripe payments, split/partial/overpayments, discounts and multiple items
  are rejected pending approved policy. Off-price subscription transitions are
  not normalized into a new approved tier or silently acknowledged
- Tax jurisdiction/classification/registration and the authoritative consent text
  for public new-SKU sales require review. Code validation is not that review
- No genuine Stripe sandbox purchase, renewal, webhook delivery, portal, refund,
  dispute, deletion or purchase-to-consumption run has been performed here
- PostgREST transport is simulated only in the SQL adapter integration test.
  Native PostgreSQL verifies public schemas/roles and concurrency, not exact hosted
  production ACL/extensions, Stripe HTTP behavior or production equivalence

Activation requires approved immutable price bindings and configuration, genuine
sandbox end-to-end evidence, completed supported risk/deletion/spending behavior,
reviewed terms/tax handling and an explicit source-level release decision. The
existing historical fresh-install migration conflict remains a separate blocker.

## Local verification

The focused suites exercise synthetic signed provider responses, the actual
PostgreSQL RPCs, and a full signed-webhook → canonical reader → store adapter →
real SQL path. Negative cases cover wrong owner/SKU/price/mode/tax/amount/quantity,
incomplete or ambiguous provider evidence, adjustments, partial refunds,
signature/API-version errors, current terms, DB failures, lease errors, replay,
reordered invoices, period collisions and refund barriers.

Native PostgreSQL 17.6 adds independent-backend contention through both new RPCs,
atomic failure/retry and historical invoice/refund-barrier tests to the existing
31 commerce scenarios. The final test report records exact counts and limitations.
Mocks and synthetic signatures prove code behavior, not real payments.

The commands below include focused commerce checks at `082b7a6` and the merged
runtime/commerce native rerun. The combined branch's full default-suite evidence
and source digests are recorded in
[the integration report](commerce-runtime-integration-20261006.md).

- `npm test -- --maxWorkers=1 server/src/services/Stripe server/src/services/CommerceCatalog.test.ts`:
  439 tests across 18 files passed, no skips (214 tests are in the four new suites)
- `npm run build --prefix server` and `npm run typecheck`
- Direct TypeScript checking of all four new test suites, which the normal root
  typecheck excludes along with the server directory
- `node scripts/qa/session-postgres-local.mjs <trusted-postgresql-17-bin> --commerce`:
  35 scenarios passed, no skips
- `node scripts/qa/session-postgres-local.mjs <trusted-postgresql-17-bin>`:
  45 session/runtime scenarios passed, no skips, with the same six-file schema inventory

An initial unrestricted parallel Vitest run had three unexpected worker exits in
this shared cloud environment; the bounded-worker run is the verified result. No
required test was skipped or replaced. Remote aggregate CI remains the publication
owner's next verification step. The combined branch preserves the runtime's
single local diary entry and matching draft; this commerce slice adds no duplicate.
