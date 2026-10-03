# Ticket and rewards navigation — Web release

## Published result

- Public site: https://q-gambit.com/
- Cloudflare Pages project: `q-gambit-web`
- Production deployment: `a1e65ffd-54a3-4dfb-a042-c3434a05c4f6`
- Source commit: `8f17aa3` on `ui/rewards-navigation-20261003`, pushed to `S-Suzuki17/Q-Chess`.
- Source is intentionally not merged into main in this UI-only release: main's Render auto-deploy would restart the match server. Preserve/merge this branch in the next coordinated release; do not overwrite this Web deployment with older main UI.
- No Render deployment, DB migration, pricing, allowance, ad enablement, or Android build was performed in this UI release.

## Changes

- Lobby, Settings, and Account now have one consistent entry to Ticket & Rewards.
- Free balances/caps and today's or next UTC login reward are shown before optional membership information.
- Free and member tickets use separate cards; receiving and usage details are secondary disclosures.
- Membership purchase conditions are opt-in to expand; consent is initially unchecked. Active membership management/cancellation remains outside the collapsed purchase disclosure.
- Added navigation labels in all 12 supported languages; retained platform and server-side feature guards.
- Included a QUBE casual post and matching manual-post draft.

## Verification

- Typecheck: passed.
- Full test suite: 163 files / 1,275 tests passed (including 31 focused tests).
- Production build, Web commerce export check, and Cloudflare staging checks: passed.
- Public verifier: 97 checks passed, 70 assets matched build hashes, 15 reward tracks verified; no production writes by this verifier.
- Local UI fixture used actual components with synthetic API responses: free, active member, 20-ticket caps, native purchase exclusion, errors, loading, and long Tamil copy. At 320px viewport the dialog had no horizontal overflow.
- Actual public UI: lobby and Settings links open Ticket & Rewards; balance and next login reward render; no browser console errors observed. No purchase or manual consent/claim button was used. Existing automatic login-reward behavior was retained.
- Real paid purchase remains the owner's test; this release does not claim paid end-to-end verification.

## Artifacts

- ZIP: `build/q-gambit-web-rewards-ui-20261003.zip`
- ZIP SHA256: `5FFDC974A708EFE31D1A13E3A96C0AE9DAACB8152178D2306C6DA2983A99E71B`
- Manifest: `build/cloudflare-pages-2026-10-03T14-51-38-375Z.manifest.json`
- 209 deployed files / 141,732,461 uncompressed bytes.
- Screenshot: `C:/Users/souta/.codex/visualizations/2026/10/03/01a0ff6d-d227-73c2-bb15-25dc1dde1244/rewards-ui-production-20261003.jpg`

## Limitations

- Android source shares the applicable UI changes, but no new AAB or physical-device validation was requested/performed in this turn.
- This screen describes the daily free ranked allowance; it does not claim to display the number remaining, which is not provided by the current balance API.
