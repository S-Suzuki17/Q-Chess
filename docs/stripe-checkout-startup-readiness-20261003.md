# Stripe purchase startup gate — 2026-10-03

Base: `bf194fb`. Branch: `fix/stripe-checkout-startup-20261003`.

Stripe source readiness flags in `server/src/index.ts` are now true. Deploy this
candidate only after Root completes the database migration chain. This change
does not modify SQL, TicketFeatureGates, Web, production environment variables,
or the pinned Stripe API/SDK version.

## Startup behavior

The existing mode/environment and billing flags still control processing.
With a valid configured billing API, startup performs only these Stripe GETs,
using the configured server key and existing SDK timeout (6 seconds, no retries):

- Retrieve the allowlisted Price: active, matching mode/ID, USD 299 cents,
  inclusive tax, recurring every one month.
- List Portal configurations: exactly one active default in the matching mode;
  payment method update ON, cancellation ON at period end without proration,
  subscription/plan update OFF. Incomplete pagination fails closed.

Both reads run even with purchases disabled. No Checkout/Portal session,
subscription, charge, invoice or refund is created by this check. The existing
purchase and Portal methods reuse these extracted validation methods when called.

New Checkout starts disabled and becomes available only when both GETs succeed,
processing and Portal are enabled, the source readiness flag is true, and
`STRIPE_MEMBERSHIP_CHECKOUT_ENABLED` is exactly `true`. Missing or differently
cased values are OFF. A pending, unavailable or failed check keeps Checkout OFF;
a failed check requires a restart after correcting the configuration.

One short startup log reports only
`[stripe] checkout_preflight=verified`, `failed`, or `unavailable`.
It includes no keys, IDs, payloads, error details or customer data. `verified`
describes the GET validations; it does not mean that the purchase flag is ON.

## Rollout and rollback

Root owns the deployment and settings. After completing the database migrations,
keep `STRIPE_MEMBERSHIP_CHECKOUT_ENABLED=false` during the first configured startup
and verify the startup result. Enable purchases only after the remaining release
checks. The Portal environment gate must also be enabled before new purchases.

To stop new purchases independently, set only
`STRIPE_MEMBERSHIP_CHECKOUT_ENABLED=false` and redeploy/restart according to the
hosting platform. Preserve the billing mode/processing and Portal flags, keys and
deletion guard. Webhooks, status, daily grants, Portal and deletion cancellation
do not depend on Checkout readiness. Startup does not block server availability.

The tax policy is unchanged: inclusive pricing is checked; automatic Stripe Tax
still requires the existing explicit flag and confirmed registration. This patch
does not enable Tax or change Stripe account settings.

## Verification

Local automated tests use mocked Stripe HTTP only, including all live-mode
fixtures. They cover exact GET requests, price/Portal mismatches, permission
errors, initial/pending state, a late successful read after another fails,
strict flag parsing, and independent purchase rollback. Authenticated HTTP tests
verify status/grant/Portal and signed webhook handling remain available; a mocked
deletion guard still cancels and retires its linked subscription.

Results: 5 test files / 59 tests passed; server TypeScript no-emit check and
`git diff --check` passed (2026-10-03 JST).

Commands:

```text
npm test -- server/src/services/StripeMembershipReadiness.test.ts server/src/services/StripeMembershipLive.test.ts server/src/services/StripeMembershipPortal.test.ts server/src/services/StripeMembershipRoutes.test.ts server/src/services/StripeCancellation.test.ts
node server/node_modules/typescript/bin/tsc --project server/tsconfig.json --noEmit --incremental false
git diff --check
```

The deployed live-key GET check has not been run by T4. Its result must come from
the target deployment's startup log. No live purchase, billing/refund operation,
database write, dependency install or Next build was performed for this change.
Web diary updates remain with Root's Web integration, outside this Stripe-only
commit.
