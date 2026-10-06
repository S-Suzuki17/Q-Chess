# Dormant durable legacy sessions

Status: local code/native verification only. This migration does not select an
application adapter, enable a feature, change defaults, install a scheduler,
deploy a server, or authorize production DDL. The protocol deliberately returns
`activationReady: false`; Socket.IO cross-instance behavior remains a release hold.

## Provenance and scope

`20261006142305_dormant_durable_legacy_sessions.sql` was generated with official
Supabase CLI 2.119.0 `migration new dormant_durable_legacy_sessions`, after command
help discovery. This reconstruction starts at public commit `c4f9e4b`; the lost,
unpublished earlier filename is not represented as applied history. No historical
migration file is rewritten. No private schema capture or production row was used.

The final native suite reconstructs **22 explicit raw public dependencies**:
six auth dependencies, including the actual `login_user`, recovery/reset and
self-service deletion implementations, plus the 16 commerce dependencies not
already applied. Ranked settlement is the sole shared historical dependency.
It then applies **all four pending migrations in one database**, in order:

1. `20261004040000_monetization_update.sql`
2. `20261004050000_hint_tickets_store.sql`
3. `20261006000000_pricing_v2.sql`
4. `20261006142305_dormant_durable_legacy_sessions.sql`

The fixture exports `combinedHistoricalMigrations` and
`combinedPendingMigrations`, compares commerce dependency lists with the public
TypeScript fixture, and asserts directory discovery exactly equals the four-file
pending inventory. Every statement executes as raw SQL. The real public auth
deletion/restriction tables are used rather than commerce's minimal stubs. All
35 auth scenarios run on this combined upgraded schema, and commerce protocol
sales/spending/reversal gates remain closed with zero price bindings. The native
commerce fixture now delegates to the same helper: its **unchanged 31 commerce
scenarios** execute all four pending files, with the new session triggers present
during billing, refund, rollback and profile-erasure checks. Both suites use
separate fresh databases with the same combined schema. This is direct
coexistence evidence, not a claim based only on disjoint migration fixtures.

Synthetic Auth/Storage relation scaffolding is declared in the fixture. This is
neither exact hosted-schema equivalence nor an all-files installation test.

## Exact service RPC contract

All public RPCs are `SECURITY INVOKER`, have `search_path=''`, check
`current_user='service_role'`, and revoke PUBLIC/anon/authenticated execution.

| RPC arguments | Result |
| --- | --- |
| `legacy_session_protocol_version()` | `{version:1,activationReady:false}` |
| `issue_legacy_session(p_user_id text,p_password text,p_token_hash text,p_persistent boolean)` | `{ok:true,userId,incarnation,generation,persistent,issuedAt,expiresAt}` or `{ok:false,error}` |
| `verify_legacy_session(p_token_hash text,p_expected_user_id text default null)` | `{status:'invalid'}` or `{status:'revoked'}`; otherwise `{status:'valid'\|'expired',userId,incarnation,generation,persistent,issuedAt,expiresAt}` |
| `revoke_legacy_session(p_token_hash text)` | `{revoked:integer}` (0 or 1) |
| `revoke_user_legacy_sessions(p_user_id text)` | `{revoked:integer}` (newly marked rows, including expired rows) |
| `cleanup_legacy_sessions(p_limit integer default 100)` | `{deleted:integer}`; accepted limit is 1–1,000 |

Issue failure values are exactly `INVALID_REQUEST`, `INVALID_CREDENTIALS`,
`STALE_AUTHENTICATION`, `TOKEN_CONFLICT`, `CAPACITY`. Failure commits the real
password-attempt counter when password verification fails normally. Unexpected
database/transport failures remain errors, never fake credential failures.

`generation` is a decimal **string**, from zero through PostgreSQL signed bigint
maximum; `incarnation` is a UUID string. Timestamps are native JSON timestamptz
strings; adapters must validate them without assuming millisecond-only formatting.
No result contains a password, bearer, token hash, email, raw error or row dump.

The eventual adapter generates a high-entropy bearer, hashes it with SHA-256, and
returns the bearer only at issue time. SQL accepts a lowercase 64-hex digest;
the shape check cannot prove that the server hashed it. Adapters must redact
upstream errors, fail closed with a static unavailable classification, and never
fall back to local session state. Ordinary auth accepts only `status:'valid'`.

