# Real sandbox Checkout through isolated ticket consumption

On 2026-10-03, run `qg_checkout_ajepqrdd` completed a real browser Checkout in
`acct_1ULKIbQnCC46MW4g` test mode, using a disposable profile and official test
payment details. Amount: USD 299 cents. Automatic tax remained off.

The application source was integration commit `e77e298`. The dedicated native
PostgreSQL fixture applied its 14 migrations, including the approved member cap
of 60. No production deployment, billing configuration, flags or data changed.

## Evidence and checks

- The real authenticated checkout route registered its intent before returning
  the Stripe URL. The browser completed that exact `cs_test_` session.
- Three actual CLI-forwarded events (Checkout complete, invoice paid and
  subscription created) passed SDK/raw-body verification and the actual webhook
  router. Each returned HTTP 200 and matched its SHA-256 database receipt.
- The authenticated status route returned active. Daily grant credited exactly
  ranked 3 / hint 3; a same-day retry credited 0 / 0.
- Replaying the signed payload returned 200 without another grant. Appending a
  byte while retaining the signature returned 400.
- The unchanged production-oriented consumer refused the test wallet.
- The QA-only explicit-test ranked RPC was exercised by the actual
  RankedAdmissionStore through two native connections. Two simultaneous calls
  admitted the same match once and debited exactly one test ranked ticket.
- CpuPracticeService used its actual default search worker on the initial
  superposition board. It returned a legal hint and persisted a recoverable
  receipt tied to the actual test subscription. Repeating the request and using
  another request ID at the same revision returned the same receipt without a
  second debit. Final pre-cleanup balance: ranked 2 / hint 2.
- The concrete-position fallback was **not used in this successful run**. A
  prior run timed out before charging; that failed evidence remains separate.
- Live/null modes, anonymous access and a live-pinned database were rejected.
  Paused, reversal-held and expired membership probes were refused inside
  rolled-back fault-injection transactions.
- The public spend/admission/hint SQL function definitions had unchanged
  SHA-256 hashes. There were zero live Checkout intents.
- `npm run typecheck -- --incremental false` passed in the integration snapshot.
  No Next build or dependency installation was performed.

The stopped PostgreSQL cluster was reused, retaining the old database. A fresh
small database isolated the new disposable account. Windows recovery exposed
an open-log conflict and an insufficient startup wait. The harness now logs
outside PGDATA, waits for recovery asynchronously and stops with `fast` rather
than `immediate` shutdown. A 300 MiB disk guard protects preparation and
consumption RPCs.

## Test/live boundary

`stripe-sandbox-consumption.mjs` is QA only. It verifies the loopback cluster's
physical path and actual signed receipt/Checkout/user bindings before creating
`qg_sandbox`. Its three separately named RPC variants derive from the installed
release functions; they require an explicit `test` argument, a private fixture
identity, no live mode pin, no live intents and the single dummy profile. They
use `test_member_*`, `livemode=false` and the exact disposable Price. They do not
replace public functions or change a test Stripe object into a live object.

Do not install these QA variants through production migrations or call them
from production routes. The release's production paid consumers remain live
only. Native PostgREST/Supabase Auth transport, browser gameplay/hint UI, socket
gateway, ranked settlement/recovery/refunds and production capacity were not
tested in this run. This result is not a production-readiness claim.

## T3 current-terms dependency

After the successful purchase and consumption, the same disposable database
also passed `stripe-current-terms-compat.mjs` with the exact T3 migration from
`9c0aec70b7f17cec2f9f1a765d39f810c4294ae9`:

`20261003042315_approved_current_terms_consent.sql`

It follows the member-cap migration `20261003041000_member_ticket_cap_60.sql`
and requires the real consent-table contract (including `accepted_at` and a
unique `(user_id, version)`). The minimal QA scaffold was extended locally to
provide that contract while preserving the legacy dummy consent.

Unpublished policy and legacy consent alone blocked claim and Checkout
preflight, while existing membership status remained active. After fixture-only
publication and new consent, acceptance retained its original timestamp,
same-day grant stayed at zero, balance stayed 2+2, and preflight continued to
block a second active subscription. `service_role` could not change the policy.

Root must publish the same actual JST effective date in the Web constant and
the database policy, and deploy the new consent routes/Store/UI together. The
T3 source deliberately leaves the date null. These QA commits do not set a
production date or enable any release/sales/advertising gate. The new consent
HTTP/UI itself is covered by T3's work, not by the older e77 HTTP harness.

Root is separately making `test_member_ticket_binding` non-destructive by
rejecting pre-existing unbound nonzero balances. This fixture had no wallet
rows when that migration ran and does not rely on zeroing an existing balance.
The revised guard's migration-chain proof belongs to Root's integration run.

## Cleanup and artifacts

At 15:48:08 JST, the owned test subscription was canceled, its Price and Product
archived, and the HTTP server, CLI listener and native PostgreSQL stopped. No
cleanup error was reported. The database files, dummy customer and payment
records remain as sandbox evidence; no real customer or production object was
touched.

User-facing evidence lives in the T4 task's outputs folder:

- `stripe-checkout-e2e-ajepqrdd.json`: signed purchase, grant, retry and cleanup.
- `stripe-sandbox-consumption-qg_checkout_ajepqrdd.json`: actual service debit,
  durable receipt, mode guards and unchanged public SQL hashes.
- `stripe-current-terms-compat-qg_checkout_ajepqrdd.json`: new-consent upgrade.

The earlier `tfrwrime` result remains a failed historical attempt and must not
be used as the current completion status. New runs require a fresh genuine
sandbox Checkout; canceled memberships must never be reactivated by SQL.
