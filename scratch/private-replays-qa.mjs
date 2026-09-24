import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Disposable local PostgreSQL only. No environment variables or network access.
const runtime = process.argv[2] || '../../scratch/ranked-auth-agent/qa-runtime/node_modules/@electric-sql/pglite/dist/index.js';
const { PGlite } = await import(pathToFileURL(resolve(runtime)).href);
const db = new PGlite();
let passed = 0;
const migrations = 'supabase/migrations/';
const rows = async (sql, values = []) => (await db.query(sql, values)).rows;
const row = async (sql, values = []) => (await rows(sql, values))[0];
const denied = async operation => assert.rejects(operation, error => error.code === '42501');
async function test(name, operation) { await operation(); passed++; console.log(`PASS ${name}`); }
async function asRole(role, operation) {
    assert.ok(['postgres', 'anon', 'authenticated', 'service_role'].includes(role));
    await db.exec(`set role ${role}`);
    try { return await operation(); } finally { await db.exec('reset role'); }
}
const service = operation => asRole('service_role', operation);
const record = (white, black, index, overrides = {}) => ({
    id: randomUUID(), white, black, winner: ['white_wins', 'black_wins', 'draw'][index % 3],
    createdAt: new Date(Date.UTC(2020, 0, 1, 0, 0, index)).toISOString(),
    moves: [{ fromRow: 6, fromCol: 4, toRow: 4, toCol: 4 }], ...overrides,
});
const insert = input => db.query(`insert into public.game_records
    (id,white_id,black_id,white_player,black_player,winner,mode,created_at,moves,total_moves,time_control)
    values($1,$2,$3,$2,$3,$4,'casual',$5,$6::jsonb,1,'3m')`,
    [input.id, input.white, input.black, input.winner, input.createdAt, JSON.stringify(input.moves)]);
const get = (user, limit = 10) => service(() => rows('select * from public.get_private_game_records($1,$2)', [user, limit]));
const stats = user => service(async () => (await row('select public.get_private_game_stats($1) as value', [user])).value);
const metadata = () => rows('select id,white_id,black_id,white_player,black_player,winner,mode,created_at,total_moves,time_control from public.game_records order by id');
const ledger = () => rows('select * from public.ranked_match_settlements order by match_id');
const ratings = () => rows('select id,rating,rating_10s,rating_3m,rating_10m from public.profiles order by id');
const settleSql = 'select public.settle_ranked_match($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) as value';

