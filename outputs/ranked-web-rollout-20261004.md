# Ranked Web rollout and legacy hosting — 2026-10-04

- Web source: fb918e9b237b38cb1f69c7d6419846f1d98371c4. Cloudflare production: 3a0ccc77-21f3-49f0-ab59-8eb7c38bc4fd.
- `verify-pages.mjs https://q-gambit.com build/cloudflare-pages-2026-10-03T16-02-47-716Z.manifest.json`: 97 checks passed, 70 assets hashed, 15 reward tracks verified. No production data written.
- QUBE entry `ranked-fix-20261004` is included in the public /updates export.
- Server candidate fix is in PR #7, not yet deployed. Do not describe the CPU bug as publicly fixed until Render health reports capture-king-v2.
- Vercel Hobby project `sotas-projects-3b57e80d/q-chess-w8rg` production paused; Git connection to S-Suzuki17/Q-Chess removed. Verified q-chess-w8rg.vercel.app returns 503 DEPLOYMENT_PAUSED. Preview deployments are not removed by pausing.
- q-gambit.com and www.q-gambit.com still return HTTP 200 from Cloudflare. q-gambit-web.pages.dev has X-Robots-Tag: noindex.
- Another legacy host, q-gambit-seven.vercel.app, still returns 200 from Vercel. Existing local project metadata identifies project prj_qVV4LPhsU0v6RDGuW4FlEStxnudX / team_Ae5zXZxRPRZofDJhUp1hUcWo (sota9). Current connector returns 403 and browser account cannot access it. Owner sign-in requested; no change made there.
- Search removal is not complete. Pausing is reversible containment, not proof of deindexing. Permanent old deployment removal requires target-specific confirmation.
- Add a read-only-permission GitHub regression workflow because the disconnected Vercel integration had been the only PR check. It contains no deploy step or production credentials.
