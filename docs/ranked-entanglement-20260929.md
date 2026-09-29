# Ranked CPU candidate propagation — 2026-09-29

## Cause and scope

The rated fallback CPU and human online moves share `server/src/game/quantumChess.ts`.
Its old solver counted only single-type confirmations, unlike the practice engine's
subset-capacity solver. Three `{R,Q}` pieces exhausted two Rooks and one Queen,
but other pieces incorrectly kept both candidates. Captured superpositions were
also excluded from updates, and contradictory states could invent a Pawn fallback.
The online UI already maps all server candidates to probabilities on each snapshot;
this was an authoritative rule defect, not a CPU-only rendering defect.

## Fix

- Propagate all 63 nonempty type subsets to a fixed point on each team.
- Include captured identities in quotas and candidate updates; promoted pieces
  consume their original Pawn slot without losing promoted movement.
- Reject over-capacity moves atomically instead of accepting an impossible state.
- CPU search, human validation, public snapshots and replay deltas use that result.
- Preserve existing wire formats, ratings, rewards, BGM, advertisements and quotas.
- `/health` retains `rulesVersion: checkmate-v1` and adds uncached
  `entanglementVersion: subset-v1` for read-only deployment verification.

## Evidence

- Before the fix, 6 of 8 new regression tests failed, including a 12-ply sequence
  from the normal initial position and acceptance of a fourth Rook/Queen identity.
- After the fix, game/ranked/practice regressions: 89 tests passed (9 files).
- Includes both teams, all six confirmed quotas, captured superpositions,
  promotion, no premature elimination, immutable inputs, replay deltas, online
  glyph rendering in both sizing modes, and 64 deterministic practice-solver comparisons.
- Actual fallback runtime test receives a worker move and asserts `sync_state`
  has reduced candidates for all 13 unmoved CPU pieces; no settlement is written.
- Board tests: 33 passed. Server TypeScript build and Web typecheck passed.
- `node scratch/ranked-entanglement-worker-qa.cjs` after the server build runs the
  compiled worker thread for 4 moves each at ratings 600/1000/1800/2200: all 16
  moves accepted, every resulting position already at a constraint fixed point.
- Tests use isolated in-memory games/mocks, never real accounts or production records.
- No Android physical-device verification or live rated test match performed.

## Publication

User authorized the Render server update including possible interruption of active games.
Target: `q-chess.onrender.com`, Render service `srv-da5jpcgjo6nc73cpjjl0`.
Render login was restored after local preparation. Its Live commit is `abd80a6`.
Use the existing Git auto-deploy from `main`, preserving the already-approved Web
effects from `b01af87`; do not disable auto-deploy through a specific-commit deploy.
Deployment is NOT yet verified in this preparation record. Do not report this as
live until Render shows Live and `/health` returns `entanglementVersion: subset-v1`.
Record final production evidence separately under outputs/.
The user's latest direction makes QUBE t13 unrelated light conversation, not an
update announcement. Its publication status must be reported outside the post.

No schema migration or new client build is required for online candidate propagation.
Web/itch/Android clients connected to this server receive the corrected snapshot.
Existing historical replays are not retroactively modified.
