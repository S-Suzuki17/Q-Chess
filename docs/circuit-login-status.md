# Crown Circuit login gate — 2026-09-18

## Implemented

- Crown Circuit requires a successful login in the current page, or a restored Supabase session validated with `auth.getUser()`. Guest, anonymous Supabase session, and remembered profile data alone cannot enter.
- Guest CPU practice remains available. The gate opens the existing login form and returns to Circuit after successful login. New gate copy covers all 12 supported languages.
- Entry, stage start, completion/save and delayed post-ad continuation are guarded. Logout/account replacement invalidates in-flight authentication and match callbacks and unmounts the active Circuit match.
- Cross-tab identity removal/replacement revokes access. Same-account name/avatar updates do not interrupt matches. Stale successful login responses leave the form usable for retry.
- Existing local campaign/reward data is preserved. No campaign-store migration, reset, database mutation, ad-policy change or rating change.

## Ownership / files

- Gate lifecycle: `src/lib/circuitAccess.ts`, `src/hooks/useCircuitAccess.ts`.
- UI and text: `src/components/CircuitLoginGate.tsx`, `src/locales/circuitAccessText.ts`, additions to `campaign.css`.
- Integration: `src/app/page.tsx`, `CampaignMode.tsx`, `TitleScreen.tsx`, `LevelSelect.tsx`.
- Tests: `src/lib/__tests__/circuitAccess.test.ts`, `scripts/qa/circuit-login-smoke.mjs`.
- `scripts/qa/sep17-feature-smoke.mjs` now logs in through a mocked RPC before Circuit checks; syntax checked, its entire older visual suite was not rerun for this change.
- Preserve the pre-existing profile-cosmetics changes and unrelated scratch files. Do not reset the working tree or reapply earlier patches.

## Verified locally

- `npm test -- src/lib/__tests__/circuitAccess.test.ts src/lib/__tests__/campaignStore.test.ts src/config/circuitStages.test.ts src/config/campaign.test.ts --maxWorkers=2 --testTimeout=30000`: **38 tests / 4 files PASS**.
- `npm run build`: **PASS**, including TypeScript. Existing outside-repository package-lock warning remains.
- Targeted ESLint: **0 errors**, 3 existing `next/no-img-element` warnings in TitleScreen.
- `git diff --check`: no whitespace errors; line-ending notices only.
- Exported app preview: `node scripts/qa/preview-export.mjs` (localhost port 3101).
- `node scripts/qa/circuit-login-smoke.mjs http://127.0.0.1:3101`: **PASS** at 1440×1000 and 360×800; guest Circuit denial, guest practice, failed login, revoked delayed login/retry, successful legacy login, stage launch, name-only update, cross-tab logout, stale cached identity and unchanged save bytes. No uncaught page errors in these two flows.
- Mocked Supabase callback/session checks: verified non-anonymous user accepted, anonymous user rejected. This is not a live Google/Discord login test.
- Screenshots visually inspected: `../../outputs/circuit-login/guest-gate-1440.png`, `guest-gate-360.png`; results at `../../outputs/circuit-login/results.json`.
- Independent read-only review identified two cross-tab issues; both fixed and covered by browser tests. Re-review found no remaining concrete blocker in this scope.

## Limits / release handoff

- No public Web deployment, AAB build, real-account mutation or physical Android test in this change.
- Legacy ID/password RPC login returns a boolean, not a persisted authentication token. Therefore Circuit requires re-login after a page reload for that login method. A valid persisted Supabase OAuth session is revalidated automatically.
- This is a client login lifecycle gate, **not server-side anti-cheat/authorization**. Existing campaign progress remains device-wide and local, not account-isolated/cloud-synced. Do not describe it as protected server-owned rewards. Server validation and an account-scoped migration would be a separate change.
- Build before starting the export preview. Running Next dev and build together caused an HMR panic during verification; stopping the owned dev server and verifying the completed export resolved the test-environment issue without deleting files.
- Profile badge visual/physical-device verification has its own handoff; this gate test does not certify all 3D badge rendering.
