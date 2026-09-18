# Android AdMob integration — 2026-09-19, ADS REMAIN OFF

## Latest continuation (supersedes earlier implementation checklist below)

### Web published; Android release preparation

- Production Web: https://q-gambit.com/; Vercel READY, deployment
  `CNax71o4KkpBzuiBPnUkdpmXtB5T`, commit `85c46068b8e6627c502170dc58190a3fc9b60dad`.
  Built in Production environment in 56 seconds; custom domain assignment confirmed.
- All 15 public reward MP3s return audio content and SHA256-match local source copies.
  Public Crown Circuit shows all updated titles; the new preview dialog opens without changing rewards.
  Clicking its audio play control crashed the verification in-app-browser tab; actual playback remains
  UNVERIFIED. Fresh public page loads and its captured console error list is empty. No runtime-log/drain audit.
- No production test accounts, matches or progression writes performed. Render/main/DB remain unchanged.
  Ads/quotas remain OFF. Age-screen cancellation retained.
- Owner requested an AAB after Web publication. Preparing 1.10 / code15 (local predecessor code14);
  confirmation of any externally uploaded code15+ was requested, not yet answered.
- First local Android build exposed missing public backend config and was NOT distributed. Rebuilt Web
  using only approved public settings from the existing configured worktree. Intended auth settings endpoint
  accepted its publishable key (read-only check, no credentials printed). No private key copied into Web.
- Added `build-android-web.cjs` plus release config validation to reject missing/private settings and force
  ads/limits OFF. Verify final AAB against this corrected out/, not the earlier intermediate bundle.

### Final reward recording replacements

- Three additional supplied recordings replace the remaining generated tracks:
  astral -> 盤上の幾何学 (`Banjou_no_Kikagaku.mp3`), zenith -> Twelve Moves Ahead,
  valkyrie -> The Eighth Rank. All 15 reward recordings now use distinct supplied MP3s.
- Original source files and old WAV assets are preserved; reward IDs and unlock conditions stay unchanged.
- Copies verified against source SHA256; both music test files pass (17 tests).
- Commit 4167a1d was pushed only to `release/admob-prep-music-20260919` and its Vercel preview is READY.
  These three newer recordings are not included in that first preview. Main/Render/DB remain untouched.

### Owner follow-up — no age screen, additional music, dependency patches

- Owner explicitly cancelled the age-screen request. Newly drafted screen/store files were removed,
  not released. All-child-protective SDK defaults remain. Do not enable live ads without resolving
  the mixed-audience policy requirement; removing a screen is not a compliance approval.
- Owner approved Web publication with ads and limits OFF. No server/DB activation authorized by
  that Web-only confirmation; publish via a dedicated branch and Vercel, not Render's main auto-deploy.
- Supplied four recordings copied byte-for-byte with source/destination SHA256 equality:
  Circuit 9 -> The Quiet Gambit; Circuit 10 -> The Architect's Gambit;
  midnight -> Ivory and Stream; coronation -> Rain on the Board. IDs/unlocks preserved.
  15 distinct reward recordings remain: 12 supplied MP3s, 3 original WAVs.
- Next / eslint-config-next patched to 16.3.5, js-yaml lock updated; server sharp 0.35.4,
  firebase-admin 14.4.0, qs lock updated. Scoped xcode / gaxios 6.7.1 UUID overrides to 11.1.1
  retain CommonJS v4 API. UUID compatibility smoke passed. npm audit reports zero for both trees.
- Targeted music, circuit, gateway, avatar tests: 40 passed; ad suite: 38 passed; typecheck/server
  build passed. Web build passed under escalation (restricted network initially blocked Google Fonts).
- Full npm test NOT passed: first run found gateway mock missing the new ad route/store (fixed,
  nine gateway tests then passed), and existing perft CPU-heavy tests exceeded their timeout.
  Full run was stopped after no completion; no engine logic or timeout thresholds were changed.
- Pixel 10 now detected over ADB. No device interaction/new APK install performed in this follow-up.
  Earlier APK hash below predates the dependency/music changes; do not call it the latest release.
- Local browser: title -> guest home -> settings works. Reward menu preserves locked access.
  Direct MP3 browser navigation blocked by browser client; no listening confirmation claimed.
- Quota integration remains incomplete. No count consumption, live ad, database migration or SSV
  activation performed. Do not report all remaining implementation finished.

### Local verification update — September 19

- Added bounded initialization/consent-info/preparation waits. Timed-out native operations still block
  new ad requests until they actually settle, preventing late callbacks crossing reward intents.
  Events arriving before show are ignored. Never automatically close a visible ad or consent form.
- Reward flow now serializes intent creation through server confirmation, across both categories.
  An interrupted connection after earned remains pending, never locally credits a balance.
