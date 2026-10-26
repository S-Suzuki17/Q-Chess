# Free-tier runtime and input optimization — 2026-10-26

## Scope and release boundary

The user asked to optimize the remaining causes of delay while accepting Render's
free-service cold start. Base: `45963838ab2d31bb22a77b62f6032961e2f529c6`
(PR #35). These changes are locally verified and prepared for publication; they
are not production evidence. No paid resource, DB change, production configuration
change, account action or Play upload was performed.

## Implemented

- `src/lib/cpuClient.ts` retains at most one completed browser Worker for 30
  seconds. It releases idle memory when the page hides. Simultaneous CPU/hint
  requests have independent workers. Abort, timeout, worker error, deserialization
  error and failed postMessage discard the worker. Request IDs reject stale replies.
  Search profiles, strength, evaluator and time budgets are unchanged. Search
  caches remain local to each `searchBestMove` invocation.
- `GameEngine.getTurnStatus()` returns only scheduling scalars and preserves the
  existing authority-loss clock freeze. `RankedRuntime` avoids full snapshots on
  idle/CPU-busy ticks and reuses the snapshot already broadcast after an action.
  Full wire snapshots, clock calculation, authority fences, settlement, refunds
  and old-client compatibility are preserved.
- `LocalGameBoard` selects another friendly piece with one click/tap. Previously,
  that input was rejected as an illegal destination and cleared the selection,
  requiring another input. Selecting a piece does not move it. Same-piece
  deselection, opponent inspection, turn checks and move validation remain.
  This handler and the CPU client are shared by Web and Android.

## Measurements

All timings below are local Chrome/Node measurements, not Internet, Render,
physical-display or Android-device timings. Timing differences between individual
samples are not speed guarantees.

| Check | Before | After |
| --- | ---: | ---: |
| CPU repeated response median (Easy, 18 warmed samples) | 89.5 ms | 42.3 ms |
| CPU repeated response p95 | 108.7 ms | 69.2 ms |
| Workers created for 20 requests | 20 | 1 |
| Full snapshots, 32 idle games × 1,000 ticks | 32,000 | 0 |
| Time for those ticks, final clock-freeze-preserving version | 77.91 ms | 8.33 ms |
| Inputs to select another friendly piece | 2 | 1 |

The CPU comparison used unchanged depth 0 / 1,000ms budget / seed 1234 across
20 successive legal positions. All returned moves matched and caller state was
unchanged. This does not imply that the Hard CPU's 4-second search becomes 42ms.

The actual published Web package (PR #34, deployment
`0bb63189-30b8-4530-acf1-2fce415bd8ba`) was compared with the new Web export at
1440×960 and 390×844, in 2D and genuine WebGL 3D with normal motion enabled.
Selection DOM medians changed 2.8→2.5ms (desktop 2D), 3.9→4.3ms (desktop 3D),
4.0→3.2ms (mobile-width 2D), 5.4→4.0ms (mobile-width 3D). These small mixed
differences do not establish a broad input-latency improvement. The reliable
interaction improvement is one-click reselection. New-build human move DOM
reflection took 5.4–8.3ms in four scenarios, followed by a valid CPU reply.
Two-animation-frame timings are also saved, without claiming physical paint time.
The GPU was Intel Iris Xe / ANGLE D3D11; mobile widths were desktop emulation.

The 100-tile fixture separately passed actual entry, friendly-piece reselection,
no accidental move on selection, human capture and CPU response at both widths.
Its account/progress/ad transport was synthetic; the board and CPU were real.

## Evaluated but not enabled

WebSocket deflate reduced a representative board from 4,091 to 615 received bytes
(about 85%). However, 16-client burst tests increased broadcast latency; the
compressed p95 reached 26.69ms versus 2.98–4.10ms without compression. It remains
disabled because the task is responsiveness on limited CPU/memory. Both
non-compressing clients and HTTP polling preserved the board data. The first
probe compared wire JSON with an object containing undefined keys; it was fixed
to compare equivalent wire JSON before the successful run. Socket.IO's official
[per-message compression documentation](https://socket.io/docs/v4/server-options/#permessagedeflate)
also describes the performance/memory tradeoff.

The configured Render region is Virginia and the existing DB region is Tokyo
(read-only configuration evidence from this task). Region proximity remains an
unmeasured candidate. Render's [region documentation](https://render.com/docs/regions)
requires a new service to change region. A separate proposal would first compare
a temporary read-only Singapore probe with the current service, explicitly using
free compute and the available shared quota. Do not start a second full production
app with its background jobs. Only a measured improvement would justify a planned
active-match drain, endpoint switch, verification and rollback to the existing
service. No new service or region migration is authorized or performed here.
Existing API preflight caching (`cors({ maxAge: 86400 })`) was already present.

## Validation and artifacts

- 308 distinct relevant Vitest cases passed across the scoped runs: worker
  lifecycle, shared rules/search, candidate propagation, clocks, replay, ranked
  authority and real loopback Socket.IO/HTTP integration. The initial combined
  run found one obsolete QUBE Worker mock (updated for request IDs) and an
  integration setup timeout; isolated rerun passed all 43 affected cases.
- Root and server TypeScript checks passed. Final production Web build passed,
  with 63 JavaScript files checked and zero unresolved public configuration reads.
- Eight before/after practice browser scenarios and two 100-tile fixture scenarios
  passed. The initial input probe also reproduced the reselection defect. An old
  fixture selector was replaced with the current visible “挑戦する” button.
- Existing Web public-content/release guard passed for eight public pages.
- Web candidate: `build/cloudflare-pages-2026-10-26T09-31-09-612Z`, 261 files,
  143,962,916 bytes. Manifest SHA-256:
  `7a6807545c18dd3058a790ae3b7dff497e0b174b52d8b27edc00dd25778d99fb`.
  This package has not been uploaded.
- Raw local evidence: `build/free-runtime-latency/result.json`,
  `final-server-result.json`, `socket-compression.json`, `input/result.json`,
  `campaign/result.json`, `regression-retry.log`, `web-build.log`.
- Reusable probes: `scripts/qa/free-runtime-latency.mjs`,
  `free-socket-compression.mjs`, `measure-board-input.mjs`,
  `free-campaign-runtime.mjs`.

## Android and follow-up

Source candidate remains Android 30 / 1.25. The final native build, signature /
embedded-Web verification, device testing and Play upload are still pending.
The recorded SDK and JDK on F: were unreadable during this run. The user has said
the connection cannot currently be stabilized; do not repeat the reconnect prompt
without new evidence. Previous APK/device evidence does not cover this revision.
No ad configuration or native feature flags were changed.

Prepare concrete GitHub/Render/Cloudflare publication approval for this diff.
Rollback targets remain Render `dep-dbfh2tajnfac73eolnn0` and Cloudflare
`0bb63189-30b8-4530-acf1-2fce415bd8ba`. Keep the Android publication gate closed
until a matching final native artifact is verified. Storage cleanup stays deferred
until the application work is complete.

## Documentation/code discrepancy found

`docs/verification.md` still called 26 / 1.21 the current candidate and 25 the
submitted version, while `android/app/build.gradle` specifies 30 / 1.25 and the
maintenance/distribution record is newer. The verification instructions now require
checking the actual Play record and Gradle version instead of retaining obsolete
version literals. The Gradle version was not changed.
