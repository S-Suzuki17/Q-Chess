# Verified email recovery — released 2026-09-24

Current release: Web/Render application source `fe8b473`; signed Android AAB18 generated from the same source. Both public account capability endpoints return HTTP200 with `available:true`. See `release-1.13-code18.md`. This is not completion of the full 40-item audit.

## Confirmed transport

Supabase custom SMTP → Resend → the owner's existing email inbox was tested once. The owner explicitly confirmed receipt. No new production user/game, password change, API-key access, or paid plan was involved. This proves transport delivery, **not** the game's legacy-password recovery flow.

## Implemented

- Account settings: current password + current owner session → send email OTP → verify → store a private recovery binding. Existing unverified `profiles.email` is never imported or trusted.
- Sign-in screen: ID + previously verified email → opaque challenge → code + new password → server-only bcrypt update of the existing profile. ID, ratings, rewards and opponent data remain unchanged.
- No recovery JWT/refresh token reaches the client. Each Supabase OTP call uses a separate client, avoiding accidental mutation of the service-role DB client's session. Keys remain server-only; passwords and codes are neither logged nor stored.
- RLS and explicit privileges deny public access to recovery addresses and privileged RPCs. A private, tightly scoped definer helper returns only an Auth identity match, not an Auth record. User metadata is not authorization evidence.
- Existing playable Auth profiles cannot be attached as another profile's recovery identity. One email/Auth identity belongs to one legacy profile. Initial enrollment and same-address re-verification are supported; changing an already linked address is intentionally not offered yet.
- Codes are bounded to ten-minute challenges and five attempts. Email-level and remote-address limits, strict request shapes, body bounds, no-store responses, one-use completion and duplicate-request locks are implemented. Unknown addresses get the same start response; asynchronous mail latency does not disclose registration.
- Reset revokes existing and in-flight legacy sessions. Matching/deletion/upload barriers prevent conflicting writes. If a DB write response is ambiguous, login is reopened only after the new password verifies; otherwise the account gate stays closed for operator reconciliation/server restart. Never call that uncertain response a confirmed reset.
- Self-deletion captures the linked Auth identity in its durable job before cascading removal of the binding; the existing deletion worker subsequently removes that Auth user.
- UI/error/help text covers all 12 game languages. Google/Discord sign-in recovery remains with the provider; it is not silently converted into a legacy account.

## Local verification

- Targeted Vitest HTTP/session/client/component tests: **100 passed across five files** after the final changes. Typecheck and server build also passed.
- `scripts/qa/account-recovery-db.mjs`: seven scenarios in isolated PGlite: deny public access, reject unverified/mismatched identities, uniqueness, preserve ratings, reset only correct owner, deleted Auth identity rejection, cleanup linkage. PGlite uses a labelled cryptographic test double; this is a transaction/authorization test, not a bcrypt benchmark.
- Actual browser: title → sign-in → forgot-password → ID/email → code/new-password inputs, desktop and 390×844 portrait. No browser runtime errors. Next dev used fallback fonts because the sandbox could not fetch Google Fonts.
- Browser QA uses the loopback-only fixture `scripts/qa/recovery-http-fixture.cjs`, not production. Completion and error/success rendering are covered by the component harness; do not label that harness a real-browser password mutation or real-device recovery test.
- Run typecheck and server build after changes. Native Android recovery UI, real OTP completion and release builds remain separate gates.

## Activation order / remaining gates

1. **Complete on 2026-09-24 after explicit owner approval:** saved `{{ .Token }}` in both **Confirm sign up** and **Magic link or OTP**. Existing subjects, body text and `{{ .ConfirmationURL }}` links were preserved; Japanese/English code instructions and an anti-sharing/unsolicited-message notice were appended. Both previews showed the original link plus code placeholder, and both saves returned to the disabled Save changes state. Source copies are in `supabase/templates/`. SMTP credentials, users and passwords were not changed, and no additional email was sent. Prior transport receipt is confirmed; delivery/rendering of the newly edited templates is not yet an end-to-end OTP test.
2. **Complete after explicit owner approval:** applied account deletion, then verified recovery. Production versions are `20260924140124` and `20260924140234`; local filenames were reconciled to those tool-assigned versions. General client table reads/RPC execution denied; service-role access verified. Deletion jobs and recovery bindings remained zero, existing 32 game records remained unchanged. No production test accounts or deletion calls.
3. **Complete:** Render saved `ACCOUNT_RECOVERY_ENABLED=true` with Save only after DB/templates were ready; the subsequent Git deployment activated the reviewed server. Both capability endpoints returned `available:true` and health returned200.
4. **Complete:** merge resolved and shared source published on main. Correct Vercel project is `sotas-projects-3b57e80d/q-chess-w8rg` (do not reuse the stale local CLI account/project link). AAB18 built and verified; Play upload not performed. Ads/quotas/preregistration distribution stay OFF.
5. End-to-end verification with a user-operated genuine account is needed for the actual OTP/password change. Do not create production test users; do not change the owner's password automatically. Existing passwords remain usable until a reset is explicitly completed.
6. **Complete:** QUBE t6 is included in public Web and the public-source copy. No X posting.

## References

- [Supabase email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Supabase security advisors](https://supabase.com/docs/guides/database/database-linter)

Existing public Auth RPC/search-path and permissive legacy-table findings from the wider audit remain separate release blockers; this change does not claim the complete 40-item release checklist is satisfied.
