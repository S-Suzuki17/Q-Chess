# Profile / friends staged rollout — 2026-09-25 JST

## Scope and order

Owner approved: publish the authenticated replacement APIs, prepare the new Web and Android clients, and **only after the updated app is available in Google Play** disable legacy database access. Source publication to the existing S-Suzuki17/Q-Chess repository and linked Vercel/Render services is authorized. No Play upload is included.

1. `6f0d748`: preceding deletion/authentication hardening published. Vercel production Ready (29s), Render Live (1m05s). Three requested account deletions were completed and verified separately; no target identities are included here.
2. `1f2342d`: additive server API published before the client. Public `/account/profile/capabilities` reports version1; `/account/friends` without credentials returns401. Health, deletion and recovery capabilities return200. Existing server credentials have the profile/friend privileges needed. No new DB grants or policies in this stage.
3. The client release uses the new routes without an insecure database-write fallback. Android1.14/code19 follows code18 without replacing its delivered artifact. Ads, daily limits and preregistration distribution stay OFF.
4. Legacy browser-role DB access is **not revoked** in this release. This means the underlying legacy exposure still exists until cutover. A safer new client alone does not close that old entry point.

## Implementation

- Name changes and friendship reads/request/accept/remove derive the owner from a server-verified session. Caller-supplied owner/rating/avatar/email fields are rejected. Only public appearance fields are returned, never password hashes or recovery addresses.
- Non-anonymous OAuth users may create their own missing profile at rating1000. Legacy session proofs cannot recreate missing profiles. A read failure is not treated as a missing row; insert races reread rather than overwrite existing ratings.
- Friend IDs are validated before PostgREST filters; only the recipient may accept, repeats are safe and reverse requests do not auto-accept. Pair serialization follows the existing single-server architecture; it is not a distributed lock.
- Both participants hold operation leases until DB completion, including after an HTTP disconnect. Pending account deletion rejects new writes. No new operation can silently fall back to unauthenticated writes on timeout,401,429 or503.
- Request bodies, rates and response sizes are bounded; failure messages are generic. Expired auth is explained in all12 languages. Friends use the authenticated refresh/focus/poll path, not direct friendship-table Realtime subscriptions.
- Successful name changes update local display/cache without reloading the page. Failed saves retain the editable draft; duplicate submissions are disabled. Public profile/rating reads remain unchanged.

## Verification evidence

| Boundary | Evidence |
| --- | --- |
| API authentication and ownership | HTTP tests cover absent/forged/expired/revoked proofs, verified OAuth, mass assignment, foreign friendships, deletion barriers, concurrent writes and limits |
| API to store | Store tests inspect exact owner/recipient query predicates, name-only writes, safe projection, creation race and missing-account behavior |
| Store to production configuration | Read-only catalog checks confirm service-role profile create/rename and friend CRUD privileges; profiles remain171 |
| Shared client to API | Tests assert bearer headers, exact payloads, response owner checks, localized failure and no DB fallback |
| UI to response | Pixel10/API37 instrumentation: local fake backend, actual WebView button/form operations; rename success,401 draft retention, friend ratings1210/1220/1230 and friend request payload pass |
| Regression | 798 tests/89files;6 loopback HTTP/Socket.IO tests; shared typecheck and server build; production Android Web build pass |
| Physical Android |4 tests pass: new authenticated-profile flow plus existing recovery entry, native boundaries/gameplay/lifecycle and all15 reward MP3 decoding |

The physical profile test intercepts remote HTTP with local fixtures and blocks new WebSockets. It does not create real accounts, change a real name/friendship or prove a successful production authenticated write. Public verification is read-only/unauthenticated, per the owner's restriction. Existing Play app remains1.8/code13, separate QA app only was updated. Pixel screenshots contain an unrelated picture-in-picture video over part of the top area; the tested draft/error and three ratings were visible. Screenshots stay local and are not published.

Selected regression excludes the expensive quantum-engine suites and RankCpuSearch; those are not newly claimed verified. No new gameplay logic was changed. Browser preview loaded, no console errors on initial load, guest navigation worked. No claim of a completely bug-free or40/40-compliant product.

## Cutover gate — do not run early

- Confirm code19 (or a newer build containing these API clients) is downloadable on the intended Play track and its profile/friend operations have been checked with a consenting real user.
- Finish the remaining direct registration/auth RPC and active-match publishing migrations before revoking privileges they depend on. The current change does **not** migrate those unrelated call sites.
- Inspect current table/column grants, policies, SECURITY DEFINER function execution and ownership tests together. Do not assume a table-level revoke also removes explicit column grants.
- Announce the supported version and provide a working update route for old clients. Stage the privilege changes with tests proving ordinary clients cannot change another profile/friendship/rating, while existing accounts/passwords/ratings survive.
- Do not broaden permissions as a rollback; pause client updates or restore the previous safe UI/API if required. Do not reset ratings, delete dormant users, switch on ads or purchase a plan.

Other40-item work remains in `commercial-release-audit-20260924.md`: registration abuse, terms versioning, cloud progress, global logout, moderation and operations/monitoring. This document is the handoff for Antigravity as well; preserve the common Web/Android source and do not enable cutover merely because an AAB exists.
