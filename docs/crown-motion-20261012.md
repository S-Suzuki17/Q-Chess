# Crown character and Android update

## Behavior

Crown room entry, opponent reveal and the board handoff now use short finite motion. The introduction can start immediately, cancel, return on Escape/back and restore focus to the challenge action. The game clock remains paused during the introduction. Hidden pages stop owned media; cancellation, replacement and unmount release timers/listeners. Reduced motion, low resources, media failure and delayed loading keep controls available and use a static or lightweight fallback.

Six original characters use one plain name each: Pawn Seia, Knight Kyle, Bishop Sol, Rook Dorn, Queen Aster, King Aureus. Stages 1–99 repeat Pawn/Knight/Bishop/Rook/Queen; stage 100 uses King. Stage IDs, CPU/search settings, clock controls, progression and rewards are unchanged. Selection, introduction, board, result, next-stage copy, accessible labels and newly saved computer histories use the shared catalogue.

For an explicitly server-confirmed online CPU, a stable FNV draw from the existing server-random match UUID selects one of the six unique IDs. It consumes no gameplay randomness. Rendering, reconnecting and results keep the same choice. A human whose name contains “CPU” keeps their own identity and avatar. Normal CPU practice keeps its existing CPU difficulty/name and generic introduction.

The generic QUBE caption and “with QUBE” label are removed. QUBE's seated artwork, speaker identification, operational status and actual instructions/hints remain. Board piece models/materials and the directly drawn PixelCastle are unchanged. Saved 2D preference is read before the initial board renderer mounts.

## Asset production

`scripts/assets/create-crown-characters.py` actually authored and rendered the six separate heads, faces, short bodies, hands, feet and piece-specific equipment in existing Blender 5.2.2 LTS. `art/crown-enemies.blend` is the editable master; `art/crown-character-creation.json` contains output hashes. `scripts/assets/export-crown-character-catalogue.cjs` exports the shared catalogue for reproduction. Full/atlas PNGs total 798,076 bytes. Only the active character loads; compact/reduced presentations skip the atlas. Full-image/atlas failures select exactly one available representation or the original SVG fallback.

`scripts/assets/render-crown-entry.mjs` creates original Canvas2D light/dust and synthesized PCM audio, using the existing Chromium renderer and FFmpeg VP8 encoder. The silent 1.8-second video is 33,848 bytes; the sound cue is 79,424 bytes and follows existing mute/volume settings. See each asset directory's `PROVENANCE.md` for production and rights provenance. Obsolete task-generated vector prototypes are archived under scratch and excluded from runtime output.

## Verification

Evidence is in the owning chat's `outputs/` directory:

- `crown-six-character-unit-20261012.log`: eight related files / 122 tests, including stage assignments, six-entry match selection, confirmed-CPU guard, QUBE instructions and hint/board presentation preservation.
- `crown-private-record-final-unit-run2-20261012.log`: focused updated name allowlist/record binding tests. The preceding sandbox EPERM attempt ran zero tests and is not counted as success.
- `crown-six-character-motion-20261012/result.json`: 18 real-component browser conditions, including 320/390/844/1280 layouts, cancellation/back/focus, paused 10-second intro, hidden/reduced state, audio mute/volume, 3D and forced 2D fallback, practice and real board input.
- `crown-six-character-assets-20261012/result.json`: 11 full/atlas composition, independent failure/delay and fallback conditions.
- `crown-android-npc-{white,black}-20261012/results.json` and `crown-android-human-name-20261012/results.json`: three focused production-config Android-export cases. Both CPU colours preserve names/portraits on reconnect; human “CPU 01” is not replaced.
- `crown-text-scale-20261012/result.json`: German Crown at 375px with doubled computed text sizes; no horizontal overflow, challenge reachable, final King and real board selection retained.

Tests block/mock external transport. Identity, progress and admission are synthetic; actual components, local engine, boards, media and compiled online engine execute. No production account, queue, consent, tickets, rating, rewards or DB data were written. Desktop Chromium viewport/resource/font overrides do not certify physical Android hardware, OS font scaling, Play-distributed auth or GPU performance. Physical Android testing is not completed.

TypeScript and server compilation passed. Baseline lint has three LocalGameBoard errors, one OnlineGameBoard error and two pre-existing SupabaseService prefer-const errors; the new online callback dependency error was fixed. Final baseline comparison records the existing errors rather than treating lint as wholly successful.

## Android and release boundary

The update remains `com.qgambit.app`, versionCode 21 / versionName 1.16, above the observed uploaded 20 / 1.15. Build with the existing configured project through `build-android-web.cjs`, sync Capacitor, use the existing signing key and verify the AAB's package/version/signature and every embedded Web file against the final export. The final receipt binds the artifact hash and source revision.

The approved public build helper keeps Android sales, external billing, membership links, advertising, native rewards and engagement metrics off. Existing configured usage flags default off and are preserved; this visual update does not enable new monetization or ticket switches. No environment file or signing credentials are copied into release documentation/output.

The new backend patch allows only curated computer history names and derives ranked CPU names from the same UUID. It changes no DB schema or existing rows, authentication, namespace IDs, rating, clock or rewards. **Deploying that backend patch is required before rolling out durable new-name histories; it has not been deployed by this task.**

The source work and signed AAB preparation do not merge/push a PR, publish Web/Render or roll out a Play track. The supervisor owns Play Console upload and separate release decisions. Other onboarding/CPU-practice worktrees remain separate.