try {
    await db.exec(`
        create role anon; create role authenticated; create role service_role bypassrls;
        grant usage on schema public to anon, authenticated, service_role;
        create table public.profiles(id text primary key,name text,password_hash text,rating integer default 1000,
            rating_10s integer default 1000,rating_3m integer default 1000,rating_10m integer default 1000);
        create table public.game_records(id uuid primary key default gen_random_uuid(),created_at timestamptz default now(),
            white_player text,black_player text,winner text,mode text not null,cpu_level integer,moves jsonb default '[]',
            total_moves integer,white_id text,black_id text,time_control text);
        alter table public.profiles enable row level security;
        alter table public.game_records enable row level security;
        create policy fixture_profiles on public.profiles for all to public using(true) with check(true);
        create policy "Anyone can read" on public.game_records for select to public using(true);
        create policy "Anyone can insert" on public.game_records for insert to public with check(true);
        grant all on public.profiles,public.game_records to anon,authenticated,service_role;
        insert into public.profiles(id,name) values('LedgerAlice','LedgerAlice'),('LedgerBob','LedgerBob');
    `);
    await db.exec(await readFile(migrations + '20260918072145_ranked_server_settlement.sql', 'utf8'));
    const settledId = randomUUID();
    const settlementArgs = [settledId, 'LedgerAlice', 'LedgerBob', 'WHITE', 180, null, null, null, JSON.stringify([{ from: 'a2', to: 'a4' }])];
    const settlementResult = await service(async () => (await row(settleSql, settlementArgs)).value);
    const ledgerBefore = await ledger();
    const ratingsBefore = await ratings();

    const alice = [];
    for (let index = 1; index <= 12; index++) {
        const input = record('Alice', `ai:${randomUUID()}`, index); alice.push(input); await insert(input);
    }
    const shared = record('Alice', 'Bob', 0, { winner: 'black_wins' }); await insert(shared);
    const stable = [];
    for (let index = 1; index <= 12; index++) {
        const input = record('Stable', `ai:${randomUUID()}`, 1, { id: `00000000-0000-0000-0000-${String(index).padStart(12, '0')}` });
        stable.push(input); await insert(input);
    }
    const nullDate = record('Stable', 'ai:null-date', 0, { createdAt: null }); await insert(nullDate);
    const reservedOwners = ['GUEST-', 'anon_', 'Anonymous-', 'CPU-', 'ai:', 'SUPABASE-'];
    const reservedOld = [];
    for (const [kind, prefix] of reservedOwners.entries()) {
        for (let index = 1; index <= 11; index++) {
            const input = record(`Owner${kind}`, `${prefix}${randomUUID()}`, index);
            if (index === 1) reservedOld.push(input);
            await insert(input);
        }
    }
    const unowned = record('GUEST-legacy', 'ai:legacy', 0); await insert(unowned);
    const metadataBefore = await metadata();
    await db.exec(await readFile(migrations + '20260918075535_private_recent_replays.sql', 'utf8'));

    await test('public and authenticated roles cannot read/write history or call private RPCs', async () => {
        for (const role of ['anon', 'authenticated']) {
            for (const operation of [
                () => rows('select * from public.game_records'),
                () => rows('select moves from public.game_records'),
                () => insert(record('Attacker', 'Alice', 1)),
                () => db.query("update public.game_records set moves='[]'"),
                () => db.query('delete from public.game_records'),
                () => rows("select * from public.get_private_game_records('Alice',10)"),
                () => rows("select public.get_private_game_stats('Alice')"),
                () => rows('select public.prune_private_replays(null)'),
            ]) await denied(() => asRole(role, operation));
        }
        assert.equal((await row("select relrowsecurity as enabled from pg_class where oid='public.game_records'::regclass")).enabled, true);
    });
    await test('migration keeps only the latest ten per owner and does not change metadata or ratings', async () => {
        const recent = await get('Alice');
        assert.deepEqual(recent.map(item => item.id), alice.slice(2).reverse().map(item => item.id));
        const old = await row('select moves,replay_expired from public.game_records where id=$1', [alice[0].id]);
        assert.deepEqual(old, { moves: [], replay_expired: true });
        assert.deepEqual(await metadata(), metadataBefore);
        assert.deepEqual(await ratings(), ratingsBefore);
    });
    await test('shared old payload remains while needed by either registered participant', async () => {
        assert.equal((await row('select replay_expired from public.game_records where id=$1', [shared.id])).replay_expired, false);
        assert.deepEqual((await get('Bob')).map(item => item.id), [shared.id]);
        assert.equal((await get('Alice')).some(item => item.id === shared.id), false);
        for (let index = 1; index <= 10; index++) await service(() => insert(record('Bob', `ai:${randomUUID()}`, 100 + index)));
        assert.equal((await row('select replay_expired from public.game_records where id=$1', [shared.id])).replay_expired, true);
        assert.deepEqual((await row('select moves from public.game_records where id=$1', [shared.id])).moves, []);
        assert.equal((await get('Bob')).length, 10);
    });
    await test('equal timestamps sort stably by descending id and null timestamps sort last', async () => {
        const expected = stable.slice(2).reverse().map(item => item.id);
        assert.deepEqual((await get('Stable')).map(item => item.id), expected);
        assert.deepEqual((await get('Stable')).map(item => item.id), expected);
        assert.equal((await row('select replay_expired from public.game_records where id=$1', [nullDate.id])).replay_expired, true);
        assert.equal((await get('Stable', 500)).length, 10);
        assert.equal((await get('Stable', null)).length, 10);
        assert.equal((await get('Stable', 2)).length, 2);
        assert.equal((await get('Stable', 0)).length, 0);
        assert.equal((await get('Stable', -1)).length, 0);
    });
    await test('distinct guest/anonymous/CPU identities never keep an eleventh human replay alive', async () => {
        for (const input of reservedOld) {
            assert.equal((await row('select replay_expired from public.game_records where id=$1', [input.id])).replay_expired, true);
            assert.deepEqual(await get(input.black), []);
        }
        const legacy = await row('select moves,replay_expired from public.game_records where id=$1', [unowned.id]);
        assert.deepEqual(legacy, { moves: unowned.moves, replay_expired: false });
        assert.deepEqual(await get('GUEST-legacy'), []); assert.deepEqual(await get('ai:legacy'), []);
        assert.deepEqual(await get(null), []); assert.deepEqual(await get(''), []);
    });
    await test('lifetime win/loss/draw statistics include expired payloads', async () => {
        assert.deepEqual(await stats('Alice'), { totalGames: 13, wins: 4, losses: 5, draws: 4, whiteGames: 13, whiteWins: 4, blackGames: 0, blackWins: 0 });
        const before = await stats('Alice');
        await service(() => rows('select public.prune_private_replays(null)'));
        assert.deepEqual(await stats('Alice'), before);
    });
    await test('old 30-day cleanup and truncate cannot remove metadata under service_role', async () => {
        const before = await metadata();
        await denied(() => service(() => db.query("delete from public.game_records where created_at < now()-interval '30 days'")));
        await denied(() => service(() => db.query('truncate public.game_records')));
        assert.deepEqual(await metadata(), before);
    });
    await test('burst/multi-row inserts retain exactly ten and do not recreate a subscription model', async () => {
        await service(async () => {
            await Promise.all(Array.from({ length: 25 }, (_, index) => insert(record('Burst', `ai:${randomUUID()}`, index))));
            await db.query(`insert into public.game_records(white_id,black_id,white_player,black_player,winner,mode,created_at,moves,total_moves)
                select 'Bulk','ai:'||gen_random_uuid()::text,'Bulk','CPU','draw','casual',now()+i*interval '1 second','[{"move":1}]'::jsonb,1
                from generate_series(1,25) i`);
        });
        for (const user of ['Burst', 'Bulk']) {
            assert.equal((await get(user)).length, 10);
            const actual = await row('select count(*)::integer as total,count(*) filter(where not replay_expired)::integer as retained from public.game_records where white_id=$1', [user]);
            assert.deepEqual(actual, { total: 25, retained: 10 });
        }
    });
    await test('BEFORE insert serializes using the same transaction advisory lock as prune', async () => {
        const trigger = await row("select pg_get_triggerdef(oid) as definition from pg_trigger where tgname='lock_private_replay_insert'");
        assert.match(trigger.definition, /BEFORE INSERT/);
        const definitions = await rows("select proname,provolatile,pg_get_functiondef(oid) as definition from pg_proc where proname in ('lock_private_replay_insert','prune_private_replays')");
        assert.equal(definitions.length, 2);
        for (const item of definitions) { assert.equal(item.provolatile, 'v'); assert.match(item.definition, /pg_advisory_xact_lock\(191937,10\)/); }
    });
    await test('ranked ledger/receipt survives history expiry and replay retries do not alter ratings', async () => {
        // Both real participants have ten newer games, so the old ranked payload can expire.
        for (const user of ['LedgerAlice', 'LedgerBob']) {
            for (let index = 1; index <= 10; index++) await service(() => insert(record(user, `ai:${randomUUID()}`, index, { createdAt: '2100-01-01T00:00:00Z' })));
        }
        assert.equal((await row('select replay_expired from public.game_records where id=$1', [settledId])).replay_expired, true);
        assert.deepEqual(await ledger(), ledgerBefore);
        assert.deepEqual(await ratings(), ratingsBefore);
        assert.deepEqual(await service(async () => (await row(settleSql, settlementArgs)).value), settlementResult);
        assert.deepEqual(await ledger(), ledgerBefore); assert.deepEqual(await ratings(), ratingsBefore);
        assert.deepEqual((await row('select moves from public.game_records where id=$1', [settledId])).moves, []);
    });
    await test('new ranked settlements still atomically save history, ledger, and ratings after migration', async () => {
        await db.query("insert into public.profiles(id,name) values('NewRankedAlice','NewRankedAlice'),('NewRankedBob','NewRankedBob')");
        const id = randomUUID();
        const args = [id, 'NewRankedAlice', 'NewRankedBob', 'WHITE', 180, null, null, null, JSON.stringify([{ from: 'b2', to: 'b4' }])];
        const result = await service(async () => (await row(settleSql, args)).value);
        assert.equal(result.white.after, 1016); assert.equal(result.black.after, 984);
        const history = await get('NewRankedAlice');
        assert.equal(history.length, 1); assert.equal(history[0].id, id); assert.equal(history[0].replay_expired, false);
        assert.deepEqual(history[0].moves, [{ from: 'b2', to: 'b4' }]);
        assert.deepEqual((await row('select result from public.ranked_match_settlements where match_id=$1', [id])).result, result);
        assert.deepEqual(await rows('select * from public.ranked_match_settlements where match_id=$1', [settledId]), ledgerBefore);
    });
    await test('rollback restores replay payloads pruned inside an aborted insertion transaction', async () => {
        const before = await rows("select * from public.game_records where white_id='Stable' order by id");
        await service(async () => {
            await db.exec('begin');
            try {
                await insert(record('Stable', `ai:${randomUUID()}`, 500));
                assert.equal((await row('select replay_expired from public.game_records where id=$1', [stable[2].id])).replay_expired, true);
            } finally { await db.exec('rollback'); }
        });
        assert.deepEqual(await rows("select * from public.game_records where white_id='Stable' order by id"), before);
    });
    await test('private RPC current_user gates remain closed even after an accidental EXECUTE grant', async () => {
        await db.exec('grant execute on function public.get_private_game_records(text,integer),public.get_private_game_stats(text),public.prune_private_replays(text[]) to anon');
        for (const sql of ["select * from public.get_private_game_records('Alice',10)", "select public.get_private_game_stats('Alice')", 'select public.prune_private_replays(null)']) {
            await denied(() => asRole('anon', () => rows(sql)));
        }
    });
    console.log(`Verified ${passed} private replay scenarios in disposable PGlite. Concurrent API bursts were serialized by PGlite; true multi-connection PostgreSQL contention is NOT simulated.`);
} finally { await db.close(); }
