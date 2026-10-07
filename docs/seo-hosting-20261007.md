# Search canonical hotfix — 2026-10-07

## Scope and baseline

- Keep the commercial game on Cloudflare Pages `q-gambit-web`, account `22a7960f7edb072b79a7cdb585ec4e4e`.
- Before this change, Pages reported production deployment `3a0ccc77-21f3-49f0-ab59-8eb7c38bc4fd`. The recorded source is `fb918e9b237b38cb1f69c7d6419846f1d98371c4`; all 21 executable/style asset names referenced by the live homepage occur in its saved export manifest.
- The live homepage lacked `rel="canonical"`. Other public pages, robots.txt and the sitemap already used the .com domain.
- Current GitHub main `90326b81b2a14f76bbf6d3eb2079e85401adf6bf` has a pre-existing TypeScript error at StripeMembershipPanel.tsx:71 (three arguments passed to a two-argument API). Do not deploy that unverified main or the unfinished PR19 as a search-only fix.
- This branch starts from the actual Web baseline, not current server main. It is not a PR reverting main. Keep the main/PR19 successor changes intact and port the small canonical/contact patch forward before their release.

## Changes

- Add one absolute homepage canonical, `https://q-gambit.com/`, and explicit index/follow metadata. Each existing article retains its own canonical.
- Validate canonical presence, uniqueness, correct host/path, initial HTML placement, robots and sitemap in both export and public-deployment checks.
- Reuse PUBLIC_SUPPORT_EMAIL in the seller contact rather than keeping a second independent literal. The actual displayed email remains `qgambit970@gmail.com`; the five published contact-bearing pages already used it.
- Include one unrelated QUBE diary post and its <=280-weight manual draft. No external social posting.

## Validation and boundaries

- `node --test scripts/release/search-metadata.test.mjs scripts/release/prepare-pages.test.mjs`: 7 passed, 0 skipped.
- Focused public release, diary and site information Vitest: 3 files, 38 passed.
- `npm run typecheck`: passed on this Web baseline.
- `npm run lint -- src/app/layout.tsx`: passed.
- Allowlisted production Web build, public review guard and commerce export guard passed. Existing legacy sales/usage flags are retained; no new catalog, ledger, advertising, or server gate is enabled.
- `node scripts/release/prepare-pages.mjs`: 209 static files / 141,753,280 bytes; audio, file-size and secret guards passed.
- No production test accounts, purchases, matches, balances, DB/schema changes or Android builds.
- Browser control cannot start due to a Windows sandbox initialization error. Initial HTML and executable-byte checks are not claimed as interactive or real-device tests.

## Publication / rollback procedure

1. Upload this checked artifact to a non-main preview branch of the existing Pages project. Verify its public HTML, index exclusion, ads.txt/app-ads.txt, real 404s, JS/CSS/model/audio byte hashes and diary.
2. Only if preview checks pass, upload the exact same directory to the existing production branch `main`. This is a Pages branch label, not a Git main merge or Render deployment.
3. Verify both .com hostnames and record actual deployment IDs in the release evidence outside the upload directory.
4. If production verification fails, restore the already saved old static directory `work/q-gambit-release-integration-20261003/build/cloudflare-pages-2026-10-03T16-02-47-716Z`, after verifying its stored manifest. Do not roll back DB or paid-account data for this metadata-only change.

## Remaining external actions

- Search Console sitemap submission and homepage indexing request have not been performed. Browser access is required; API/hosting publication alone is not a Google indexing request.
- Old Vercel host was paused and returns 503. It has not been reactivated or redeployed here. Pausing is not proof of search removal; verified-owner removal/migration requests and Google's reprocessing remain separate.
- Do not promise indexing, first-place ranking, immediate removal, or AdSense approval.
