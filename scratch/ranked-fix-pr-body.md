## Summary
- Show ranked allowance exhaustion explicitly in all supported locales, both during queue entry and match startup.
- Resolve captured King superpositions and reject self-elimination of the last King; verify original Knight quotas include captured pieces.
- Preserve replay compatibility and expose capture-king-v2 for server rollout checks.
- Include already-published ticket-navigation UI from 8f17aa3 and the next QUBE entry.

## Verification
- 165 test files / 1,295 tests passed.
- Typecheck, server build, 33 board tests, release Web build and commerce export checks passed.
- Desktop/mobile isolated browser fixture checked; no production purchases or account mutations.

## Deployment
- Intended targets: Cloudflare Pages q-gambit.com and Render q-chess.
- Existing ticket/membership settings retained; advertising remains OFF.
- Legacy q-chess-w8rg Vercel production is paused and its Git connection removed. No Vercel deployment is intended.
- Merge may restart Render; owner approval for Web/server rollout exists. Exact-head PR landing confirmation remains separate.
