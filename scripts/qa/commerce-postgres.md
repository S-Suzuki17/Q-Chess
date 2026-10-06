# Native commerce upgrade rehearsal

This is a synthetic, loopback-only PostgreSQL integration test. It does not
accept a remote URL, use production credentials, call Stripe, or enable sales.
The only repository dependency added is locked `pg@8.16.3`.

## Public baseline and pending boundary

The native baseline is reconstructed exclusively from the already-public
`server/src/services/fixtures/commerceDatabaseFixture.ts` and repository SQL.
It creates the same minimal pre-migration profiles, game records, deletion jobs
and restrictions tables and the same three API roles. It then executes all 17
raw historical dependency migrations listed in that public fixture. The native
list is checked against the public fixture on every run to prevent divergence.

No private schema capture, private function definition, hosted ACL snapshot,
private fingerprint, hosted project identifier or real account row is needed or
included. This public baseline is **not exact hosted-production equivalence**.
Any separately authorized private local verification remains separate evidence.

Synthetic profiles, balances and an in-flight legacy $2.99 Checkout are inserted
before the release upgrade. The native test then executes the complete reviewed
pending commerce chain verbatim, in order:

1. `20261004040000_monetization_update.sql`
2. `20261004050000_hint_tickets_store.sql`
3. `20261006000000_pricing_v2.sql`

An additional pending file causes a hard failure until the reviewed chain is
explicitly extended. The 17 historical dependencies are an explicit, bounded
public fixture, not an all-files installation or a claim about hosted migration
history. No applied history is rewritten. Unrelated historical features are not
silently counted as verified by this commerce fixture.

## Coverage

31 bounded scenarios (32 Node tests including the parent test) cover:

- Existing balances and subscription provenance across the full pending upgrade
- Closed database protocol, initially empty price bindings, and immutable catalog
- Actual independent backend PIDs and observed PostgreSQL lock waits for daily
  claims, same/different event purchase replays, monthly grants, ranked start/void,
  and hint restoration
- All six pack quantities, owner/amount/currency/payment evidence rejection,
  business-key and global event deduplication
- Integer bounds, transaction rollback, backend termination before commit and
  reconnection after a lost acknowledgement
- Single-owner reconciliation leases and rejection of superseded workers
- Same/different-event Plus monthly grant races, renewal/backfill ordering,
  before/after-renewal historical refund barriers, overlap and overflow rollback
- Ranked duplicate start, reconnect, reversed-player PvP concurrency, atomic
  insufficient-funds rejection, terminal settle/void and expired-owner recovery
- Separate stock origins, no automatic consumption of new stock by old paths,
  no change to ranked admission or receipt-pool constraints
- Profile erasure and surviving purchase replay fence
- Pre-upgrade legacy $2.99 Checkout fulfillment, daily grant concurrency,
  refund/cancellation and preservation of new stock
- `anon`/`authenticated` EXECUTE and table denials, service catalog-write denial,
  and direct RLS verification with a non-BYPASSRLS probe granted only SELECT

No test skips, todos, SQL mocks or single-connection race substitutes are used.
The whole run has a 180-second timeout, SQL has timeouts, and lock observation
has a 5-second deadline. The JSON report is written to the OS temporary directory
as `commerce-postgres-results.json`; it cannot report completion with a failed
or omitted check.

Local verification used PostgreSQL 17.6 native Linux binaries, synthetic rows
and separate TCP connections. The binaries were temporary test tooling and are
not repository dependencies. CI should independently run the official Docker
image. The example pins the currently documented official 17.11 image, providing
additional minor-version coverage; the report records the actual server version.

## Exact CI job to add under `jobs`

```yaml
  commerce-postgres:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    services:
      postgres:
        image: postgres:17.11-bookworm
        env:
          POSTGRES_DB: commerce_upgrade
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: qgambit-ephemeral-only
          POSTGRES_INITDB_ARGS: --locale=C --encoding=UTF8
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres -d commerce_upgrade"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 12
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: '24'
          cache: npm
          cache-dependency-path: package-lock.json
      - run: npm ci
      - name: Native PostgreSQL baseline upgrade and concurrency
        run: node --test --test-timeout=180000 scripts/qa/commerce-postgres.test.mjs
      - name: Retain synthetic verification report
        if: always()
        uses: actions/upload-artifact@v7
        with:
          name: commerce-postgres-results
          path: /tmp/commerce-postgres-results.json
          if-no-files-found: warn
          retention-days: 7
```

The literal password belongs only to the newly created disposable CI service.
It is not a secret or a production credential. No GitHub or provider secrets
are needed. The runner uses fixed loopback host/database/user/password values;
only the local port can be overridden with `QG_TEST_PG_PORT`.

## Remaining limits and release holds

- This is a public-dependency PostgreSQL upgrade rehearsal. Minimal account
  tables omit unrelated application schema, policies, triggers and privileges.
  Role/RLS/EXECUTE checks prove the public migration contracts only. Complete
  hosted schema and role equivalence remain unverified by this harness.
- Auth/Storage APIs, Auth lifecycle records, vault, cron jobs, PostgREST schema
  reload, hosted extensions and provider interactions are not reproduced or
  tested. No extension, SQL function, payment response or scheduler is mocked.
- The current-terms control row is synthetic committed-migration configuration.
  Live terms publication/consent and new SKU activation still need their review.
- Fresh installation still fails on duplicate historical draft
  `20260918062045_ranked_server_settlement.sql`. A public dependency upgrade does
  not fix or conceal that separate installation blocker.
- SQL calls do not prove genuine Stripe payment, signed webhook, production
  account deletion/recovery, or client/server reconnect transport behavior.
- Native success alone is not authorization to enable a product, consume the
  new stock, apply production DDL, merge, deploy, or roll back newer ledgers.

Sources used for harness design: [PostgreSQL locking](https://www.postgresql.org/docs/17/explicit-locking.html),
[node-postgres queries](https://node-postgres.com/features/queries),
[official PostgreSQL image](https://hub.docker.com/_/postgres),
[Supabase 17.11 compatibility notice](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).
