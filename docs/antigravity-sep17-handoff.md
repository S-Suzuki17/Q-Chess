# Q-Gambit: implementation brief / Codex review gate — 2026-09-17

## Ownership and starting state

- UPDATED 2026-09-18: the user reversed the earlier delegation. Codex implements and verifies; Antigravity is only a future handoff destination. No prompt was sent and no model was changed in Antigravity. Read docs/sep18-status.md first for the current state.
- Work ONLY in `C:/Users/souta/Documents/Codex/2026-09-09/blender-x20/work/q-gambit-app`. This is the Q-Gambit app at https://q-gambit-seven.vercel.app/, NOT another Q-Chess checkout.
- Read AGENTS.md, docs/agent-workflow.md, docs/verification.md and applicable installed skills. No concurrent writers in this working tree. Never edit concurrently with Codex; coordinate ownership before continuing.
- main HEAD at handoff: e9be43c. Many uncommitted changes predate this work. Preserve them. No resets, broad replacements, deletion, automated git pull, push or deployment. Local verification only until Codex reviews evidence. No new AAB yet.
- The previous completion reports were NOT reliable. At audit start typecheck had 37 errors: championship definitions were old while rendering imported nonexistent material/piece/music fields. Codex repaired the current contracts and regression issues. Latest typecheck PASS and 102 tests across 9 selected files PASS at 17:08 JST. These do not establish visual, production, genuine account-write or Android-device success.

## Current local changes to preserve

- Six crafted board material families with separate nonmetal/metal surfaces; bounded merged frame geometry; vector board/effect/piece/music catalogue art; material colour + linear bump/roughness maps; backgroundless StudioReflections; owned GPU cleanup; no full-screen scenery.
- Current catalogue: 30 board + 25 sculpted piece + 20 victory effect + 15 avatar frame + 10 music rewards = 100. Stage 95 and 99 board rewards each include their matching transparent pieces. Old champion board/effect IDs remain resolvable through LEGACY_CHAMPIONSHIP_REWARDS. Original standard/slate/obsidian/copper/jade saves supported. Standard Classic/Marble/Neon cycle repaired (theme: namespace avoids marble collision).
- Fifteen unique local WAV scores: three older rewards, new zenith/valkyrie no longer aliases, ten circuit scores. Deterministic authoring script scripts/audio/render-circuit-music.mjs. Audio is loaded for selected track only. Do not claim studio-quality music just because PCM tests pass.
- Settings owns typed account/friends navigation; old lobby shortcuts removed. SettingsDialog uses native dialog for focus and Escape. FriendsMenu displays incoming/outgoing requests, deduplicated accepted friends, 10s/move + 3m + 10m ratings without tapping; error/retry and disabled mutations; public profiles batched. acceptFriendRequest checks affected rows and does NOT insert reverse duplicates. No DB schema or RLS changes were made.
- Campaign name and time-star text restored in all 12 languages; standard music reset works. The active UI uses 100 one-match stages; old four-boss rules remain only for save compatibility and old unlocks.

## New requirements from user (supersede older campaign format)

### 1. Add two board/piece design options from supplied images — ONLY these objects

Image A: `C:/Users/souta/AppData/Local/Temp/codex-clipboard-2a4176c6-5075-46cd-b4a2-f1d4c673d814.png`
Image B: `C:/Users/souta/AppData/Local/Temp/codex-clipboard-e3c67009-810e-49ef-a44b-ed7760958cf6.png`

Inspect both images. A: thick walnut frame, maple/walnut squares with restrained oriented grain, fine inlay and legible coordinates; turned Staunton clear crystal pieces with a subtle ice-blue edge. B: reflective dark board, thin cyan/magenta grid and edge trim; cyan versus magenta luminous translucent Staunton pieces. Implement selectable additions, not replacement of all materials. These can occupy appropriate new reward slots while preserving 100 total.

Do NOT copy rooms, bookcases, lamps, city, rain, characters, portraits, HUD, menus, undo or camera angle. Maintain existing backgroundless fixed board, large readable pieces, mobile portrait, DPR, no manual zoom/reset. Original 3D is free. Unresolved pieces MUST retain all remaining candidates and their optional wobble; never reveal hidden identities. Confirmed/promotion models and captured-candidate icons must remain legible. Reference images are aspirational, not valid chess positions: render a correct 8×8 board and coordinates.

