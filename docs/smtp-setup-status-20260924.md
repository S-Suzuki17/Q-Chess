# SMTP setup checkpoint — 2026-09-24

No secrets are recorded here. One owner-requested authentication delivery test was sent; no paid plan enabled.

## Confirmed and authorized

- Supabase Q-Chess `gtxbvbsplfkkjlmnqath`: custom SMTP initially OFF. After user reported saving, a full page reload confirmed ON and Save changes disabled (persisted configuration).
- User chose Resend free tier, retaining public support address `qgambit970@gmail.com`.
- User registered/logged into Resend personally. Added `auth.q-gambit.com`, Tokyo/ap-northeast-1, receiving OFF.
- Domain record id: `c38e7a6a-48bf-4720-ba3b-6cd8193fe829`.
- q-gambit.com is managed by Cloudflare (dolly/jacob nameservers).
- User explicitly approved adding exactly the DKIM TXT and two sending CNAME records. Do not modify root/www website, existing receiving records, or DMARC.

## DNS progress

Saved and verified in Cloudflare UI:

1. TXT `resend._domainkey.auth` — Resend-generated public DKIM key, TTL Auto.
2. CNAME `rsend.auth` → `rsend-apne1.forge.rmta.net`, DNS only, TTL Auto.
3. CNAME `send.auth` → `send.forge.rmta.net`, DNS only, TTL Auto.

All three are real external changes. Authoritative Cloudflare DNS and public Google DNS (8.8.8.8) return the exact CNAME targets; the public DKIM key also matches exactly. Resend initially reported Pending; after the user's save report, the reloaded domain page explicitly reports **Verified**. No extra records or duplicates needed.

Prepared public fields: sender `no-reply@auth.q-gambit.com`, name Q-Gambit, host `smtp.resend.com`, port465, user `resend`, interval60seconds. User subsequently reported saving. Reload confirmed custom SMTP ON, Q-Gambit, smtp.resend.com, port465, interval60seconds and disabled Save changes. No password/key was inspected. Delivery and reset flows are not tested by this configuration check.

Tracking Configuration offered a NEW tracking subdomain setup, not an active tracking domain. No tracking domain or open/click tracking was enabled; no additional DNS added.

## Credential handoff

The user pasted a Resend example containing a secret key. Its value is deliberately NOT recorded here and must not be used. User revoked/replaced it and entered the replacement directly into Supabase. Never read/copy a key dialog, save a key in source, print it, or execute the pasted onboarding test-email sample. After the user's confirmation, a read-only Supabase inspection showed custom SMTP ON, “Stored password is hidden”, and Save changes disabled, confirming the replacement setting is persisted without exposing its value.

Before the save report, Codex prepared (but did NOT submit) a new-key form: name Q-Gambit SMTP, Sending access, auth.q-gambit.com only. The API Keys list initially contained two Onboarding entries; neither was deleted by Codex. The user later reported creating one key named onboarding. A fresh list then showed exactly one entry with a NEW management ID (71ad029b-fa10-4857-b878-c38dfa7c8d7f), different from both earlier entries; the old entries are absent. The replacement was initially Full access. Codex reduced its existing permission to Sending access and domain to auth.q-gambit.com, saved, and observed Sending access in the list. Key value and name were not changed or acquired. Confirm the user pasted this replacement into Supabase Password and saved; the previous SMTP save alone does not prove this.

## Next steps

1. DNS additions and independent resolution checks are complete. No duplicates or extra records.
2. Domain verification is complete. Do not repeatedly refresh unchanged verified status.
3. Keep authentication-link tracking disabled. Do not create the suggested tracking subdomain.
4. Old-key removal and replacement-key persistence in Supabase are confirmed. Secret creation/entry/confirmation/submission was user-operated. The remaining key is send-only and domain-scoped; never expose it in chat, commands, files or screenshots. Do not acquire account-wide credentials.
5. Official SMTP settings: host `smtp.resend.com`, port465, username `resend`, password = user-supplied Resend API key. Suggested From: `Q-Gambit <no-reply@auth.q-gambit.com>`; Gmail remains the support contact. Confirm supported Reply-To setting separately.
6. SMTP is saved and ON. On 2026-09-24 a single `resetPasswordForEmail` delivery test was accepted for the owner's existing Auth account. The user then explicitly reported receiving the email. No production test account or game was created, and no password was changed. The pasted Resend sample/key was not used. Initial sandbox attempts failed before transport; the successful request was not retried. Node25 on Windows asserted during process exit after reporting acceptance; this is not a failed mail send.
7. Legacy `profiles.email` is not verified, and legacy password accounts are not automatically Supabase Auth password accounts. The reviewed game recovery flow is now deployed and enabled; see `account-recovery-status-20260924.md`. Existing users must first verify a recovery email while signed in. No unverified addresses were imported.

## Existing records preserved

After explicit owner approval on 2026-09-24, the production **Confirm sign up** and **Magic link or OTP** templates were saved with `{{ .Token }}`. Original subjects and confirmation links remain unchanged. Previews and completed-save UI were verified. This changed email formatting only; it did not deploy the new game client/server or activate password recovery. Source copies and release gates are recorded in `account-recovery-status-20260924.md`.

- Root q-gambit.com CNAME → `e53b6b15480b0d24.vercel-dns-017.com`, DNS only.
- www CNAME → `cname.vercel-dns.com`, DNS only.
- Unrelated hiragana-speed CNAME untouched.

## Work state

Shared code audit: `commercial-release-audit-20260924.md`.
Latest local tests:51 targeted unit/route/lifecycle tests;6 loopback online cases;7 SQL deletion cases; typecheck passed after the latest SocketContext fix. Server build passed earlier with no subsequent server-source change. The lifecycle test reproduced stale connection events overwriting SESSION_REPLACED; callbacks now ignore a superseded socket. Native/browser UI remains a separate QA gate.
Update: shared source `fe8b473` is now public on Web/Render and used for signed AAB18. The merge is committed. Latest release checks are recorded in `release-1.13-code18.md`; earlier counts above are historical, not the final release evidence.
