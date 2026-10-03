## Summary

- Add authenticated free-login and separately capped member ticket wallets, durable ranked admission/refunds, and server-authoritative CPU practice hints.
- Integrate Stripe Checkout, signed canonical webhook reconciliation, subscription-period cancellation, reversal handling and account deletion safeguards.
- Add approved current-terms consent for new claims/purchases while preserving the shipped Android general-play/support/deletion contract.
- Separate Web checkout from existing-member management and Android entitlement use. Advertising stays disabled.

## Release boundary

This PR is a verified release candidate, not a claim that live purchases have been verified. Source readiness is complete; explicit runtime/build switches still control rollout. The complete production DB migration chain is applied. The current live Render process and Cloudflare export remain unchanged until cutover. No live charges were made. The owner will perform the real purchase test.

## Verification

- Real isolated Stripe sandbox Checkout -> signed notifications -> active membership -> daily 3+3 grant -> ranked/hint 1+1 consumption, with duplicate/tamper/consent tests.
- Free pools cap 20; paid pools cap 60, partial grants and same-day retries verified.
- Native PostgreSQL lease/race/crash verification and PGlite raw migration-chain tests.
- New migration guards preserve existing balances and unknown legacy hint RPCs instead of silently deleting them.
- All 163 Vitest files / 1,271 tests pass; typecheck and server build pass.
- Real HTTP / Socket.IO / PostgREST / PostgreSQL passed 10 scenario groups, including old nine-argument settlement compatibility, recovery/refunds and the owner's requested 10-second CPU fallback.
- All-ON Web export passes (14 routes), including commerce, secret/size and advertising-OFF guards. The prepared Cloudflare artifact is not yet uploaded.
- Standard builds now use Webpack to resolve the Turbopack shared-server CommonJS/ESM build failure; no checks or protections were disabled.
- New Checkout has a separate OFF switch and startup GET-only price/Portal verification. Existing-member management, webhook processing and account deletion cancellation remain available on purchase rollback.

See `docs/release-integration-20261003.md` and the scoped handoffs. No credentials, production test accounts or signing assets are added.