- Settings preserve confirmed/pending outcomes when balance refresh fails; added manual balance refresh,
  visible initial refresh failure, distinct busy feedback and serialized privacy controls.
  React checklist informed asynchronous response guards and preventing overlapping actions.
- Pinned Google Mobile Ads 25.4.0 and UMP 4.0.0 instead of plugin's floating Ads 25.4.+ default.
  This pin is NOT proof of Families certification; verify certified version before activation.
- APK inspection exposed SDK-added ACCESS_ADSERVICES permissions. Removed AD_ID, ATTRIBUTION and TOPICS
  variants in addition to com.google.android.gms.permission.AD_ID. Official opt-out reference:
  https://developers.google.com/admob/android/privacy/sandbox
- Latest Web build, typecheck, server build and Android debug build passed. Targeted Vitest: 38 passed.
  Local PostgreSQL checks rerun: 17 passed. No production test data created.
- Added reusable `scripts/verify-admob-debug-apk.ps1`. Passed signature/package/debug-artifact checks,
  absence of the above permissions and SHA256 comparison of all 172 Web output files against APK assets.
- Artifact: `android/app/build/outputs/apk/debug/app-debug.apk`, versionCode 14, versionName 1.9.
  SHA256: `741708ED979B230873E289C6DBA84CEAACDFC7CDB9B72FF3097ECC1FB90403C8`.
  DEBUG ONLY, not store-uploadable. Default flags OFF; this is NOT an end-to-end ad QA build.
- `npm audit --omit=dev` reports 5 entries: Next critical, sharp high, Capacitor CLI/xcode/uuid moderate.
  No blanket forced upgrade made. Evaluate exposure/fix before release; static Web/Android output does
  not by itself prove the development/build environment or server uses are unaffected.
- Still incomplete beyond Google approval: actual hint/online consumption integration, neutral age screen,
  Families SDK/config verification, quota UX, device SDK/audio QA, complete locale coverage, backend/DB
  deployment and SSV registration. Keep production ads and daily limits OFF. Nothing deployed.
- All local changes remain uncommitted on baseline 85fb54b; main dirty Gemini worktree untouched.

### Production enablement request follow-up

- Owner explicitly confirmed audience includes children AND adults and requested production activation.
- Live AdMob dashboard inspected: Q-gambit Android shows **要審査**. App settings shows
  app-store details **—**, with Add link. Searching package `com.qgambit.app` in the official
  AdMob Google Play linking UI returned **アプリが見つからない**. No store link was selected or saved.
  Need actual published store URL/publication status from owner; do not select a similar-name game.
- SDK initialize now supplies child-directed + under-age-consent protection and General content rating
  before MobileAds initializes. UMP request also passes under-age flag. This conservative protection
  for everyone is NOT a substitute for neutral age screening or proof of full Families compliance.
- Removed AD_ID permission using tools:node=remove to prevent library reintroduction. Gradle manifest
  merge passed and inspected merged_manifest/debug/processDebugMainManifest/AndroidManifest.xml:
  AD_ID permission absent. 30 tests and typecheck passed after protection changes.
- Added local public/app-ads.txt matching existing ads.txt publisher (NOT deployed).
- ADB still reports zero devices; emulator executable and AVD Medium_Phone_API_36.0 exist, not launched.
- Production flags remain OFF. No DB deployment, server deployment, store linking, SSV URL registration,
  Play upload or actual advertisement serving occurred. Do NOT report production activation complete.

- User clarified "3歳以上" is ONLY the store content rating. Actual Play target audience groups still requested.
- Web H5 Games Ads application submitted by owner, NOT approved; Web rewarded remains off and separate.
- Added service-only SQL migration `20260918165008_admob_reward_allowances.sql` (CLI-generated name).
  RLS/no anon/authenticated grants, unique transaction/intent, atomic credit +3, atomic idempotent consumption,
  UTC daily reset. This migration is LOCAL ONLY, not applied to production.
- Added authenticated `/ads/allowance`, `/ads/reward`, `/ads/reward/:id` and signed `/ads/admob/ssv`.
  Server gate `ADMOB_REWARDS_ENABLED=true` is required; default OFF. No client credit endpoint.
- Added Android-only settings panel and authenticated reward coordinator. It polls server confirmation and sends
  only an opaque intent ID to Google (not user names/emails). Requires `NEXT_PUBLIC_NATIVE_REWARDS_ENABLED=true`.
  UI strings currently Japanese/English only; complete other supported locales before general release.
- Circuit natural-break hook now calls native interstitial only when `NEXT_PUBLIC_NATIVE_INTERSTITIAL_ENABLED=true`.
  Audio pauses temporarily without changing saved mute preference. Web still returns unavailable.
- `NEXT_PUBLIC_ADMOB_LIVE` remains OFF. None of these flags have been enabled in production.
- Verification: 30 Vitest checks (native SDK, signature, auth routes, allowance model, AdSense regression) passed;
  17 local PostgreSQL/PGlite checks passed, including privilege denial, repeat receipts, expired intents,
  replayed consumption and daily reset. Script: sibling `../admob-db-check/verify.mjs`.
  Server build and client typecheck passed. No production test data created.
