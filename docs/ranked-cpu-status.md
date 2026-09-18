# Rated CPU fallback — 2026-09-18

## Scope

User approved authentication and result-storage corrections while retaining existing accounts. This change is implemented locally; it is **not a Web/server deployment, production settlement migration, or AAB release**. The earlier production default-only migration to rating1000 is separate and already applied.

## Behavior

- Ranked and casual queues are separate for10s-per-move,3m and10m. After60 seconds, a verified ranked player without a human opponent can receive a CPU. A queued human takes priority. Cancel/disconnect removes the queue entry synchronously. Up to4 CPU matches run per server; at capacity the remaining players keep waiting for a human/available CPU.
- CPU strength uses the actual selected-time-control rating read from the database, rounded to100 and bounded600–2200, with9 search levels. This is an **approximate difficulty scale, not a calibrated human Elo measurement**. CPU color is randomized. CPU identity and rated status are displayed; there is no fake human profile/rank badge.
- Server worker threads choose moves using the same authoritative rules, including king safety and promotion. Hard3s worker deadline prevents search blocking the socket event loop. Stale responses cannot move. Search failures void the game rather than award a free rated win/loss.
- The authoritative250ms tick checks clocks even if nobody sends another move. Moves, resignation, timeout and30s disconnect forfeit use one settlement path. Reconnection clears the forfeit timer.
- Completed ranked matches update the selected-time-control and overall ratings independently using EloK32 (floor0), including draws. CPU rating is fixed for that match; no CPU profile is created or updated. Other time-control ratings do not change. Casual/private matches save history without changing rating.
- A confirmed server receipt displays before/after/delta. Failed saves remain pending and retry; the client never fabricates a successful increase.

## Authentication

- Removed self-declared `SUPABASE-<id>` identity acceptance. Real Supabase JWTs are validated remotely; anonymous JWTs are not ranked identities. Auth fetches are bounded and concurrent JWT checks capped.
- Existing password accounts obtain a256-bit opaque proof after the existing `login_user` password check. Only token digests are retained server-side. Client storage is sessionStorage, never a password; proof expires after1h. Login body/rate limits and explicit revoke endpoint are present. No accounts/password hashes are migrated.
- Expiry prevents new ranked queues; it does not cut off an already authorized game. Reconnecting with expired proof requires login again. The in-memory session store assumes the existing single game-server process; restart requires re-login. Do not scale to multiple instances without a shared session store and distributed matchmaking.
- Per-participant action cache prevents a human from poisoning predictable CPU action IDs. Malformed packet bodies and superseded socket queue actions are rejected.

## Database migration (prepared, NOT applied)

`supabase/migrations/20260918062045_ranked_server_settlement.sql` was created with official Supabase CLI2.117.0, then populated and tested.

- Service-role-only `settle_ranked_match` performs profile locks, Elo updates, replay record insertion and durable settlement claim in one transaction. Stable player lock order; match-ID fingerprint rejects changed parameters on retries. The ledger survives30-day game-history cleanup.
- Service-only `ranked_protocol_version` gates ranked queue availability. Without the migration, ranked play fails closed instead of starting matches whose rating cannot be saved.
- Existing permissive profile policies allowed direct rating/password edits. Focused guards protect ID, password hash and rating fields, block client delete/reset and prevent client ranked-record writes. Existing default account creation and cosmetic updates are retained. Unrelated broad cosmetic/profile policies remain a separate security concern, not claimed solved here.
- Removes the old Elo trigger and revokes the old callable Elo writer to avoid duplicate writers. Existing ratings are never reset. Stop/drain the old game server before applying this migration; it still contains the legacy direct-update implementation.

## Verification and limits

- Web production build (including TypeScript and11 pages), server TypeScript build and targeted Next ESLint passed. Use `--config eslint.config.mjs`: the older `.js` ESLint configuration ignores TypeScript files.
- The combined targeted regression run passed201 tests across13 files. Gateway tests mock the entire database service (including boot cleanup), HTTP listener and Socket.IO before entrypoint import; real network/listen calls are forbidden. Covers actual password verification, revocation, request limits, anonymous/raw-ID rejection and async cancellation races without contacting production.
- Existing intro/badge browser regression passed5 desktop/mobile scenarios after the auth integration. Its proof is a local fixture and all external HTTP/WebSocket traffic is intercepted.
- `node scripts/qa/ranked-fallback-smoke.mjs http://127.0.0.1:3101` passed3 end-to-end browser fixture scenarios (1440px,360px,360px re-login): server-timed waiting/cancel, both CPU colors, explicit estimated-strength label without a fake badge, paused introduction, correct proof handshake, no stored password, unchanged local Circuit progress, pending→confirmed1000→1016 (+16), rejection of wrong match/user receipts, and zero browser rating/history writes or browser errors. Evidence: `../../outputs/ranked-fallback/results.json` and current queue/CPU-intro/rating-settled PNGs. Initial fixture navigation/analytics interception was corrected before the successful run; an older `*-failure.png` is not the final result. Main agent visually inspected the mobile CPU intro/result and desktop queue.
- Targeted server tests cover proof expiry/revocation, legal CPU search/promotion,60s boundary, mode/time-control separation, queue cancel/disconnect/reconnect, CPU cap, forged CPU action IDs, authoritative timeout/forfeit, stale worker replies, failure voiding, settlement retry and replay receipts.
- `scripts/qa/ranked-settlement.mjs <path-to-pglite/dist/index.js>` runs the actual migration in disposable PGlite0.5.8. All17 scenario groups passed, including permissions, credential/rating tampering, legacy registration, PvP/CPU both colors, wins/draws, independent mode/global Elo, unchanged retry, changed retry rejection, cleanup durability, missing profiles and full rollback on history failure.
- PGlite is not a substitute for multi-connection PostgreSQL contention testing. No live production users were created or modified for these checks. Browser fixture verification is not live two-device/Android verification.
- The existing server stores active games in memory. A process crash loses active games and an unsaved result that never reached PostgreSQL. This change prevents duplicate committed settlements, not durable recovery of in-flight games across server restarts. Pending results retry while the process is alive; do not restart a server with pending settlements.

## Coordinated release / handoff

1. Preserve this dirty working tree and unrelated Gemini/Codex changes. Do not reset the checkout.
2. Run targeted tests, server build, Web build and local browser fixture checks. Do not import/start `server/src/index.ts` against production credentials for QA: its legacy boot hook deletes old records.
3. On authorized publication: stop accepting ranked queues, drain active/pending old-server games, apply the migration, deploy the matching server, then publish the matching Web build. Recheck capabilities and actual account login, one human pair and one CPU fallback using dedicated test accounts.
4. Verify only the selected time-control and overall ratings change once; verify timeout, disconnect and retry in the live test environment. Keep real users' ratings intact.
5. Do not roll back to the old unverified ranked server. If release fails, disable ranked queues until the secure server/DB pair is repaired. No paid service provisioning is required by this implementation.
