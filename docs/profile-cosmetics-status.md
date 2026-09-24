# Profile cosmetics — 2026-09-18 handoff

## Scope and ownership

- User asked Codex to adjust `profile-cosmetics-spec.md` and implement the 3D badge UI. Codex owns these local changes; coordinate before Antigravity edits the same files.
- Starting tracked HEAD for this feature: `51b5436` (`docs: Add AAA profile cosmetics specification`). Previous board/reward work is already in that baseline; do not reapply older handoff patches.
- Unrelated pre-existing untracked files (`chatgpt_output.html`, `patch_handoff.js`, `scratch/read_chatgpt*.js`) were not changed.
- No deployment, AAB, database mutation, auth change, rating calculation change or new asset download in this feature.

## Implemented

- Settings → Account → rank-insignia panel, with 10m / 3m / 10s-per-move selection. Current badge uses only the selected rating on the matching registered profile. No fabricated guest/CPU badge.
- Six procedural 3D sculptures: beveled iron shield/pawn; silver winged knight; gold bishop beneath a transmissive lens; obsidian/tungsten battlements/rook; amethyst queen with two orbit rings; gold king with diamond and 12-point sunburst.
- Six locked/unlocked-independent previews explicitly labeled as previews, reset to actual rank, no equipment/save mutation.
- Current rank thresholds are centralized in `src/config/profileBadges.ts`: 1200/1500/1800/2100/2250/2400. Below1200 none; invalid values none. Master stays2400. Existing title helper shares the resolver.
- Actual WebGL is lazy-loaded only in the profile detail. Small match-intro/player-bar badges use matching SVG artwork; account portraits and original15 cosmetic frames remain DOM/SVG. Static rear aura added to the existing frames.
- Narrow-container layout places the badge beneath the full portrait, rather than covering it. No camera zoom, device-sensor permission, autoplay sound or flashing effects.
- Animation only during hover/focus, enabled preference, visible document and no reduced-motion request. Otherwise demand rendering. Badge-only DPR cap1.5; board DPR untouched.
- Explicit async renderer initialization catch, inner scene boundary,12-second startup watchdog, context-loss SVG fallback; owned canvas/observer/events/root cleanup. No retry loop.
-12 languages for new control/status/rank text.

## Files

- Models/rendering: `src/components/RankBadgeScene.tsx`, `RankBadgeArtwork.tsx`.
- Panel/style: `src/components/ProfileCosmetics.tsx`, `profile-cosmetics.css`.
- Rules/copy: `src/config/profileBadges.ts`, `src/locales/profileCosmeticsText.ts`, `src/lib/rankSystem.ts`.
- Integration: `LevelSelect.tsx`, `AccountAvatar.tsx`, `account-avatar.css`, `MatchIntro.tsx`, `MatchLayout.tsx`.
- Tests: `src/components/profileCosmetics.test.ts`; prepared visual script `scripts/qa/profile-cosmetics-smoke.mjs`.
- Adjusted contract: `docs/profile-cosmetics-spec.md`.

## Verification

- `npm run typecheck`: PASS.
- `npm test -- src/components/profileCosmetics.test.ts src/components/MatchLayout.test.ts src/components/boardAcceptance.test.ts src/hooks/useMoveHint.test.ts --maxWorkers=2 --testTimeout=30000`:70 tests /4 files PASS (10:57 JST).
- `node --check scripts/qa/profile-cosmetics-smoke.mjs`: PASS (syntax only, not browser execution).
- `npm run build`: PASS,11 pages generated. This compiles the Web app; it neither deploys nor verifies GPU rendering.
- Targeted ESLint for the new panel, scene, artwork, rules, translations, tests and shared rank helper: PASS. Initial inline-useMemo lint finding was corrected without disabling the rule.
- `git diff --check`: no whitespace errors at the time checked; CRLF notices only.
- Independent source review found and prompted fixes for narrow-phone overlap and uncaught async WebGL initialization. Source review is not visual verification.
- Follow-up independent source review found no remaining concrete blocker in the custom-root lifecycle and responsive positioning. Browser verification remains required.

## Remaining gates

- The earlier browser-approval blocker is resolved. Codex independently reran the local browser checks on 2026-09-18; see the completed audit below. The earlier Antigravity report alone is not acceptance evidence for unasserted interaction checks.
- Real Android GPU behavior and live-account authentication remain unverified. Synthetic document visibility events verify the suspension handler, not physical OS background behavior.
- No assertion of AAA quality or live-Web completion. Existing legacy authentication/trust limitations in earlier project handoffs are unchanged; badge display is not authorization.

## Codex follow-up audit — 2026-09-18

- Reproduced a real photo/badge overlap at390px that the old360/320px-only checks missed. Raised the container breakpoint from270 to339px; narrower stages stack the badge beneath the portrait and aura.
- Corrected malformed absolute/relative SVG coordinates in the crown frames05/10/15. The crown is now symmetric and stays above the portrait rather than forming a large stray triangle. Added3 geometry regression cases.
- Separated hover and focus states, so pointer leave does not stop a keyboard-focused badge, and blur does not stop a still-hovered badge.
- Strengthened `profile-cosmetics-smoke.mjs`:1440/430/390/360/320px; actual portrait image; equipped frame15; nonempty100-stage save stays byte-identical; photo/aura/stage containment assertions;6 previews; context-loss fallback; unmount. All5 viewports PASS. Saved30 stage screenshots under `../../outputs/profile-cosmetics`; all6 models inspected at390px, desktop/mobile layouts also reviewed.
- Replaced the previous superficial interaction script with12 actual assertions using per-canvas WebGL draw counts. Init failure, focus ring, overlapping hover/focus, still/demand mode, live reduced-motion changes, motion checkbox, synthetic hidden/visible state and Escape PASS. Static samples recorded0 additional draws; active samples recorded positive draws. Evidence: `../../outputs/profile-cosmetics/interaction-results.json`.
- Circuit regression script PASS at1440/360px plus verified-session/anonymous cases. External services mocked; no real account changes.
- Follow-up tests and current Web/server build status, online intro additions and the separately approved production rating-default change are recorded in `docs/online-rating-status.md`.
