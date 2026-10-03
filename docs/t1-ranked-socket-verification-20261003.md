# T1 real HTTP and Socket.IO verification — 2026-10-03

Status: locally verified; this chat did not deploy or modify a remote database.

Base: `fb5ead6` (functional base `e77e298`).
Branch: `test/ranked-socket-postgres-20261003`.

## Application commits

- `a026fd8f333ade1530b208ebdb29cedf1a134f5c`: definitively rejected admissions (SQLSTATE 42501, 22023, 23505) enter durable cancellation instead of retrying admission indefinitely. A lost cancellation acknowledgement retains the reason and busy state until the tombstone is confirmed. Other admission failures remain retryable.
- `962a897bfab98e7ea9162a3ed4ee6bde29ab6dfb`: the user's requested CPU fallback change from 60 to 10 seconds. Server eligibility and queue notification use the same constant. The client initial deadline and all 12 supported language messages say 10 seconds. Tests cover no fallback at 9,999 ms, fallback at 10,000 ms, human matching before the deadline, and queue cancellation/reconnection. Includes one local, unpublished QUBE diary entry and its generated draft.

These changes are separate from the verification harness. No SQL migration was edited in this follow-up. Ticket, recovery, hints, billing and advertising source release gates remain OFF in this branch. The 10-second fallback also applies to existing free ranked play while ticket admission is OFF.

## Actual integration run

Command: `node scripts/qa/ranked-socket-postgres.mjs`, after `npm --prefix server run build`.

The completed run exited 0 with all 10 scenario groups passing:

1. Old nine-named-argument `settle_ranked_match` requests succeed through real PostgREST for free PvP and CPU on either side; duplicate calls return the same result and one settlement row.
2. Real legacy password HTTP login, polling and WebSocket connections, rejection of a spoofed identity/refund query, and denial of a client-role privileged RPC.
3. Legacy-shaped PvP without `introVersion`: admission, atomic debit, human move, resignation, actual Elo/history write, no refund.
4. Missing terms consent yields actual SQLSTATE 42501: no engine or partial debit, durable UUID cancellation, queue released.
5. The relay withholds an actual committed admission response. Peer disconnect and the actual 30-second grace produce cancellation, one uncapped credit with wallet already full at 20, and correct reconnect/read behavior.
6. Both humans spend their refund credits once before capped wallet tickets, then settle successfully.
7. Actual CPU fallback was observed after **10,041 ms** without accelerated clocks. One human allocation, actual compiled CPU worker move, and settlement pass.
8. Actual game-server process termination/restart, new login proof, natural 20-second database owner expiry, old UUID cancellation and exactly-once refund/replay.
9. An old nine-argument settlement cannot settle the voided admission: real PostgREST returns HTTP 500 with SQLSTATE 55000. The harness's earlier expectation of HTTP 400 was corrected; the SQL refusal itself worked.
10. Configured minimum protocol/build rejects missing metadata and Android build 19 with HTTP 426; Android build 20/protocol 1 authenticates.

The old request shape was compared directly with `1949a6e:server/src/services/SupabaseService.ts`: match ID, white ID, black ID, winner, time control, CPU ID, CPU rating, CPU level, history; no owner argument. The local full migration chain exposes the replacement function with its default owner argument and accepts this existing REST shape.

The final run stopped all its child game-server/PostgREST processes and fast-stopped the PostgreSQL cluster in `finally`. No `postmaster.pid` remained; the post-run process check found no PostgreSQL/PostgREST process. Scratch dependencies and the same cluster were reused; no new dependency install or cluster was needed for this final run.

## Other validation

- Targeted Vitest: 6 files / 70 tests passed across the final affected-file runs. Five files / 52 tests passed initially; the gateway mock needed the newly imported constant, and its final rerun passed all 18 tests. This includes matchmaking, ranked runtime, admission coordinator/store, gateway, and diary checks.
- `npm run typecheck`: passed.
- `npm --prefix server run build`: passed; that compiled build ran in the real socket fixture.
- `node scripts/export-qube-drafts.mjs`: passed. Only the new diary draft is committed; no X publication.
- `git diff --check`: passed.
- No Next production build was run in this follow-up; the integration owner coordinates the shared build.

## Harness boundary and reproduction

This is a Windows local fixture using PostgreSQL 18.4 (native package `@embedded-postgres/windows-x64@18.4.0-beta.17`), `pg@8.16.3`, and PostgREST 16.4. It uses the actual 14-file migration list from `stripe-canonical-fixture.mjs`, plus the actual legacy password and security audit migrations; minimal synthetic profile/system tables replace unrelated Supabase infrastructure.

Existing scratch dependency provisioning, if absent on another machine:

```text
npm install --prefix scratch/ranked-postgres --save-exact --ignore-scripts @embedded-postgres/windows-x64@18.4.0-beta.17 pg@8.16.3
npm --prefix server run build
node scripts/qa/ranked-socket-postgres.mjs
```

Place `postgrest.exe` from the official [PostgREST v16.4 release](https://github.com/PostgREST/postgrest/releases/tag/v16.4) in `scratch/ranked-postgres/postgrest/`. The downloaded Windows x86-64 zip was verified against official SHA256 `29a5b56e5a09b7168bb552ef14aa7ade40bf0a81dd0687cffa86610187b89d78`. The binary and scratch packages/data are not committed.

The runner accepts no remote DB URL or real credentials. It binds random loopback ports, creates a local JWT secret, redirects APPDATA/profile discovery to scratch, and passes a small clean environment to child processes. Windows libpq uses the existing PostgreSQL binary/library PATH. PostgreSQL logging is outside PGDATA and shutdown is fast, avoiding Windows open-log recovery conflicts. PostgREST receives local SSL/GSS disable options, two runtime capabilities, and no Node IPC channel.

A transparent local relay removes Supabase's `/rest/v1` prefix and can delay committed admission responses. All SQL and HTTP responses originate in actual PostgREST/PostgreSQL. The child runs actual compiled `server/dist/index.js`; only loopback listening and admission/recovery release gate functions are overridden in child memory. Identity, routes, handlers, admission store, matchmaking, rules, and CPU worker are actual application code.

## Not established by this run

- Production PostgreSQL/PostgREST versions, production migration history, or schema-cache reload during a live 9-to-10-argument DDL transition. This verifies old request compatibility against a fully migrated fresh fixture schema. The integration owner must deliberately validate/apply pending migrations and refresh the actual API cache.
- Supabase GoTrue, OAuth, real accounts, password-reset/recovery providers, Android APK/device rendering, or an on-device end-to-end run. Android results above are wire fixtures.
- Live/sandbox paid entitlement policy, Stripe/Play transactions, real billing keys, or advertising. Those remain separately owned; no T4 SQL was changed.
- User interface rendering or deployment of the 10-second copy. Source and runtime behavior are verified locally.

For earlier SQL race, process-boundary and complete-suite results, see `docs/t1-ranked-admission-verification-20261003.md`; those earlier results are not presented as reruns of this follow-up.
