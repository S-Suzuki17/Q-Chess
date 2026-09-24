# Terms consent / Android follow-up — 2026-09-25 JST

## Scope

The owner approved the supplied terms draft. Operator display remains Q-Gambit運営, contact qgambit970@gmail.com. No legal entity, jurisdiction or worldwide service guarantee was inferred from an example. Terms version `2026-09-25.1`, effective date 2026-09-25. Full text is Japanese and English; consent controls have all12 supported languages and explain the text-language limitation.

- Unchecked explicit consent; returning without agreement, support and verified account deletion stay reachable. Existing matches finish without a new overlay interrupting play.
- Consent is checked on each login/mount. Authentication lifecycle revision prevents consent readiness from leaking into a later login to the same account. Cloud synchronization and lobby sockets wait for the new client's check.
- Verified accounts save version and database time with an idempotent insert. Guest acceptance is versioned local state, not a server-verified identity. No client-provided identity/time/IP is accepted. No unrestricted terms-table policy was added; client roles cannot access it, service_role has SELECT/INSERT but no UPDATE.
- Future material revisions must update both server and client versions, retain prior terms and announce changes before activation. No background forced interruption of an active game. Server-wide refusal of every old-client operation is deliberately deferred for the approved Play migration.

## Verified before UI publication

- API commit `841c189` published first; Render deployment `dep-daqm9fbncjis73apmvo0` Live, 1m01s. Public unauthenticated GET /account/terms returns401.
- Migration `20260924174539_account_terms_consent.sql` applied additively. RLS/ACL and empty consent table checked read-only. No production test account or acceptance was created.
- Disposable PostgreSQL/PGlite eight scenarios pass, including consent minimum grants, immutable server timestamp and deletion cascade. HTTP/client consent tests pass.
- Regression: 109 files /875 tests pass, excluding QuantumChess.test.ts and RankCpuSearch.test.ts. Six isolated real HTTP/Socket.IO scenarios pass. Later diary/client configuration focused tests:23 pass. Shared typecheck, server compilation and Web/Android production Web builds pass.
- Pixel10/API37 isolated QA: five tests pass in24.680s. Covers explicit consent, disabled unchecked submit, no pre-consent progress requests, refusal/deletion entry, account cloud save failure/retry/restore, global logout, profile/friends fixtures, recovery entry,2D/3D gameplay/resume and15 MP3s decoded.
- Initial latest-suite attempt had two setup failures: it assumed every launch contained data-screen, but a saved QA login correctly displayed data-terms-gate. The harness was fixed to recognize both; the five-test repeat passed. Those failed runs are not counted as passes.
- After that pass, consent readiness was additionally bound to the authentication lifecycle revision and Android changed to1.15/code20. Type/build and targeted regression pass; the Pixel disconnected before the exact final-code20 device repeat. Do not claim the final AAB itself passed a physical-device run. No further user unlock prompt was sent while the owner is away.
- Screenshots of unchecked consent, preserved offline progress and restored account save were visually checked. No password/email submission, real profile/friend change or production game was made. Real Play-signature authentication remains untested.

## Play cutover gate

Console read-only check: latest uploaded bundle17/1.12, production17 under review, internal test13/1.8 published. Codes18/19 were not uploaded. Installed real app13 is untouched. New source prepares1.15/code20; AAB creation/validation is recorded separately, not proof of Play availability.

Do not revoke legacy profile/friend/registration permissions or enable a minimum Android version yet. First distribute the updated build, verify it on the intended Play track, and finish other legacy call sites. Ads, quotas, preregistration distribution remain OFF. No Play upload or paid action was performed.

This does not certify40/40: CAPTCHA, monitoring/alerts, backup retention verification, guest proof, offline reward authority, old password migration and eventual privilege cutover remain. No dormant-account auto-deletion, age gate or adblock login ban was introduced. QUBE t10 accompanies the authorized Web release; no X posting.