Issue and verify require **READ COMMITTED**. Other transaction isolation modes
raise static SQLSTATE `25000`. An advisory lock cannot refresh a REPEATABLE READ
snapshot: without the guard, admission could count stale rows or verification
could authenticate an already revoked row. Tests exercise READ UNCOMMITTED,
REPEATABLE READ and SERIALIZABLE rejection with a concurrent revocation.

## Transaction/race design

1. A bounded-time write-conflicting profile lock makes backfill and provisioning
   atomic. Existing and newly inserted profiles each receive a random incarnation
   and generation zero. Migration timeout rolls everything back
2. Issuance reads incarnation/generation without locking **before** calling the
   actual public `login_user`. Missing state fails closed and is never created
   lazily on login
3. That public function performs `profiles FOR UPDATE`, deletion checks, native
   `extensions.crypt` bcrypt and the shared ten-attempt/minute budget. Its call
   and session insertion occur in the **same transaction**, never separate RPCs
4. Issue re-reads/locks the account epoch after the profile lock, rejecting a
   changed incarnation or generation. Logout/reset/ID reuse cannot admit waiting
   stale authentication; a genuinely later password login can succeed
5. Invalidation orders locks profile → account epoch → session rows. The bigint
   increment is guarded against overflow, so reset/deletion/logout roll back
   rather than wrapping a security fence. The practically unreachable exhausted
   epoch would require separately reviewed maintenance
6. A password trigger invalidates only an actual `password_hash` change. An
   unchanged hash update does nothing. Reset and invalidation commit together
7. A BEFORE INSERT deletion-job trigger invalidates durable intent, including
   `INSERT ... ON CONFLICT` ticket rotation. A profile DELETE trigger also
   invalidates before FK cascades erase all session/epoch rows. No retained
   account-hash tombstone or new account-deletion retention contract is introduced

The public login/reset/begin-deletion definitions remain byte-identical.
`erase_account_data` receives one additive, public-source-only repair: replace
job-first locking with an unlocked job read, profile lock, then locked ticket/
target recheck. A rotated-away ticket fails before erasure. The native suite
compares every other byte of its body with the original public migration.
Storage validation, erasure, receipt retention and cancellation policy are
unchanged. Deterministic two-backend tests exercise both orders of rotation/
erasure plus rollback; this does not prove every lifecycle/provider race.

## Lifetime, capacity and privileges

- OFF lasts one absolute hour; ON lasts 720 absolute hours (30 days). Hour
  intervals avoid calendar/DST shifts. Verification never slides or refreshes TTL
- Token revoke changes one token only. Global revoke advances the epoch even if
  there are zero sessions, fences pending issue, and marks prior rows. It is not
  a permanent ban and does not add a new user-facing per-device logout feature
- Restrictions preserve authenticated identity for recovery and deletion;
  game-operation policy must enforce restrictions separately
- One transaction advisory lock serializes admission across accounts/processes.
  A partial expiry index supports the 10,000-active global capacity. Full capacity
  rejects without eviction; expiry/revocation only reduce the active count
- Explicit revocation wins over natural expiry. Expired identity is retained
  briefly as evidence, **not** as ordinary authentication or a socket grace policy
- Cleanup uses an indexed ordered selection with `FOR UPDATE SKIP LOCKED`, at
  most 1,000 rows per call, only after revocation/expiry is over 24 hours old.
  No cadence is enabled. Activation review must choose safe cleanup cadence and
  independently justify any live-game continuation/retention rules

Both private tables have forced RLS and no browser grants or policies.
`service_role` may select account state and update **generation only**, with no
INSERT/DELETE/incarnation privileges. It can insert/select/delete sessions and
update only `revoked_at`/`revocation_reason`.

The sole new DEFINER exception is the private argument-free AFTER INSERT trigger
`qg_private.provision_legacy_session_account()`, explicitly owned by `postgres`.
It has an empty search path, fully qualified table names, no dynamic SQL and no
external EXECUTE grant, including to service_role. It inserts only `NEW.id`;
defaults choose the epoch. This preserves ordinary authenticated profile signup
without giving browser roles private state writes. Tests prove signup works,
while direct helper calls, private enumeration and private writes are denied.

## Native verification and recovery evidence

