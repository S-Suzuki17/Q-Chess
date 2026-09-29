# Reward effect progression

## Intent
Keep CHECKMATE typography, its motion, the perspective checkerboard and board-light propagation. Make later unlocks substantially more spectacular, not merely differently colored. Preserve saved reward IDs, unlock stages, music and the three-second result cadence.

## Implementation
`checkmate/intensity.ts` derives intensity from `requiredWins` (actual stage), not the repeating material family or the broad ten-stage tier. All 20 current effect rewards increase in particle count, reach and size. Every 20 stages adds an eruption layer, up to five. From stage 21, asymmetric tapered material trails accompany the fragments; later stages add larger foreground fragments and a broader scatter. There are no crowns, planets, mirrored rings or repeated star patterns.

Desktop stage 3 → 48 → 98: 118 → 264 → 426 material fragments, 1 → 3 → 5 eruptions, 0 → 18 → 31 trails. Compact: 75 → 148 → 229 fragments, same eruption stages, 0 → 10 → 18 trails. The initial reward retains roughly the previous material density; high-stage impact is added instead of only weakening early rewards. Debris expires by 2.8 seconds. The catalogue now captures 0.95 seconds instead of the already-fading 1.8-second tail.

The renderer keeps bounded pools and skips expired particles; animation remains outside React state. No new package, API, database or game-server dependency. Material names and acquired selections remain compatible. No audio change.

## Verification
- Tests: monotonic progression at every issued effect, bounded compact/desktop populations, finite geometry and balanced Canvas save/restore, exact final word/board equality across intensity levels, expiry, reward identity and localized names.
- Browser comparison: `scratch/reward-effects-qa/progression.html` uses the actual renderer, same-seed/same-material controls and a scrubber. This local QA surface is not included in production.
- Browser comparison verifies desktop and 360px-wide portrait canvas compositions. This is not a physical Android test. CPU-only Canvas draw timing is not a GPU/real-device frame-rate measurement.
- Confirm production through the actual Crown Circuit reward preview after publishing; do not infer publication from a local build. Continue from the existing feature branch (which contains the previous CHECKMATE integration), not the older main commit.
