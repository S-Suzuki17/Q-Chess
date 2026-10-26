# Weekly problem retrieval latency — 2026-10-26

## Change

A server board-cache miss previously awaited a `learning_weeks` request and then a separate `learning_problems` request. The store now retrieves the week and its ten boards in one PostgREST query using the existing `learning_problems.week` foreign key. The nested rows are ordered by ordinal, and missing, incomplete, duplicate or malformed sets remain unavailable.

This removes one sequential database HTTP round trip per cache miss. It does not imply a 50% reduction in the entire authenticated endpoint latency. The existing 60-second board cache, in-flight sharing, publication invalidation, live account/session checks, progress reads and atomic reward writes retain their behavior. No database migration, plan change, frontend change or native rebuild is required for this server change.

## Validation

- `npm test -- server/src/services/LearningStore.test.ts server/src/services/LearningRoutes.test.ts`: 16 tests passed.
- The store test uses the installed Supabase client with a local fetch stub to check one HTTP request, the nested relation and its ordering. No live database was written.
- Missing weeks, incomplete/malformed boards, cache expiry/invalidation, authentication denial, revoked sessions, old consent, blocked accounts, forged solutions and duplicate-publication recovery are covered by the targeted tests.
- `npm run typecheck`: passed.
- `node server/node_modules/typescript/bin/tsc --project server/tsconfig.json --noEmit`: passed.
- Initial sandbox test run stopped before executing tests because Windows denied a temporary-file rename (`EPERM`). The subsequent authorized local run passed.

## Public network sample before this change

Three unauthenticated GETs per endpoint from the maintenance PC on 2026-10-26. Total response times, milliseconds:

| Endpoint | First request | Next request | Third request |
| --- | ---: | ---: | ---: |
| Render `/service/status` | 503 | 218 | 209 |
| Web homepage | 405 | 146 | 133 |

All six responses were HTTP 200. These samples exclude login, database-backed account work, CPU search and full page rendering. They are not before/after gameplay measurements and do not establish whether the first request was a cold start. Raw local evidence: `build/network-latency-20261026.json`.

The sampled Render metrics did not show sustained CPU or memory exhaustion (approximately 0.0034–0.0045 CPU cores and 92–104 MB of memory); HTTP latency metrics were unavailable. Render's free instance remains in Virginia. [Render documents](https://render.com/docs/free) that free services sleep after 15 idle minutes and can take about one minute to restart. This code change does not remove that free-plan startup wait.

Practice and campaign CPU moves in `LocalGameBoard` use a local Web Worker. Their configured search budget is separate from network latency (the standard Hard profile allows up to 4 seconds). This change preserves CPU strength, clocks, move rules and hints.

## Release boundary

Local implementation and verification only. Await concrete approval to send this change and its tests/report to `S-Suzuki17/Q-Chess`, merge after CI and deploy Render `Q-Chess` on its existing free plan. The currently published PR #34 Web and server release remains the production baseline. Cloudflare assets and Android artifacts need no replacement for this server-only change. Roll back to the preceding Render deployment if the live endpoint check fails.