Use restrained PBR/IBL, sensible roughness/IOR/thickness, limited emissive so white/black and hint overlays are readable. Avoid per-candidate refraction passes, full-screen bloom, 192 duplicated materials or heavy environments. Reflective lighting is allowed without displaying a background. Test all 32 unresolved pieces on mobile, not just 12 preview pieces. Do not promise an exact photograph/AAA match without screenshots and performance evidence.

### 2. Daily allowances + rewarded ads

- Separate allowances: hints 3/day; online matches 3/day. A completed optional rewarded ad adds 3 uses to the category shown to the player. Explicit reward CTA, visible remaining uses and reset time, no hidden cross-category consumption.
- Online use charged once when a playable match actually starts, NOT on queue/join attempts, spectator entry or failed connection. Reconnect to the same match does not consume again. Hint use charged only when a valid suggestion is delivered, not for engine errors, cancel or repeated clicks. Respect existing restrictions on hints in competitive play.
- Authoritative day/quota ledger for signed-in online play; localStorage-only enforcement is bypassable and must not be presented as secure. Do not trust client-supplied user ID or user_metadata. Validate the existing hybrid legacy-login and Supabase Auth model FIRST; if secure identity cannot be established, document the prerequisite instead of opening RLS or creating anonymous privileged writes. Atomic reservation/consumption and idempotent reward receipt, concurrent tabs/devices, replay/duplicate callback defenses. Guest limitations must be documented honestly.
- Use server UTC day with explicit local reset display unless user requests another rule. Keep purchased-by-ad bonus credits separate from daily free allowance so midnight does not silently erase earned extras. Record/confirm this assumption before finalizing UI copy.
- Existing repository only has AdSense banners; no verified rewarded-ad SDK integration. Do NOT treat an existing banner, simulated countdown, afterAd, adBreakDone, adDismissed, or a timeout as a completed rewarded view. Grant once on the provider's reward-earned completion, with supported server verification where available. Web and Android providers must be explicit. Never grant real credits from a test SDK in production.
- No ad fill / rejection / cancel / offline: no grant, show explanation and retry when appropriate, retain state and return control. No infinite spinner. Release flag must leave existing play usable until provider approval/config and server verification are actually ready; clearly distinguish staged code from enabled production monetization.

### 3. Crown Circuit: 100 stages, one first-clear = one reward

- Replace 4 boss matches per reward with one stage match per reward. Total exactly 100 stages, not 100 sets of 3.
- Sequence: stage 1 10m sudden death; 2 3m sudden death; 3 10 seconds PER MOVE. Same CPU strength across that group. Stage 4 returns to 10m with stronger CPU; repeat. Stage 100 is 10m in strength group 34. Per-move clock resets after each move, not 10 seconds total.
- Make group difficulty actually increase through the supported engine's calibrated evaluation/search/noise settings, bounded to safe mobile latency and no hidden information. A changing label or tie seed alone is NOT stronger CPU. If 34 measurably distinct strengths cannot be achieved with this engine, explicitly report the limitation, do not claim 100 independent AI levels.
- Only first clear grants corresponding catalogue reward once; replay/loss/draw cannot farm unlocks or advance. Preserve old stars, unlocked equipment and music; versioned migration with rollback-readable old data and tests, no silent reset. Map earned old championship count to at least that many new first clears; do not revoke legacy visual rewards. Stars: victory + no hints + >= half remaining time; for 10s PER MOVE define a meaningful consistent aggregate time metric (e.g. sum of used thinking time / number of completed player turns) and document it rather than giving every instant reset a free star.
- Request ONE interstitial per completed match at a natural result/transition break, after outcome/progress is saved, before entering the next stage. No mid-turn interruption or gameplay timer running behind ads. No fill/frequency cap must allow continuation. SDK/network decides availability: do not claim guaranteed ad playback every time. No double interstitial on replay/resume/rerender. Separate this mandatory-break opportunity from opt-in quota reward ads.

