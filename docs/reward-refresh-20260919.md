# Reward refresh — 2026-09-19

## Scope and design

Refreshes victory effects, reward previews/results, avatar frames, board relief and reward piece sculptures. Uses the supplied LunchTime and Shadowverse interviews and the Gemini reference (https://share.gemini.google/D1F5Pet6uUjB) for design principles only: anticipation/impact/tail, clear primary shapes, limited palettes, physical material details and bounded secondary particles. No third-party artwork, models or performance claims were copied.

- 20 existing victory rewards retain IDs and progression; four families now have distinct animated geometry: mechanical orbits, refracting crystal, comet/constellation cascade and a forged crown. Canvas2D overlay avoids another WebGL context, stops after the shot, pauses in hidden tabs and respects reduced motion.
- Effect preview offers replay and uses the same renderer for catalogue stills. Result headings remain separate from the cinematic area.
- 15 avatar frame IDs retain their unlocks, with layered metal/enamel, facets, laurels, wings, circuitry and crowns.
- Boards gain bounded side relief. Reward pieces use five authored families with separate pawn/rook/knight/bishop/queen/king heads, shared geometry and low-detail quantum candidates. Standard and late-game reference glass pieces remain intact.
- Only the collection preview gets a fixed angled camera. Gameplay stays fixed, background-free, with its existing resolution and camera.

## Music progression

The 10 stage BGM rewards remain. Five additional existing tracks were still tied to legacy four-boss/lap progression and were unreachable from a new current-stage save. They now unlock from the sum of each stage's best stars (maximum 300):

| Stars | Track |
| --- | --- |
| 30 | Ivory and Stream |
| 75 | Rain on the Board |
| 120 | 盤上の幾何学 |
| 180 | Twelve Moves Ahead |
| 240 | The Eighth Rank |

Existing legacy acquisitions remain valid. Repeated attempts do not add duplicate stars. Unlocks derive from existing saved progression; no new database field or production data migration is needed. Collection shows threshold, remaining stars and previews; newly earned tracks appear on the result. New text covers all 12 supported languages.

## Verification and handoff

- 151 tests passed across 15 affected test files: scene lifecycle/geometry, result duplication and no loss celebration, reward bounds/IDs, sculpture types/LOD, model library, camera/layout/hints, music thresholds/save-load/legacy grants and cosmetics UI.
- Production-config Web build and TypeScript passed. Build helper keeps advertising and quotas OFF.
- Local browser review: desktop and 390×844 portrait; four effect families, replay/close, win/loss result layout, avatar gallery, boards/pieces and star transitions. No browser errors; an existing Three.js Clock deprecation warning remains.
- Local-only harness: scratch/art-qa (not shipped). Uses actual components/functions with synthetic progress, no account or server writes.
- Android versionCode 16 / versionName 1.11. Bundle generated, all 179 packaged Web assets match out/, certificate matches code 15, portrait+resizable retained, no advertising identifier permission.
- Still pending at this commit: Vercel promotion/public smoke check, final bundletool/JAR validation and artifact copy. Final evidence belongs in outputs/release-1.11-code16/README.md outside the repository.
- Not performed: physical Android interaction/performance profiling, production account/game/progression writes, Play Console upload, server or database deployment. No paid resources added.

Work lives in the isolated release copy/branch. Do not overwrite the Antigravity working tree. Push only to S-Suzuki17/Q-Chess release/admob-prep-music-20260919, then promote that commit in Vercel q-chess-w8rg (Sota's projects); do not push main/trigger the game server.
