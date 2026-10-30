# Network round-trip reduction — 2026-10-30

Base: main 9aa79010cc37aa9d86aa65ee6cd3059e58fdad89 (PR #36).
Branch: codex/network-latency-20261030.
This is a new local candidate, not a deployed release. The user requested faster
communication while retaining free services and accepting Render cold starts.
No database migration, account mutation, provider setting, paid resource, game
rule, clock, CPU budget, advertising configuration, or native version was changed.

## Changes

- src/lib/accountProfile.ts combines overlapping GETs only for the same account,
  exact bearer and endpoint, including callers with different AbortSignals.
  Each caller still resolves its current credential. Responses are not retained
  after completion and each consumer gets its own value. One cancelled consumer
  does not cancel another; the final cancellation aborts transport. The pending
  lookup is bounded. POSTs and confirmation requests remain independent, and
  writes invalidate matching pending reads before and after the operation.
- src/lib/campaignSync.ts reuses the most recently observed revision when saving
  a new local edit, avoiding the preceding GET. The existing server CAS still
  rejects stale revisions and returns the current record for conflict merging.
  Clean periodic refreshes still read remote changes. A failed/lost save response
  discards the known revision and forces a fresh read; unsaved edits remain local.
- LearningRoutes.ts and AccountProgressRoutes.ts overlap the deletion-status
  read with the authenticated owner's data reads. Identity, rate and local
  deletion checks precede those reads; no response data leaves until the live
  deletion check passes. A final local gate catches deletion begun during the
  read. Mutation authorization and revocation checks are unchanged.

The browser changes are shared by Web and Android. The server changes apply to
both clients; rules, 2D/3D rendering and CPU computation were not edited.

## Measurements

A local HTTP fixture added 120ms to each independent store read and 60ms to each
authority call. A separate client-save fixture added 120ms per request. Each
variant used the actual before/after source with six measured samples. These
are synthetic-delay results, not authenticated production or Android timings.

| Operation | Before median | After median |
| --- | ---: | ---: |
| Learning GET | 322.1ms | 190.8ms |
| Progress GET | 389.3ms | 260.6ms |
| Subsequent progress save | 254.8ms | 127.2ms |
| Six subsequent save operations | 12 requests | 6 requests |

Overlapping identical reads with separate component signals use one HTTP request;
a read after completion, mutation or bearer change remains fresh. Regression
coverage includes independent cancellation, stale in-flight replies, other users,
conflict merging, lost responses, offline edits, and deletion during reads.

Raw measurements: scratch/network-latency-20261030/measurements.json.
Local probe and preserved baseline modules: build/network-latency-20261030/.
Re-run: node server/node_modules/tsx/dist/cli.mjs build/network-latency-20261030/measure.mts.

## Validation

- 95 distinct relevant tests passed (11 suites plus the added cancellation case).
- Root typecheck and server TypeScript build passed.
- Configured synthetic Web export passed: 63 JavaScript files, zero unresolved
  public configuration reads. Six browser account scenarios passed with zero
  live mutations: sign-in entry, setup, saved session, zero balance,
  reauthentication and outage/retry.
- Android Web export also passed the same 63-file configuration check and six
  synthetic account/browser scenarios (12 browser cases total, zero live mutations).
  No new APK/AAB or physical-device validation is claimed.
- The exports use the CI fixture backend and are NOT distribution artifacts.
  Rebuild with verified production public settings after publication approval.

Initial validation found a quote in a new test title and included temporary
comparison .mts files in Next's application typecheck. The title was corrected;
comparison files were moved within this workspace to the excluded build folder.
The subsequent test and Web build passed. Product behavior was not altered to
silence either tooling failure.

## Production observations and handoff

Render's live release is still dep-dbfidt8473hc73a3i65g at main 9aa7901; the
connector confirms Free in Virginia. The first read-only release:health request
timed out at 15 seconds, then the retry returned available, maintenance false,
and no issues. Individual warm HTTP samples were 0.273s for public Web and
0.389s for service/status; these are single samples, not a latency guarantee.

The prior maintenance record identifies Cloudflare deployment
13bf1dbb-5fa7-440d-861f-0fef534a01c4 and package manifest SHA-256
7a6807545c18dd3058a790ae3b7dff497e0b174b52d8b27edc00dd25778d99fb.
Those full asset checks were not repeated. Android 30/1.25's recorded submitted
AAB SHA-256 is 42079baba2ebc5d0bc21b23c4ee6abe9a34f64538ee82f7f42b9dc60ebaef6a2;
its physical test was explicitly waived. Current Play review status belongs to
the distribution follow-up and was not re-asserted from the old record.

The recorded temporary source directory no longer exists. Published main was
recovered into a new independent workspace, with no reset/deletion of other
copies. Local-only prior files were not recovered; preserved release state is
synchronized from the original maintenance JSON. Its activeWorkspace now points
to the durable working directory. Historical pre-release notes remain historical;
the dated maintenance/distribution record is authoritative for completed releases.
The recurring prompt was corrected to preserve the Android device-test waiver
and completed AAB submission rather than request them again.

Before publication, obtain scoped approval for this additional diff, run CI,
and rebuild production Web assets. Existing immediate rollback targets are
Render dep-dbfidt8473hc73a3i65g and Cloudflare
13bf1dbb-5fa7-440d-861f-0fef534a01c4. No DB rollback is needed.
Keep Android distribution follow-up separate, retain Free, and defer PC cleanup.
