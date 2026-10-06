# Awaited session-authority preparation — 2026-10-06

Status: locally verified preparatory change; not deployed. Based on `c4f9e4b1494bdd194fb4b869a0adadfe9e66081b`.

## Scope

- `RankedSessionAuthority` is a Promise-only boundary for legacy issuance, identity verification, single-token revocation and user-wide revocation
- `RankedAuth` remains the process-local Map adapter. Token hashes, session capacity, in-flight password-check invalidation, one-hour OFF / thirty-day ON lifetimes and restart invalidation are unchanged
- All production consumers use the interface and await the result, including HTTP middleware, authorization rechecks, login/logout, socket handshake, ranked admission and restriction polling
- No durable provider, database migration, cookie, transport, storage-policy, multi-device-policy or frontend change is included

## Failure and race boundaries

- A pending Promise is not identity proof. Rejected authority checks return sanitized unavailable errors; resolved invalid proofs remain unauthorized
- Existing OAuth failure behavior is preserved. In routes where OAuth rejection already produced 401, only rejection of the new session-authority boundary produces 503
- The socket handshake rechecks the legacy proof, bound to the same user, after asynchronous deletion/restriction guards. Revocation during those guards cannot connect a stale legacy socket
- Logout does not acknowledge 204, and logout-all does not acknowledge success, before required revocation finishes. No remote revocation is deferred until after a success response
- Login rechecks its local gate after the awaited durable preflight. A lookup started before logout/reset/deletion cannot start a password check inside that newer barrier
- Generic login outages clean up only the unreturned proof created by that attempt. Confirmed deletion races still revoke every proof for that user, including pending password checks
- Account deletion awaits `beforeErase`, including revocation, before Stripe cancellation, object removal, data erasure or completion. An uncertain revocation keeps the deletion barrier closed and permits the same deletion ticket to retry
- Recovery waits for revocation before and after password replacement. Enrollment completion owns its one-use ticket before awaiting identity, preventing duplicate OTP flows and premature release of another request's gate
- Identity remains separate from account restrictions. Recovery and deletion retain their route order and availability to restricted accounts
- Already-started games keep their existing expiry/outage behavior. A replacement socket still replaces the active session before disconnecting the previous socket

## Verification

The source was reconstructed after an executor reset. Validation below is from new runs against the reconstructed source; earlier test results are not used as proof.

- The authority test matrix covers all 15 HTTP consumer families with deferred-null and rejected identity results, including boolean authorization rechecks
- An AST regression checks all 45 production authority calls for direct `await`
- Gateway tests cover delayed/rejected authentication and ranked admission, logout acknowledgement, transient-login cleanup, confirmed deletion races, restriction-poll failure, handshake revocation, stale login preflight and existing-game expiry/outage behavior
- Deletion, recovery and logout-all tests cover delayed/rejected revocation before success or destructive work, and duplicate/retry enrollment completion
- The local-only account-controls QA fixture is migrated to the awaited API
- Fresh focused run: `npm test -- server/src/services/RankedAuth.test.ts server/src/services/RankedSessionAuthority.test.ts server/src/services/rankedGateway.test.ts server/src/services/AccountRecovery.test.ts server/src/services/AccountDeletionRoutes.test.ts server/src/services/AccountProfileSecurity.test.ts --maxWorkers=2` — 197/197 passed, 6/6 files
- `npm run typecheck` — passed
- `npm --prefix server run build` — passed
- `node --check scripts/qa/account-controls-fixture.cjs` — passed
- Isolated loopback fixture smoke: registration → login → socket connection → awaited logout → revoked reconnect rejection — passed
- `git diff --check` — passed

Full aggregate verification is left to fresh CI; no tests are skipped and no timeouts are increased by this change. The development diary remains with the integration owner so this server-only slice does not edit frontend content. No push, deployment or private production capture was used.
