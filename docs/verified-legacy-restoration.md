# Verified browser legacy sign-in restoration

This bounded change restores a saved legacy bearer only after a successful
`GET /auth/ranked-session/status` check. `qg_last_user` supplies matching appearance
and match-navigation context, never authentication or Circuit access.

## Scope and limitations

- The selected candidate is the structurally valid tab record first, otherwise
  the persistent record. An invalid selected proof never falls back to a different
  account. Old duplicate records can require explicit sign-in; successful explicit
  sign-in still owns exactly one store and clears the opposite store.
- OFF remains tab/session storage; ON remains opt-in local storage. Restoration
  neither writes a new token nor changes its absolute expiry or storage location.
- 401 or mismatched/malformed identity never grants access. 503, network failures,
  and the bounded 15-second timeout preserve the candidate and expose explicit Retry.
- A fresh in-memory server-time anchor subtracts the full request roundtrip.
  Monotonic and wall elapsed time are conservative UI bounds, including clock
  jumps/sleep; the server remains authoritative. The anchor is never persisted.
- Logout, new login, account-switch storage events, cancellation, and unmount
  invalidate pending work. Cosmetic-only cache events preserve a running match.
- Automatic OAuth events cannot replace a selected legacy restoration or newer
  explicit login. A 10-minute tab-local intent marker identifies an explicit OAuth
  handoff across reload; it is not authentication. Flags captured before SDK
  initialization must show a real callback, successful initialization and consumed
  callback parameters. Provider errors, failed exchanges, missing PKCE state and
  Back/no-callback returns grant no alternate stored OAuth account. No callback
  token or code is retained by the flags. Cancellation/new legacy login/
  logout clears that marker. Verified explicit OAuth removes only this browser's
  old legacy proofs, with best-effort token-specific revocation, avoiding a silent
  switch back on the next reload. Other devices are not globally logged out.
- Socket replacement keeps the identity and active match; it does not log the
  account out or reclaim the replaced socket in the background.
- This does **not** make the process-local server token survive a server restart.
  The dormant durable-store implementation is a separate integration. This does
  not establish live OAuth, mobile, cookie-session, or multi-device completeness.

## Integration

The server mounts `createRankedSessionInspectionRouter(authority, deletionStore, accountGate)`
before the generic account-restriction router and account request guard. `authority.verifySession` must return a Promise. Its response is
exactly `{userId, expiresAt, serverNow}`; no token/password is returned. The route
uses no-store, strict bearer/header/query/body checks, a local deletion lease and
an awaited token recheck after deletion lookup. Deleted/deleting identities cannot
restore; game restrictions do not by themselves erase account identity.

`server/src/services/RankedSessionInspectionRoutes.test.ts` is in the default
Vitest include. Successful legacy issuance returns `serverNow` sampled after
issuance/audit completion, alongside the unchanged absolute expiry.
Older issuance responses without metadata remain compatible on ordinary clocks;
malformed supplied metadata fails closed.

## Verification

Focused unit/HTTP tests cover controller races, storage, skew, finite lifetime,
Home bootstrap ownership/navigation and socket replacement. Home's deterministic
unit harness drives actual component effects with unrelated views/transport mocked.

`node scripts/qa/verify-legacy-session-browser.mjs` builds and mounts real React
Home, TitleScreen, the restoration hook and SocketProvider. It blocks all external
network traffic and mocks only unrelated game/commerce views, Supabase and socket
transport. It covers reload ON/OFF, outage/retry, delayed revocation, profile-cache
non-authentication, active match preservation, socket replacement and explicit
OAuth bootstrap. This is isolated browser behavior, not live-provider validation.

`--build-only` validates bundling without claiming interactions ran. Run the full
command in CI after `npx playwright install chromium`; browser execution remains
an explicit gate when a local executable or sandbox is unavailable.

The installed auth-js SDK is also exercised with synthetic storage and a blocked
network transport: failed/absent callbacks can preserve an older session, which
this app must not mistake for a newly completed explicit sign-in. A successful
implicit callback uses one synthetic user-response stub and verifies URL consumption.
SDK behavior was checked against the installed source and the official
[initialize reference](https://supabase.com/docs/reference/javascript/auth-initialize).

## Integration checkpoint

This branch combines the independently reviewed restoration checkpoint `f5f8916`
with verified remote `prep/awaited-session-authority-20261006` at
`9699a167c4a552d86ee9e729185cf87a9648e471`. Its proposed PR base is that preparation
branch. The original restoration worktree/checkpoint remains unchanged.

The integration is intentionally thin: router mounting, issuance time metadata,
gateway order/response regressions, default inspection-test inclusion and a CI
browser step after Chromium installation. Pull-request CI covers this exact base
as well as the existing main and commerce-safety bases. The authority remains
`new RankedAuth(...)`, with its process-local Map. No durable provider, database
migration, activation flag, provider configuration, cookie or transport change is
introduced by this integration. Full aggregate tests and actual Playwright
interaction execution remain fresh CI gates. Local frontend static builds are
verification artifacts, not deployment artifacts. No publication, deployment,
production access or consolidated development-diary update occurs in this slice.

Fresh local integration verification:

- Focused integrated run using the default Vitest configuration: 289/289 passed,
  11/11 files (restoration/Home/socket/storage, Circuit/native auth, inspection,
  awaited authority, RankedAuth and gateway regressions); `--maxWorkers=2`
- `npm run typecheck` — passed
- `npm --prefix server run build` — passed
- `npm run build` — passed, including TypeScript and 14 generated static pages
- `node scripts/qa/verify-legacy-session-browser.mjs --build-only` — passed
- `git diff --check` — passed
- Optional scoped ESLint still reports six unchanged preparation-base errors:
  three `prefer-const` declarations in `server/src/index.ts` and three
  `no-unsafe-function-type` declarations in `rankedGateway.test.ts`. Linting the
  exact `9699a167` source through stdin reproduced the same six errors. This
  integration does not silently claim a clean repository-wide lint run

No full aggregate local suite or actual local Playwright interaction run is
claimed. CI retains the complete-tests assertion and executes the browser fixture
with all external HTTP and all real WebSocket traffic blocked.