### 4. Avatar-frame rewards + versus introduction (latest addition)

- Add reward decorations/frames around account icons. New 100-slot catalogue proposal: boards 30, piece materials 25, victory effects 20, avatar frames 15, BGM 10. Keep total 100; preserve all previously earned IDs outside the new catalogue if needed. New look options are included, not a second duplicate catalogue.
- Frames are cosmetic only; preserve uploaded portraits and fallback initials. Render outside the image circle, do not crop faces or change existing UI theme. Locked frame previews allowed, equip gated by progress; tier progression should add crafted detail, not illegible flashing effects.
- Persist selected frame and expose only required public cosmetic ID alongside existing public profile data. Server must validate allowed IDs and ownership before accepting shared equipment. No privileged browser key, no exposure of email/password_hash, no anonymous arbitrary-profile writes.
- Before online and CPU matches, briefly show both account icons with equipped frames, usernames, and rating for the selected time control. Player ratings are actual current profile values; missing values show unavailable, not fabricated 0/1500. CPU opponent displays CPU name + difficulty, not invented human rating. Local guest has honest guest label.
- Intro must happen before clocks start and input unlocks. Online start timing must be server-synchronized/both clients ready; do not locally pause the server clock. Skip / reduced-motion mode / short duration, accessible text, mobile-safe layout. Do not replay on reconnect and do not charge match quota twice.
- No changes to image-inspired surrounding HUD; integrate this as the existing theme's transition.

## Evidence / verification gates

1. Inspect current code, report concise plan and which server/auth/ad prerequisites block release. Then implement in bounded phases; no further model/paid-service substitution without user direction.
2. Unit tests: day boundary, independent budgets, credit preservation, ad cancel/no-fill/error/duplicate completion, concurrent spending, reconnect refund/idempotency, stages 1/2/3/4/99/100, unique rewards, save migration, locked previews, relevant rating/frame display.
3. npm run typecheck; relevant npm tests; npm run test:board; npm run build. Keep exact results, not generic 'passed'.
4. Desktop 1440×1000 and mobile 360×800 / 412×915: screenshots + actual interactions for settings → friends → back, incoming accept → immediate list → all three ratings, network error distinct from empty, avatar preview/equip, intro/skip/timer start, all 32 unresolved pieces, both new finishes, 2D toggle, WebGL loss fallback. Automated tests may use explicit localhost fixtures only. Do not create real accounts or friend requests to unrelated users.
5. Update old QA assumptions: scripts/qa/reward-art-smoke.mjs still assumes 60 boards/40 effects and old IDs; circuit-update-smoke.mjs has one exact legacy time-star phrase. These scripts have NOT been rerun on the new mixed catalogue. Do not weaken assertions just to pass.
6. Recheck resource ownership and missing UVs in GLB assets before claiming procedural textures render. Validate mobile memory/draw calls; no canvas leak after repeated previews. Existing 256² texture sharing, merged trim, fixed camera must stay.
7. Write a short report at docs/antigravity-sep17-result.md: changed files, exact test commands/results, screenshots paths, incomplete items, provider/config needs. Stop for Codex review. No push/deploy/AAB or security/account settings changes during this implementation phase.

## Verified reference links (primary sources)

- https://threejs.org/docs/pages/MeshStandardMaterial.html — environment lighting, metallic/nonmetallic values, colour/data texture spaces.
- https://threejs.org/docs/pages/PMREMGenerator.html — filtered environment reflections.
- https://www.purling.com/craftsmanship — real turned/carved pieces and restrained lacquer craft; do not copy their photos/assets.
- https://developers.google.com/ad-placement/apis/adbreak — rewarded completion callbacks.
- https://support.google.com/adsense/answer/9959170 — H5 Games Ads access.
- https://support.google.com/admob/answer/6201362 — prohibited unexpected interstitial placement.
- https://support.google.com/admob/answer/6201350 — natural-break placement.
- Supabase skill requires current docs and RLS/identity review before any DB changes. Previous Codex frontend fixes did not authorize broad backend permission changes.