Newly reconstructed bytes were rerun first as a focused checkpoint and then on
the combined four-file upgrade, on native PostgreSQL 17.6 with the actual pgcrypto
C extension: **35 session scenarios / 36 Node tests pass**. After the commerce
fixture adopted that shared baseline, both suites ran again: **31 commerce
scenarios / 32 Node tests** and **35 session scenarios / 36 Node tests** pass,
zero skipped scenarios, failures or omitted assertions.
The report records actual PostgreSQL version, verification time and SHA-256 of
the migration/fixture/harness files. Earlier reports are historical coverage
guides only, never proof for reconstructed source.

Coverage includes observed PostgreSQL locks and distinct backend PIDs, separate
process session reuse, pre-commit disconnect rollback, post-commit acknowledgement
loss, both orderings of logout/reset/deletion against issue, no-op/reset rollback,
first-use state, ID reuse, expiry/revocation separation, duplicate hashes, insert
fault rollback, overflow/constraints, capacity, indexed bounded cleanup, signup,
least privileges, EXECUTE guards and a forced-RLS probe.

The acknowledgement-loss scenario now pauses the real native PostgreSQL client's
incoming TCP stream **before** sending issuance, observes the committed row from
an independent backend while the issuance Promise is still unresolved, then
destroys the paused connection and asserts rejection. A fresh connection verifies
that exact committed proof; one session row and one password attempt establish
that issuance was not retried. This proves the native SQL transport boundary,
not PostgREST/HTTP acknowledgement loss. Earlier checkpoints that awaited the
successful issue result before disconnecting proved only committed-session
survival; their acknowledgement-loss label was not supported by that test.

Against a fresh ephemeral PostgreSQL 17 service:

```sh
node --test --test-timeout=180000 scripts/qa/session-postgres.test.mjs
```

Or create and remove a fresh loopback cluster using trusted local binaries:

```sh
node scripts/qa/session-postgres-local.mjs /absolute/path/to/postgres/bin
node scripts/qa/session-postgres-local.mjs /absolute/path/to/postgres/bin --commerce
```

Fixtures are fixed to `127.0.0.1`, user `postgres`, and password
`qgambit-ephemeral-only`. The shared initializer accepts only the enumerated
`legacy_session_upgrade` and `commerce_upgrade` database names, checks the actual
loopback host/owner/empty schema, and rejects any other database. Only ports are
configurable via `QG_SESSION_TEST_PG_PORT` or `QG_TEST_PG_PORT`, respectively. No
hosted URL, PGHOST/PGPASSWORD or service secret is consulted. The local runner
uses temporary loopback trust auth, no Unix sockets, and its own new temporary
directory, never an existing PGDATA. Reports are `session-postgres-results.json`
and `commerce-postgres-results.json` in the OS temp directory.

CI integration requires both the commerce job and the mandatory session job,
each using a separate official `postgres:17.11-bookworm` service with its fixed
fixture-only DB/user/password values, `--locale=C --encoding=UTF8`, a healthcheck
`pg_isready -U postgres -d legacy_session_upgrade`, Node 24 and `npm ci`.
Run the command above and retain `/tmp/session-postgres-results.json`. A missing
database, extension, dependency or scenario must fail; no mocks or skips.

## Integration and release holds

- Both native jobs execute the full four-file inventory and enforce exact
  completed-scenario counts. The shared discovery assertion rejects additional
  pending files until explicitly reviewed. Neither job silently excludes an
  auth migration; keep both jobs mandatory in CI
- Hosted Auth OTP/JWT issuance, Storage HTTP, PostgREST reload, complete schema/
  ACL parity, production data and hosted extension configuration are unverified
- Synthetic preexisting hashes use real bcrypt cost 4 for speed; raw registration/
  reset retain costs 10/12. Synthetic auth.uid reads a claim only; it is not JWT
  validation. No private production schema/function was copied
- The existing duplicate historical ranked draft still blocks an all-files fresh
  installation. This bounded dependency fixture does not conceal or repair it
- SQL process reuse does not prove multi-instance Socket.IO behavior. Active
  matches, expiry-only continuation, cross-instance invalidation, current-socket
  replacement, deleted/restricted users, reconnect/outage/mixed-version rollback
  all need integrated design/tests before activation
- No package/lock/workflow/app files, provider settings, payments or production
  state are changed in this schema slice

References: [PostgreSQL locking](https://www.postgresql.org/docs/17/explicit-locking.html),
[Supabase function security](https://supabase.com/docs/guides/database/functions),
[17.11 compatibility notice](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).
The cited pgcrypto change concerns legacy PGP ciphers, not replacing bcrypt.
