# Q-Gambit 1.13 / versionCode18 — 2026-09-24

## Delivered

- Application source: `fe8b4738a25a9b475c5769e63419cd321ad28b9c`, a committed merge of current Web and Android work. Existing Antigravity changes preserved. Public-source `work/q-gambit-app` fast-forwarded to this commit.
- Web: https://q-gambit.com/ — Vercel project `sotas-projects-3b57e80d/q-chess-w8rg`; production deployment `q-chess-w8rg-avpvun63i-sotas-projects-3b57e80d.vercel.app`, Ready. Preview was verified before main push.
- Server: https://q-chess.onrender.com/ — Render `srv-da5jpcgjo6nc73cpjjl0`, main commit `fe8b473`, Live. `/health`, `/account/deletion/capabilities`, `/account/recovery/capabilities` return200; both capabilities true.
- Supabase `gtxbvbsplfkkjlmnqath`: deletion migration `20260924140124`, recovery migration `20260924140234`. Files renamed to the actual applied versions to prevent accidental double application. Do not blindly push all other pending migrations (ads/founders remain OFF).
- Both production email templates contain the OTP placeholder plus original link. SMTP transport receipt confirmed by owner. Recovery enabled only after DB/templates; no pasted API key used.
- Public QUBE t6 and 12-language contact/privacy deletion/recovery guide included. No X posting.
- Android `com.qgambit.app`, 1.13/code18; portrait retained, resizeable game activity, no advertising identifier permissions. Native ads, quotas and preregistration distribution OFF. No Play upload.

## Artifact

Workspace-relative: `outputs/release-1.13-code18/q-gambit-1.13-versionCode18.aab` (outside the source repository).

- Size: 141806977 bytes.
- SHA256: `9683bc646b0c3966961981897853cfbf6539e64367b3b245970e1a70dfeaa4aa`.
- Signing certificate SHA256: `296a49d93e3341a63053d5d55c106f6990453c0a929c529f962c4b83c6683273`, identical to AAB17.
- Official bundletool validation passed; all200 current Android Web output files matched bundle bytes. Correct release package/version, non-debuggable, portrait/resizing, native reward bridge, no AD_ID/AdServices identifier permissions verified.
- Existing signing file was copied locally into the integration worktree when absent; ignored by Git, not shown or uploaded. Signing configuration still contains legacy plaintext credentials and needs a separate secure-storage migration.

## Verification

- Core release suite:756 tests across85 files passed (expensive quantum-engine arena/perft and RankCpuSearch excluded from this run).
- Additional public guide/QUBE tests:17 passed, including12 new locale cases. Shared typecheck and server build passed.
- Loopback real HTTP/Socket.IO:6 scenarios passed; identity/database are test doubles, external networking forbidden. Not a production rating game test.
- Disposable PGlite: deletion7 scenarios and recovery7 scenarios. Recovery crypto is an explicit test double, not a bcrypt benchmark.
- Production npm dependencies: client0 and server0 reported vulnerabilities; not a guarantee of absence of defects.
- Pixel10, Android37, isolated `com.qgambit.app.qa`:3 tests passed. Native-only boundaries, ads/analytics exclusion, settings, automatic centered intro, practice move/CPU reply,2D/3D, background/resume,15 BGM recordings decoded (>10s each), recovery-entry no-submit test.
- The Play app remained code13/name1.8 with its data untouched. QA is debug-signed and separate: real Play-signature OAuth, preregistration receipts and release-track behavior still need store testing.
- A later screenshot-only repeat initially stopped at a sleeping/locked device before activity resume. After the owner unlocked it, the recovery-entry test passed again (1 test, 1.991s). The final screenshot was visually checked: heading, explanation, both fields and action buttons fit within the portrait screen without clipping. No email was sent or password changed.
- Production recovery entry was rechecked in Japanese: the form and send-code action are available after capability loading. No form was submitted.

## Scope not claimed complete

- No production test accounts, games, password reset or account deletion were performed (owner's restriction). Actual OTP enrollment/reset completion still needs the owner to operate a genuine account; password submission is user-operated.
- Wider40-item audit is NOT complete: permissive legacy profile/friend/active-match access, public legacyAuth RPC bypass, full circuit cloud sync, versioned policy consent, forced update/BAN/monitoring tooling remain. Do not describe this AAB as commercially certified or all40 compliant.
- Legacy-account deletion does not remotely erase offline copies on other devices. Backups follow provider retention. Unverified profile email is never used as recovery authority.
- Paid plans, age gate, ads, quotas, reward distribution and Play rollout were not activated.
