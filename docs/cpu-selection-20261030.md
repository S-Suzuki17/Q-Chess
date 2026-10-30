# Preserve the first selection across a CPU reply

The user reported that pieces need a second tap in both 2D and 3D. In the exported app, selecting h2 after the player moves e2-e7 loses the selection when the CPU replies. The panel then falls back to the last-move square e7. Ordinary taps outside that handoff already worked.

`LocalGameBoard` now retains a selected friendly piece across local CPU/room replies and authoritative Crown updates while the piece still exists and is not captured. A submitted player move, captured/removed/enemy selection or ended game clears it. The existing turn/pending checks still prevent premature moves; legal destinations are recalculated from the updated position. This changes shared Web/Android source, not the chess rules, clocks, hints or tickets.

## Verification

- `npm test -- src/lib/boardSelection.test.ts src/lib/localMoveDestinations.test.ts`: 13 cases pass.
- `npm run typecheck`: pass.
- `npm run test:board`: 98 cases pass.
- Production-configured Web export: pass, 63 JavaScript files and no unresolved public configuration.
- `node scripts/qa/measure-board-input.mjs <PR37-export> <candidate-export> build/network-latency-20261030/selection-regression`: eight observations, four before and four after, covering desktop mouse/mobile touch and 2D/3D. All four baseline cases lose h2; all four candidate cases retain h2 and accept one h4 destination input. No page errors. External requests are blocked and only guest practice is used.
- Browser measurements are synthetic Chrome tests on this PC, not Android physical-device evidence. New native APK/AAB has not been built or submitted. Authenticated Crown behavior is covered by the shared update logic/unit cases; no paid live challenge was started.

## Separate Web startup incident

Production deployment `8330cf3b-336f-4724-8afc-ff7f0ba89915` had 17 of 20 entry scripts and four 3D models missing. The source models matched the previous good deployment. Cloudflare production automatic deployment was enabled despite empty build/output/variable settings. The user explicitly approved disabling only main's automatic deployment. Git integration and preview deployments remain connected.

The already approved PR #37 was merged at `6c82ab2b6361fe50b633152424c7f7f0da7e43d3`. Its complete 261-file package was published as `2aaff088-41bf-423a-91a3-40097475ade1`; both the deployment URL and q-gambit.com passed 114 checks including 80 asset hashes. Render deployment `dep-dbi2rcivcj2c73c3su10` is live and its status is available, maintenance false. This restoration package does not contain the selection fix described above.

Documentation discrepancy: `docs/release.md:20` says GitHub pushes do not deploy Cloudflare; the actual q-gambit-web production branch configuration had automatic deployment enabled with no build setup. The approved configuration change restores the documented verified Direct Upload workflow. No paid resources or database changes were used.

Raw local evidence is under `build/network-latency-20261030/`, including the preserved failing baseline, successful candidate, deployment logs and verification reports. These operational files are not published in Git.

## Crown follow-up

The Crown coverage above was limited to the acknowledgement/helper, not the optimistic CPU move path. A later user report reproduced a reset in that remaining path. See [the Crown-specific follow-up](crown-selection-20261030.md) for the correction and authenticated synthetic-browser evidence.
