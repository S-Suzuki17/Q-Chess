# Explicit ranked-session storage choice

Date: 2026-10-06. Scope: legacy password-session browser storage only. This is a
locally verified correction, not evidence of production deployment or complete
web/mobile authentication persistence.

## Corrected behavior

- A successful `requestRankedSession` removes the opposite storage record before
  saving the returned proof in the explicitly chosen store. ON uses localStorage;
  OFF uses sessionStorage. ON→OFF and OFF→ON cannot leave the previous token to
  shadow the new one, including when switching accounts.
- Reads validate each store independently and require the requested identity.
  For old clients that left both valid records, a matching sessionStorage proof
  wins. Corrupt, expired, inaccessible, or different-account entries do not hide
  an otherwise valid matching entry. Legacy records have no issuance timestamp,
  so this compatibility read does not claim to reconstruct historical choices.
- If either opposite-store cleanup or selected-store writing fails, the login
  rejects. It clears both stores independently where possible, blocks further
  reads in the current tab, emits an invalidation event, and attempts to revoke
  the newly issued proof plus any readable saved proofs. It never silently
  changes the requested persistence lifetime. A later successful explicit login
  can restore access.
- Logout also attempts each store independently and revokes the distinct,
  readable tokens saved in this browser through the existing token-revoke route.
  This is not account-wide, multi-device, or cross-tab logout. If browser storage
  refuses deletion and the server is unreachable, removal/revocation across a
  page reload cannot be guaranteed; current-tab access still fails closed.
- Existing identity, abort, newer-attempt, logout-generation, and finite-expiry
  checks remain. Cancellation or a mismatched/stale response does not replace an
  existing proof. The server expiry is copied unchanged; passwords are never
  stored. No credentials, production traffic, or real tokens were used in tests.

## Boundaries and safe next steps

1. `server/src/services/RankedAuth.ts` stores token hashes in a process-local Map.
   Its current password sessions last up to one hour without persistence, or 30
   days with `keepLoggedIn`, but a server restart loses them sooner. Durable
   hashed-session storage, expiry/revocation enforcement, restart tests, and
   migration/rollback design can be implemented and tested locally without
   authenticated deployment access. Applying a production migration and proving
   continuity across a real deployment require authorized database/deployment
   access. This client correction does not solve server-restart persistence.
2. `TitleScreen` defaults the checkbox to false and passes it to legacy login;
   `RankedLoginDialog` currently passes false. Neither chooses a dedicated native
   persistence policy. Implementing finite native persistence and testing its
   policy selection can be done locally. WebView process-death/relaunch, logout,
   expiry, and app-upgrade behavior require an Android build/device or emulator
   before claiming mobile persistence. This patch changes neither caller.
3. `supabaseClient.ts` configures native PKCE but uses Supabase's separate auth
   persistence behavior. OAuth login does not consume the legacy checkbox.
   A separate web opt-in/native policy needs coordinated OAuth callback/storage
   handling and interruption tests. Local fake-session tests need no production
   credentials; real provider redirects and production behavior require the
   authorized provider/project configuration and test-account access.
4. `next.config.ts` uses static export; this patch adds no Next.js server runtime.
   `q-gambit.com` and the default API `q-chess.onrender.com` are different sites.
   An HttpOnly cookie migration needs an explicit API-domain or same-origin
   routing decision, cookie scope/lifetime, CSRF and Origin checks, CORS credential
   policy, and Socket.IO handshake/reconnect design. Those contracts can be
   designed and tested locally first. Actual DNS/TLS/routing/provider settings
   and browser verification on the production origins require authenticated
   domain/deployment access and approval. No blind SSR rewrite is appropriate.

The release includes a consolidated QUBE diary update. Publication and broader
authentication changes remain pending. This patch does not change Supabase,
Socket.IO, TitleScreen, server behavior, packages or locks. The verification
workflow includes the temporary commerce-safety base branch for this stacked PR.

## Verification

- Focused client tests cover storage transitions, account switches, old duplicate
  records, malformed/expired records, blocked reads/writes/removals, retries,
  cancellation during response decoding, stale attempts, identity mismatch, and
  independent logout cleanup/revocation with synthetic tokens.
- Passed: 189 tests across 12 focused session, Socket, server-auth, and
  client-consumer suites, including 39 tests in `src/lib/rankedSession.test.ts`.
- Passed: `npm run typecheck`, `npm run lint -- src/lib/rankedSession.ts
  src/lib/rankedSession.test.ts`, and `git diff --check`.
- Browser UI, production deployment, real login, and Android checks are separate
  and were not performed by this bounded patch.
