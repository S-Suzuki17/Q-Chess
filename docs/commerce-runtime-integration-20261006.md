# Dormant commerce/runtime integration

This local merge combines commerce checkpoint
`082b7a6bbf2af2e7af3b47055b987c1d0c2e1868` with the exact fetched public PR15 head
`c9bab7cd2e309b9c76c1cf8b097b502c52b7e113`. The original commerce branch and bundle
remain preserved. Publication, production changes and activation remain held.

The payment draft is intended to stack on `prep/durable-auth-runtime-20261006`.
That base is now included in the workflow's `pull_request` branch filters.
No remote branch, PR, deployment or environment configuration was changed here.

## Semantic merge decisions

- Retain every default Vitest include pattern from both parents, including all
  six runtime-specific suites and the four new commerce suites
- Share the same 22 public historical dependencies and six pending raw migrations
  between both native jobs. Sort the explicit union chronologically and require
  exact equality with directory discovery; no pending migration is excluded
- Expect 40 files in the fresh-history diagnostic and explicitly identify the
  final runtime and atomic-commerce files. Preserve the known duplicate ranked
  settlement failure rather than rewrite or hide historical migrations
- Retain all 45 native auth/runtime and 35 native commerce scenarios, their count
  guards, original deadlines and assertions. Build the actual TypeScript adapter
  before its native test. The default suite also retains the signed synthetic
  webhook → canonical reader → adapter → real PGlite SQL tests
- Preserve the runtime diary and matching draft exactly once. No new diary entry
  or external posting was added by the merge

The six pending files, in execution order:

1. `20261004040000_monetization_update.sql`
2. `20261004050000_hint_tickets_store.sql`
3. `20261006000000_pricing_v2.sql`
4. `20261006142305_dormant_durable_legacy_sessions.sql`
5. `20261006154443_dormant_legacy_session_runtime.sql`
6. `20261006155010_atomic_commerce_fulfillment.sql`

Every one of the 40 raw migration files was compared byte-for-byte with each
parent containing it. None changed. Runtime entrypoints, authority, legacy
Stripe routes and the diary match the public runtime parent. New commerce
evidence/store/fulfillment and the legacy USD 2.99 implementation match the
preserved commerce parent. Only integration inventories, test reporting, CI
targeting and documentation were reconciled.

## Exact local results

- Full default suite: **183 files / 1,943 tests passed**, zero failed, skipped or
  todo. Ran `npm test -- --maxWorkers=1 --reporter=dot --reporter=json`; the
  repository's `assert-complete-tests.mjs` accepted the generated report
- Root typecheck and server TypeScript build passed
- Frontend `next build --webpack` passed. The initial attempt failed with
  `ENOSPC` while writing the Webpack cache; the error was preserved, capacity was
  restored, and the unchanged build command succeeded on retry
- Native PostgreSQL **17.6** with pgcrypto: **45 auth/runtime scenarios / 46 Node
  tests passed**, including the actual compiled adapter, restarted process and
  loopback socket checks
- Native PostgreSQL commerce: **35 scenarios / 36 Node tests passed**, including
  atomic RPC contention, rollback/retry and reordered paid-period evidence
- Both native runs executed the same six-file upgrade. Every applied migration
  and relevant harness/module source was hashed into their reports; the hashes
  were then checked against the final source files

The checked-in [source manifest](commerce-runtime-source-hashes-20261006.json)
records both parent SHAs, exact counts, all 28 executed migration paths, native
verification times and SHA-256 values. It separately records all 40 raw migration
hashes, which does not imply those 40 files installed successfully from scratch.
Native reports and the full default-test JSON remain local verification artifacts.

## Release holds retained

All new-commerce source gates and DB price bindings remain closed. The commerce
fulfillment modules remain unmounted; no existing environment flag activates
them. Legacy USD 2.99 subscriptions are not repriced, canceled or migrated.
Purchased and monthly hint origins retain their separate durable ledgers.

The runtime protocol remains `activationReady: false`. Its existing long-game
retention/authorization-loss decision and the commerce risk/refund, retirement,
changed-price/proration/credit, tax/terms, consumption and genuine Stripe sandbox
requirements remain unresolved release gates. No policy is invented by this merge.

The all-files fresh install still stops at the documented duplicate historical
ranked settlement migration. These local runs do not prove exact hosted schema/
ACL/extension parity, PostgREST, provider payments, production behavior, actual
browser behavior or remote CI success. Existing CI browser checks remain required;
no additional browser verification is claimed here.