- Remaining: integrate consumption with server-authoritative match start/hint delivery, quota-exhausted UX,
  interrupted intent reconciliation, SDK consent/init hang handling, device UI/audio tests, privacy/age configuration,
  deployment/SSV dashboard registration. Daily limits MUST stay false until these pass.
- Current additions still uncommitted, not pushed, not copied to main dirty worktree. No new AAB generated.
- Run: `npx vitest run --config vitest.admob.config.ts`, `npm run typecheck`, `npm run build --prefix server`.
- Supabase skill informed service-only INVOKER functions and least-privilege access; React skill informed async
  cleanup and duplicate-click prevention. Latest Supabase breaking changelog entries did not affect these APIs.

Working tree: `scratch/private-replays-release-20260918`, based on `85fb54b`.
Changes are uncommitted and have NOT been synced to `work/q-gambit-app`.
Do not overwrite that other worktree's unrelated Gemini/user edits.

## Dashboard changes completed

App: `ca-app-pub-1116866075179199~4430714849`.

- Created standard hint rewarded: `ca-app-pub-1116866075179199/8141474158`, amount 3, item `hint_uses`.
- Created standard online rewarded: `ca-app-pub-1116866075179199/2288802662`, amount 3, item `online_uses`.
- Reuse existing standard Crown Circuit interstitial: `ca-app-pub-1116866075179199/2980646811`.
- Preserved old partner-bidding-only units 6713289529, 4319980342, 9237354393.
- SSV callback URLs NOT configured yet. No live ads requested/clicked.

## Implemented foundation (not end-to-end integration)

- Capacitor AdMob 8.1.0, Android manifest app ID and generated plugin registration.
- Native ad service: UMP gate, test IDs by default, overlap protection, listeners removed on exit,
  load timeout, dismissal awaited before resuming, privacy options independent of permission to request ads.
- Native SDK reward event is a UI signal only, never a verified credit.
- AdSense SDK is not loaded inside the native app.
- Server ECDSA SHA-256 verifier validates original query bytes, duplicate parameters, approved units,
  reward amount/type, opaque intent shape, timestamp; caches Google public keys one hour.
- Java/Kotlin targets aligned to the existing Java 17 project target.

## Verification

- 12 targeted tests passed: native lifecycle, allowance pure functions, locally signed SSV fixtures.
- Typecheck passed before SSV module; repeated final typecheck separately.
- Server TypeScript build passed.
- `gradlew :app:compileDebugJavaWithJavac` passed with AdMob included.
- `npx cap sync android` passed under escalation (sandbox os.userInfo error otherwise).
- ADB found zero connected devices. No real-device validation, new AAB, release build or deployment.
- Copied `out/` during sync predates these changes; MUST rebuild Web and resync before packaging!

## Release blockers / remaining work

1. User answered target age "3歳以上". Clarify whether this is IARC content rating or actual Play target audience groups.
   Do NOT guess COPPA/under-age-consent settings. Inspect Families-certified SDK versions, AAID behavior,
   age screening and UMP/Privacy Messaging configuration once actual audience is established.
2. Durable allowance tables/RPCs and authenticated APIs are NOT implemented. Verified SSV must atomically
   bind an unexpired server-issued intent to an account/category and grant 3 once per transaction/intent.
   The verifier alone does NOT provide replay protection or credit persistence. Do not expose it as a grant endpoint alone.
3. Add opt-in rewarded UI, delayed confirmation/polling, safe consumption for delivered hints/started online games,
   and native privacy controls. Preserve existing Web behavior. No limits until whole system is ready.
4. Wire circuit interstitial at existing afterResult natural break; currently adPolicy remains a no-op.
5. Register SSV URLs only after backend deployment and verification. Do not create production test accounts/matches:
   owner previously explicitly declined production test data.
6. Device QA with Google test units, cancel/error/offline/rotation/background/double tap and consent flows.
7. Review installed npm audit findings (6 reported on install, not yet attributed). No blanket forced upgrade.
8. Harden init/consent hang handling, late load events across retries, and key rotation/retry behavior as needed.

`AD_POLICY` remains all false. `NEXT_PUBLIC_ADMOB_LIVE` defaults off.
No public DB writes performed; read-only schema check confirmed profiles.id is text.
Supabase skill read; changelog HTTP fetch blocked by sandbox (retry with escalation); MCP docs and SQL available.
If adding a migration, generate its filename via `supabase migration new`, never hand-invent it.

References:
- https://developers.google.com/admob/android/ssv
- https://support.google.com/googleplay/android-developer/answer/9867159
- https://support.google.com/googleplay/android-developer/answer/9893335
