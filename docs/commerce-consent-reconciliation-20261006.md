# Original Checkout consent and paid reconciliation

`20261006192347_durable_commerce_checkout_consent.sql` is an additive, dormant
migration created with Supabase CLI 2.119.0. It changes only the commerce intent
consent snapshot, its registration RPC, the two atomic fulfillment wrappers,
and one legacy test-status projection predicate.
No earlier migration, policy version, price binding, activation flag, receipt
grant algorithm, refund rule, general account TermsGate or spend RPC changes.

## Contract

New Checkout registration reads `current_account_terms_status` on the trusted
server path and stores `terms_version`, `terms_accepted_at` and
`terms_effective_date` on the immutable owned intent. They are not client/RPC
inputs. The existing profile, restriction, deletion, current effective ticket
consent, price/amount/mode and unresolved-subscription checks remain mandatory.
API roles cannot update any intent field. A constraint requires either all
three fields absent, or a finite, coherent snapshot with publication no later
than acceptance and acceptance no later than the stored Checkout creation time.

The two paid wrappers validate that stored snapshot after matching the exact
owned Checkout. They do not ask an already-paid contract to accept a newly
effective policy. This covers both the first durable grant following a delayed
paid webhook and duplicate delivery of an already-recorded receipt. Existing
account guards, provider evidence, catalog/price binding, reconciliation lease,
ownership, event/business-key deduplication, refund barriers and atomic rollback
remain unchanged. New checkout and spend keep their canonical current-consent
requirements.

Registration and both paid mutation wrappers require READ COMMITTED, matching
the dormant accounting boundary. A higher-isolation transaction can retain a
policy or restriction snapshot taken before another backend commits, even after
profile/advisory locking. Such calls now fail with SQLSTATE `40001` before any
intent, receipt, snapshot or grant write. Native tests establish the actual stale
snapshot first, commit the policy/restriction change on another connection,
then verify rejection and unchanged balances/receipts.

The legacy test `stripe_member_status` query now excludes intents present in
`stripe_commerce_checkout_intents`. An active canonical Standard/Plus test
subscription therefore cannot appear as a legacy entitlement, even before its
paid invoice arrives. Genuine legacy test status and daily ticket balances
remain unchanged. This is a status-projection correction only; no grant or
refund procedure changes.

## Bounded upgrade proof

The predecessor registration function required the one approved version
admitted by the existing fixed-version CHECK on `current_terms_policy`.
Its recorded creation time was server-owned. The one-time migration backfills
an old intent only when that constrained policy and its exact consent row prove
publication <= acceptance <= original Checkout creation. It does not hardcode a
second historical version, infer another contract, rewrite acceptance times or
add an automatic future-policy backfill path.

Missing, unpublished, accepted-before-publication or accepted-after-Checkout
evidence remains a null snapshot. Re-registering the same ambiguous Checkout
cannot fabricate retroactive acceptance. Registration and both wrappers raise the stable
`COMMERCE_RECONCILIATION_REVIEW_REQUIRED` error (SQLSTATE `42501`) before writing
any paid receipt, canonical snapshot or balance. The HTTP integration must
surface that review/retry state; returning success or automatically collecting
new consent would conceal the unresolved original evidence. Future policy
migrations must not reuse this bounded proof to infer an older contract.

## Local verification and limits

Focused PGlite tests execute the raw additive SQL, including a predecessor
registration/backfill rehearsal, first paid pack and monthly delivery after
publication becomes ineffective, duplicate receipts, original timestamp
preservation, rejected snapshot mutation and invalid timestamp ordering,
ambiguous-evidence rollback, and account/refund/lease regressions.

The native PostgreSQL commerce harness now includes 43 scenarios (44 Node tests),
including four new consent, two status-projection and two stale-isolation
scenarios. It executes all ten pending migrations
against the same 22 explicit public historical dependencies. Other native jobs
share that exact pending chain. The fresh-history diagnostic now inventories
44 raw files and still reports the pre-existing duplicate settlement blocker;
no applied history is rewritten or excluded.

The [result manifest](commerce-consent-reconciliation-results-20261006.json)
records 44 passing focused tests and 162 native scenarios: commerce 43,
auth/runtime 45, hint origins 30, shared admission 27 and Crown 17, all on
PostgreSQL 17.6. It includes all 44 raw migration hashes and confirms the prior
43 files are unchanged. Historical result manifests remain records of their earlier
checkpoints. This is synthetic local verification, not hosted schema/ACL parity,
PostgREST, genuine Stripe payment or sandbox evidence, or production execution.
All activation gates remain closed. No provider configuration, production DDL,
merge, deployment or publication is authorized by these results.
Capturing original acceptance does not approve current terms for the new SKUs;
the existing product-disclosure/terms insufficiency remains a closed-sales hold.
