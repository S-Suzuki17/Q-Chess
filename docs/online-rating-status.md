# Online introduction and initial rating — 2026-09-18

## Scope and ownership

Codex resumed implementation at the user's request. Preserve earlier dirty work (profile cosmetics, Circuit login gate, unrelated scratch files). No Web/server deployment or AAB created in this turn. The production database default change below was separately approved by the user.

## Implemented locally

- Match intro now presents a52px badge and localized rank name for each player separately from the avatar frame; names and current match-mode ratings remain visible. Uses SVG, not extra WebGL canvases. Below1200 is unranked, unavailable data is explicitly unavailable, and CPU detail labels do not get fabricated human ranks.
- Fixed the data race: server reads each participant's actual rating with a2-second abort limit before completing connection, stores opening ratings in the initial public snapshot and preserves them on reconnect. Pending identical reads are deduplicated. Private-room roles are reserved synchronously before the asynchronous read, preventing the faster lookup from stealing the creator's color.
- Client uses the initial server snapshot immediately. For older servers, a bounded2.5-second read finishes before the3.2-second intro countdown begins. Existing authoritative paused clocks are retained. Failed/invalid reads never invent a rating or badge; stale lookup data from a different room/time control is not reused.
- New profile defaults are1000 in both Web creation and server fallback creation. Existing profile reads are not overwritten; a server profile-read or insert failure now aborts result recording instead of guessing a fresh rating and overwriting an existing account.

## Production database change — applied

- Project: Q-Chess (`gtxbvbsplfkkjlmnqath`), matched against the production environment's Supabase URL.
- Approved by user: apply1000 to new registrations now, keep existing user ratings.
- Remote migration: `20260918055703_initial_profile_rating_1000` (applied via Supabase migration API; recorded in remote migration history).
- Only changed the defaults of `public.profiles.rating`, `rating_10s`, `rating_3m`, `rating_10m` from2000 to1000.3-second lock timeout. No UPDATE, DELETE, user insertion, auth change or function change.
- Post-change catalog query confirms all4 defaults1000. Before/after159 rows, sorted rating checksum `2e0e9bcc46b0df108af82193e5cd86d1` unchanged.
- Existing `register_user` omits rating columns, so it uses these defaults. Existing deployed clients/server code that explicitly insert2000 require the pending code deployment; no claim that every old binary's explicit insert is changed by a DB default.
- To reverse only future defaults, set the same4 defaults back to2000; do not update existing rows.
- Supabase security advisor before/after unchanged:5 mutable function search paths,3 anonymous and3 authenticated executable SECURITY DEFINER warnings, and disabled leaked-password protection. No automatic auth-policy edits were made in this scoped migration. References: [search path remediation](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [function access remediation](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Verification

- `npm test -- src/lib/onlineRatings.test.ts src/lib/gameRecordService.test.ts src/components/profileCosmetics.test.ts src/lib/__tests__/circuitAccess.test.ts server/src/game/intro.test.ts server/src/services/ratings.test.ts --maxWorkers=2`:79 tests /6 files PASS.
- Web `npm run build` PASS, including TypeScript and11 generated pages. Server `npm --prefix server run build` PASS. Server-only tests live outside frontend `src/` so their non-strict engine implementation is not inadvertently pulled into the frontend typecheck.
- Targeted ESLint PASS (0 errors; existing `AccountAvatar` img optimization warning retained). No broad lint cleanup performed.
- `node scripts/qa/online-intro-smoke.mjs http://127.0.0.1:3101`:5 scenarios PASS. Uses actual compiled GameEngine snapshots, isolated HTTP/WebSocket fixtures and2D board to isolate intro behavior; never starts server/index.ts or forwards external requests. Tests desktop1440, mobile360/320/390;10m/3m/10s ratings; REST failure with valid server snapshot; delayed legacy response;1000 new user; unavailable ratings; paused clocks; skip acknowledgement. Screenshots visually inspected at1440/360/320px. Evidence: `../../outputs/online-intro/results.json` and PNGs.
- Real two-device online pairing, real Android GPU, deployment and AAB are not covered. Do not label mocked protocol tests as live service verification.

## Follow-up request: rated CPU fallback

User subsequently requested that long-wait ranked matchmaking fall back to a rating-appropriate CPU and still change rating. Proposed wait is60 seconds, explicitly label CPU. Preliminary audit found prerequisites:

- Ranked/random mode is currently discarded at LevelSelect → page → socket; queue is only separated by time control.
- Legacy socket auth accepts literal `SUPABASE-<id>`, so ID possession is incorrectly treated as identity. Real rated CPU must not be built on that shortcut.
- Result recording currently hardcodes10m, is not transactionally idempotent and does not persist match ID as a settlement key. Existing DB trigger also needs sole-writer coordination to avoid double updates.
- Timeout and disconnect completion paths must reach the same server-owned finalizer, otherwise users can avoid rating losses by not sending another move.
- Browser CPU engine uses a different board/rules representation. Use a server-native worker/search over authoritative legal moves or prove adapter parity before reuse.

The user approved authentication and result-storage corrections. Local implementation and verification are tracked in [ranked-cpu-status.md](ranked-cpu-status.md). The new settlement migration and Web/server deployment have not been applied to production; the earlier default1000 migration remains the only production change in this turn.
