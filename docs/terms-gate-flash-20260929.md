# Saved-consent startup / match-exit flash — 2026-09-29

## Cause and scope

`TermsGate` started in `loading`, but rendered the full terms document before
the account's GET `/account/terms` completed. Rehydration/re-authentication can
remount the gate; leaving a match also makes a pending check visible because
`playing` no longer bypasses the gate. This looked like a new consent request
even when the stored response subsequently reported consent as accepted.

## Fix

- Render a neutral, localized loading screen while checking, never the document
  or consent controls. Keep an exit available on slow connections.
- Render the document and consent form only for a confirmed `needed` status.
- Connection errors and client/server version mismatch show recovery guidance,
  without presenting an old consent form as if acceptance had been lost.
- Preserve account/version checks, explicit checkbox, server-confirmed writes,
  guest consent persistence, logout invalidation, deletion/support access and
  the active-match bypass. No optimistic local authorization cache.
- Shared source applies to Web and future Android builds. No AAB created here.
- No DB migration, production consent writes, test accounts, rated games,
  ratings or server-runtime changes.

## Verification

- 39 targeted unit/API tests: terms gate startup in all 12 languages, consent
  version/timestamp validation, account transport, API acceptance/re-login,
  QUBE draft consistency. Local mocks only.
- Browser fixture `scratch/terms-gate-qa/`: 11/11 passed in the real browser,
  including first acceptance, reload, account switch, request/save failures,
  retry, outdated terms, late responses, guest persistence, exit while loading,
  match win → menu, and match exit while the status request is delayed.
- Typecheck passed after correcting test children prop typing.
- QUBE t14 is off-topic conversation per the latest user instruction. No X post.

Run: `node node_modules/vite/bin/vite.js --config scratch/terms-gate-qa/vite.config.mjs`
and open `http://127.0.0.1:4195/`, then press **Run regression suite**.
This fixture has no production network access; terms transport and account
deletion are replaced by local mocks.

## Release

Production publication not yet performed. Do not push this frontend-only fix
to `main` solely to deploy Web: Render is auto-deployed from main and would
restart matches unnecessarily. Use a validated feature-branch preview and
promote only the intended Vercel project `sotas-projects-3b57e80d/q-chess-w8rg`.
The local `.vercel` project link belongs to a different project; do not use it.
