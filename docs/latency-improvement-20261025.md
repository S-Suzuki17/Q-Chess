# Login, match entry and board response — 2026-10-25

Implementation commit: `0e2f5078d09d177b595fd8b7496c549db8687ad5` on
`codex/interaction-latency-public-20261025`, based on main
`51f0adcef1e7df19ddf5e22722190cd12ca51c9b` (PR #33). The earlier AI's changes
are retained. The user approved this implementation and its related tests and
records for the existing GitHub repository, main, Render and Cloudflare Pages.
The initially approved local commit `e6faa3355d829527c243758c8dd7df90054fbb84`
was rejected by GitHub's private-email guard. The public commit uses the
account's existing noreply address and has the identical Git tree
`25c99be6143cacd199c443bfdd082b8d86de9a7a`; email privacy remains enabled.
Android 30 submission to Google Play requires separate approval.

## Changes

- Simultaneous requests with the same token share the pending Supabase Auth
  `getUser` call. Completed results are not cached. Every caller still checks
  the live session and recovery identity; later revocation fences remain live.
  Pending provider reads expire after five seconds and can be retried.
- Google account inspection reads the linked profile through the existing
  `google_account_links_user_id_fkey` relationship in one Data API request.
  The relationship was confirmed with a read-only catalog query. No migration
  or account data change is required. Missing profiles and API errors fail closed.
- Move validation and king-attack checks inspect the requested destination
  instead of enumerating all 64 squares. The full generator and direct check
  use the same geometry, capture, castling, en passant and promotion rules.
  This engine is shared by the server, Web and Android clients. CPU strength,
  clocks, game rules, advertisements and rewards are unchanged.
- Android candidate version is `30 / 1.25`.

## Measured local effect

Five warm-up runs and 80 measured runs per operation on the same Node 25.2.1
installation. Selection means computing destinations for all friendly pieces
in that position; it is not a network or physical-device latency measurement.

| Position | Selection median before → after (ms) | Move median before → after (ms) |
|---|---:|---:|
| Initial quantum | 6.515 → 3.684 | 0.420 → 0.133 |
| Self-check | 1.139 → 0.453 | 0.298 → 0.073 |
| Quantum mate | 1.343 → 0.787 | 0.463 → 0.160 |
| Checkmate | 0.738 → 0.477 | 0.095 → 0.035 |
| Castling | 0.304 → 0.129 | 0.164 → 0.033 |

Selection computation decreased about 35–60%; move computation decreased
about 63–80%. Scripts and raw results are in `scratch/latency-20261025/`.
In the actual local practice component, fresh Chrome contexts at 1440×960
and 390×844 measured selection at 29 ms and 38.6 ms. Selection, legal capture,
CPU reply, free hint and 3D switching passed without horizontal overflow or
page errors. These browser measurements are not Android-device measurements.

## Production diagnosis, read only

- Render `Q-Chess`, service `srv-da5jpcgjo6nc73cpjjl0`, remains on Free in
  Virginia. Live deployment `dep-dbefrbuq1p3s73e7o5mg` contains main `51f0adc`.
- Supabase project `gtxbvbsplfkkjlmnqath` is healthy in `ap-northeast-1`
  (Tokyo). The inter-region distance adds network travel to serial requests;
  its exact share of authenticated-login latency was not measured.
- Sample CPU usage was approximately 0.0032–0.0036 cores and memory 101 MB.
  The sampled metrics do not show sustained resource exhaustion.
- Public Web HTML returned HTTP 200 in 0.353 seconds. The first service check
  timed out at 15 seconds; a later request took 3.366 seconds, then warm
  requests took 0.640 and 0.310 seconds.
- The 07:25 UTC check again timed out while a fresh instance started at
  07:25:41 and listened at 07:25:46. The subsequent status GET returned 200 in
  0.306 seconds. `npm run release:health` then passed with maintenance false
  and no issues. No authenticated customer requests or production writes
  were used for these probes.
- [Render documents](https://render.com/docs/free) that Free services sleep
  after 15 minutes without incoming traffic and take about a minute to wake.
  Code optimization does not remove that platform delay. The user explicitly
  chose Free and prohibited paid plans. No paid upgrade, new subscription or
  region migration is part of this release.
- The Pages dashboard identifies the current production deployment as
  `249648df-f283-4ccf-ba4d-0074075cdfd5`, main PR #33. The older October 24
  deployment in the recovered state file is not the immediate rollback target.

## Verification and prepared delivery

- Engine, learning and authentication tests passed; the related board,
  authorization and route tests passed. There are 241 distinct tests across
  the two focused runs. One new test's initial retrying HTTP-503 fixture was
  corrected to a non-retrying HTTP error and the affected suite passed.
- Root TypeScript check and server TypeScript build passed.
- Web and Android production-configuration builds passed: each checked 63
  JavaScript files, all three public connection values and zero unresolved
  public environment reads. Connection values were recovered only from the
  retained Android 29 public assets; no private environment file was copied.
- Six synthetic-account browser cases passed for each export (12 total):
  entry, setup, saved login, zero balances, reauthentication and outage retry.
  Unknown external traffic was blocked and production mutations were zero.
- Web review guard passed for eight public pages. Prepared Pages directory:
  `build/cloudflare-pages-2026-10-25T07-33-03-399Z`, 261 files, 143964419 bytes.
  Manifest SHA256:
  `964e58516434c4f984a21fe0eaa7526a78ea9a987578f20d4eb5b89152ab17af`.
  This package has not been uploaded.
- Android external-payment boundary passed. All existing native advertising
  build switches were preserved. The signing certificate recovered from D
  matches the retained Android 29 AAB, whose SHA256 is
  `2413ef5a5e1c306ff1606f8ff6acb2a164e061a4c81a53e818c8a68123c34409`.
  Android 30 release APK/AAB and the separate QA APK built successfully. All
  three contain the same 259 verified Android Web files. APK signature verified;
  all 766 non-META-INF AAB entries verified with the retained release certificate.

Artifacts under `F:/QG-Builds/latency30-release-20261025/app/outputs/`:

| Artifact | SHA256 |
|---|---|
| `apk/release/app-release.apk` | `bb2ec619296e2e27e953fe82252c928f5fbc209eea5d9275504a104c23e40511` |
| `bundle/release/app-release.aab` | `a49ddb935d66d26ebdc89ea62c6930e5dbc60382889f4e2b575ed9aa2f03e7a6` |
| `apk/debug/app-debug.apk` | `c83001c1bf32b5142431ade6e0fb1c2e96e848b89e44dfe93b7dea7b32a2c4b2` |

Pixel 10 passed the isolated `com.qgambit.app.qa` instrumentation run at
08:25 UTC: selection 58.3 ms, player move display 11.6 ms, move plus CPU reply
4051.1 ms. The latter includes the configured Hard CPU thinking budget.
Free hint, rendered 3D, pause/resume and foreground state passed. The screenshot
was inspected. External WebView network traffic was blocked; there was no real
login, ad placement invocation or production mutation. These measurements do not
establish authenticated Internet latency, live ad serving or Play acceptance.

The first attempt could not start because the device was locked. After the user
unlocked it, selection/move/CPU passed, but the new hint assertion stopped at
15 seconds, equal to the existing hint search budget. Increasing the test's
deadline to 30 seconds (without changing product behavior) produced a full pass.
The test keeps the QA activity's screen on while it is open; system settings and
the user's installed Play app are unchanged.

## Release and recovery

Using the scoped approval already received, push the reviewed source to the existing GitHub
repository, complete its checks, merge, verify the Render deployment and
upload the exact verified Pages package. A Git push alone does not publish
Cloudflare. Android delivery is a separate APK/AAB and Play operation.

On regression, restore the previously live Render deployment and previous
Pages deployment; no database rollback is required. Record the actual live
Pages deployment immediately before replacing it. Keep all services on their
existing free plans; do not incur new charges to remove Free-plan sleep.

The original C-drive working folder is empty. This is an independent copy of
GitHub main; no older working tree was reset or overwritten. The tracked
maintenance record was from October 23 and must not be treated as proof of
the current Play or Pages state. Prior Play review follow-up remains separate.

The user's requested D/F storage consolidation and duplicate/unneeded-file
cleanup is queued **after application improvement and release verification**.
No storage cleanup has been started. Preserve source changes, signing assets,
latest verified packages and evidence; inventory remaining files before any
deletion under `permissions.md`.

## Quiet interface request (October 25)

The user requested removal of unnecessary processing copy before publication.
Routine move confirmation, hint calculation and recovery-button text, admission
confirmation, saved-sign-in checking, online connection steps and 3D preparation
copy are no longer shown. Decorative title slogans were removed. Errors, match
recovery, ticket/consent labels, clocks, QUBE images and actual hint explanations
remain. Pending hint work keeps its stable label, disabled/busy state and cancel
control. Online waiting no longer causes a timer render every second.

201 related unit tests and typecheck passed. Existing isolated hint browser
checks passed at 390/1280 pixels, including repeated clicks, cancellation,
reduced motion, success/failure and stale replies. This UI revision supersedes
the previously prepared Web/Android packages; their hashes and Pixel timings
above remain historical evidence for the previous candidate. Rebuild and verify
the final artifacts before upload. No plans, fees or database behavior changed.

The user also requested sign-in as the primary home action. The Google button is now first and uses the existing high-contrast primary style; guest, practice and tutorial remain below it. The retained photo stays above the actions on mobile. Four matching before/after browser cases (320/390/1280 px, Japanese/English/Tamil) passed with no overflow, immediate sign-in visibility, dialog cancellation and focus restoration. The existing 32 home/session tests passed. Routine button descriptions and the unselected-board slogan were removed. CI found one old QUBE retirement assertion that required the intentionally removed thinking sentence; it now preserves the image, identity and busy-state assertions without requiring that sentence.
