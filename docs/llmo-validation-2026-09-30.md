# Public search metadata: 2026-09-30

## Scope

- Factual English/Japanese introduction and a single public VideoGame entity.
- Homepage canonical, Open Graph and summary-card metadata; unique descriptions and self-canonical sharing URLs for existing information pages.
- Preserve gameplay, all existing locale options, private/account data, and robots/sitemap access rules.
- QUBE diary updated following the repository workflow; no external social post.

## Checks

- Focused metadata + diary suite: 10 tests passed.
- TypeScript and ESLint for metadata modules/layout: passed.
- Production static build: passed. Generated homepage, rules and about HTML contain their correct canonicals and parseable JSON-LD.
- Existing clean install fails with a missing `@emnapi/runtime` lock entry on npm 11.9. Validation used `npm install --ignore-scripts --legacy-peer-deps --package-lock=false --no-save`; dependency manifests/lockfile were not changed.
- Local build has no production backend configuration and must not be deployed as-is. Real accounts, multiplayer, mobile devices and 3D were not re-tested by this metadata-only change.

## Publication and follow-up

This branch is not a verified production deployment. Check the correct Cloudflare deployment workflow and production environment before publishing. Validate the actual HTML, redirects, robots.txt, sitemap.xml and Cloudflare Search/Training/Agent controls after deployment. A crawler error from one research client does not establish that the site's crawlers are blocked.

No claim of guaranteed inclusion or AI citation. Search crawler access is separate from model-training permission. No llms.txt or artificial ratings were added.

References:
- https://developers.google.com/search/docs/fundamentals/ai-optimization-guide
- https://developers.openai.com/api/docs/bots
- https://nextjs.org/docs/app/guides/json-ld
