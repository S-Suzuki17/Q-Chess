import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const runtime = process.argv[2];
if(!runtime)throw new Error('Usage: node scripts/qa/ranked-settlement.mjs <path-to-pglite/dist/index.js>');
const { PGlite } = await import(pathToFileURL(resolve(runtime)).href);
const db = new PGlite();
let passed = 0;
async function test(name, run) {
    await run();
    passed += 1;
    console.log(`PASS ${name}`);
}
async function asRole(role, run) {
    assert.ok(['postgres', 'anon', 'authenticated', 'service_role'].includes(role));
    await db.exec(`set role ${role}`);
    try { return await run(); }
    finally { await db.exec('reset role'); }
}
async function row(sql, parameters = []) { return (await db.query(sql, parameters)).rows[0]; }
async function profile(id) { return row('select id,name,rating,rating_10s,rating_3m,rating_10m from public.profiles where id=$1', [id]); }
async function count(table) {
    assert.ok(['profiles', 'game_records', 'ranked_match_settlements'].includes(table));
    return Number((await row(`select count(*) as count from public.${table}`)).count);
}
const rpcSql = `select public.settle_ranked_match($1::uuid,$2::text,$3::text,$4::text,
    $5::integer,$6::text,$7::integer,$8::integer,$9::jsonb) as result`;
function match(white = 'Alice', black = 'Bob', additions = {}) {
    return { id: randomUUID(), white, black, winner: 'WHITE', time: 10,
        cpuId: null, cpuRating: null, cpuLevel: null,
        history: [{ from: 'a2', to: 'a4' }], ...additions };
}
async function settle(input, role = 'service_role') {
    return asRole(role, async () => (await row(rpcSql, [input.id, input.white, input.black,
        input.winner, input.time, input.cpuId, input.cpuRating, input.cpuLevel,
        JSON.stringify(input.history)])).result);
}
async function rejected(call, code) { await assert.rejects(call, error => error.code === code); }

try {
    // Disposable worst-case schema: clients initially have ALL privileges and
    // permissive RLS, matching/broadening the known production attack surface.
    await db.exec(`
        create role anon;
        create role authenticated;
        create role service_role bypassrls;
        grant usage on schema public to anon, authenticated, service_role;
        create table public.profiles (
            id text primary key, name text, password_hash text,
            rating integer default 1000, rating_10s integer default 1000,
            rating_3m integer default 1000, rating_10m integer default 1000
        );
        create table public.game_records (
            id uuid primary key default gen_random_uuid(), created_at timestamptz default now(),
            white_player text not null, black_player text not null, winner text,
            mode text not null, cpu_level integer, moves jsonb default '[]', total_moves integer,
            white_id text, black_id text, time_control text
        );
        alter table public.profiles enable row level security;
        alter table public.game_records enable row level security;
        create policy fixture_profiles on public.profiles for all to public using (true) with check (true);
        create policy fixture_records on public.game_records for all to public using (true) with check (true);
        grant all on public.profiles, public.game_records to anon, authenticated, service_role;
        create function public.update_ratings_on_match() returns trigger language plpgsql as $$
            begin
                if new.mode='ranked' then update public.profiles set rating=rating+999
                    where id in (new.white_id,new.black_id); end if;
                return new;
            end $$;
        create trigger trigger_update_ratings after insert on public.game_records
            for each row execute function public.update_ratings_on_match();
        create function public.record_match_result(p_user_id text) returns void language sql
            as $$ update public.profiles set rating=5555 where id=p_user_id $$;
        grant execute on function public.record_match_result(text) to public,anon,authenticated,service_role;
        create function public.register_user(p_id text,p_password text) returns boolean
            language plpgsql security definer set search_path='' as $$
            begin insert into public.profiles(id,name) values(p_id,p_id); return true; end $$;
        insert into public.profiles(id,name) values
            ('Alice','Alice Display'),('Bob','Bob Display'),('Carol','Carol'),('Dan','Dan'),
            ('Eve','Eve'),('Frank','Frank'),('NullRating','Null Rating'),('Zero','Zero');
        update public.profiles set rating=1800,rating_10m=1400 where id='Eve';
        update public.profiles set rating_3m=null where id='NullRating';
        update public.profiles set rating=0,rating_10s=0 where id='Zero';
    `);
    await db.exec(await readFile(resolve(here, '../../supabase/migrations/20260918072145_ranked_server_settlement.sql'), 'utf8'));

    await test('service-only readiness and settlement execution; public ledger denied', async () => {
        assert.equal(await asRole('service_role', async () => (await row('select public.ranked_protocol_version() as version')).version), 1);
        for (const role of ['anon', 'authenticated']) {
            await rejected(() => asRole(role, () => row('select public.ranked_protocol_version()')), '42501');
            await rejected(() => settle(match(), role), '42501');
            await rejected(() => asRole(role, () => row('select * from public.ranked_match_settlements')), '42501');
        }
        await rejected(() => row('select public.ranked_protocol_version()'), '42501');
    });

    await test('legacy registered account creation and default inserts still work', async () => {
        assert.equal((await asRole('anon', () => row("select public.register_user('LegacyNew','fixture only') as ok"))).ok, true);
        await asRole('authenticated', () => db.query("insert into public.profiles(id,name) values('DefaultNew','New')"));
        assert.equal((await profile('LegacyNew')).rating, 1000);
        assert.equal((await profile('DefaultNew')).rating_3m, 1000);
    });

    await test('client cannot change/reset/transfer ratings or add a malicious trigger', async () => {
        for (const role of ['anon', 'authenticated']) {
            await rejected(() => asRole(role, () => db.query("update public.profiles set rating=2000 where id='Alice'")), '42501');
            await rejected(() => asRole(role, () => db.query("update public.profiles set rating_3m=null where id='Alice'")), '42501');
            await rejected(() => asRole(role, () => db.query("update public.profiles set id='Stolen' where id='Alice'")), '42501');
            await rejected(() => asRole(role, () => db.query("update public.profiles set password_hash='attacker hash' where id='Alice'")), '42501');
            await rejected(() => asRole(role, () => db.query("insert into public.profiles(id,rating) values('Forged',2000)")), '42501');
            await rejected(() => asRole(role, () => db.query("insert into public.profiles(id,rating_10m) values('Forged',null)")), '42501');
            await rejected(() => asRole(role, () => db.query("delete from public.profiles where id='Alice'")), '42501');
            await rejected(() => asRole(role, () => db.query('truncate public.profiles')), '42501');
            assert.equal((await row("select has_table_privilege($1,'public.profiles','TRIGGER') as allowed", [role])).allowed, false);
        }
        await asRole('anon', () => db.query("update public.profiles set name='Alice Display' where id='Alice'"));
        assert.equal((await profile('Alice')).rating, 1000);
    });

    await test('direct ranked history writes blocked while casual history remains supported', async () => {
        for (const role of ['anon', 'authenticated']) {
            for (const mode of ['ranked', 'ranked_cpu', ' Ranked_Test ']) {
                await rejected(() => asRole(role, () => db.query("insert into public.game_records(white_player,black_player,mode) values('A','B',$1)", [mode])), '42501');
            }
            assert.equal((await row("select has_table_privilege($1,'public.game_records','TRIGGER') as allowed", [role])).allowed, false);
            await rejected(() => asRole(role, () => db.query('truncate public.game_records')), '42501');
        }
        const casual = await asRole('anon', () => row("insert into public.game_records(white_player,black_player,mode) values('A','B','casual') returning id"));
        await rejected(() => asRole('anon', () => db.query("update public.game_records set mode='ranked_cpu' where id=$1", [casual.id])), '42501');
        await asRole('anon', () => db.query('delete from public.game_records where id=$1', [casual.id]));
    });

    await test('old RPC cannot execute under clients or service and old trigger is removed', async () => {
        for (const role of ['anon', 'authenticated', 'service_role']) {
            await rejected(() => asRole(role, () => row("select public.record_match_result('Alice')")), '42501');
        }
        assert.equal(Number((await row("select count(*) as n from pg_trigger where tgname='trigger_update_ratings'")).n), 0);
    });

    const human = match();
    let humanResult;
    await test('human win updates selected/global ratings exactly once and records names/moves', async () => {
        humanResult = await settle(human);
        assert.deepEqual(humanResult, {
            timeControl: 10,
            white: { userId: 'Alice', before: 1000, after: 1016, delta: 16 },
            black: { userId: 'Bob', before: 1000, after: 984, delta: -16 },
        });
        assert.deepEqual(await profile('Alice'), { id: 'Alice', name: 'Alice Display', rating: 1016, rating_10s: 1016, rating_3m: 1000, rating_10m: 1000 });
        assert.equal((await profile('Bob')).rating, 984);
        const record = await row('select * from public.game_records where id=$1', [human.id]);
        assert.equal(record.white_player, 'Alice Display');
        assert.equal(record.black_player, 'Bob Display');
        assert.equal(record.mode, 'ranked');
        assert.equal(record.time_control, '10s');
        assert.equal(record.winner, 'white_wins');
        assert.equal(record.total_moves, 1);
        assert.deepEqual(record.moves, human.history);
    });

    await test('retry returns the original result; changed payload cannot reuse a match ID', async () => {
        const before = await profile('Alice');
        assert.deepEqual(await settle(human), humanResult);
        for (const changes of [{ winner: 'BLACK' }, { time: 600 }, { history: [] }, { white: 'Bob', black: 'Alice' }]) {
            await rejected(() => settle({ ...human, ...changes }), '22023');
        }
        assert.deepEqual(await profile('Alice'), before);
        assert.equal(await count('ranked_match_settlements'), 1);
        assert.equal(await count('game_records'), 1);
    });

    await test('clients cannot alter/delete committed ranked records', async () => {
        for (const role of ['anon', 'authenticated']) {
            await rejected(() => asRole(role, () => db.query("update public.game_records set mode='casual' where id=$1", [human.id])), '42501');
            await rejected(() => asRole(role, () => db.query('delete from public.game_records where id=$1', [human.id])), '42501');
        }
    });

    await test('history cleanup cannot permit replay; ledger delete/truncate denied to service', async () => {
        await asRole('service_role', () => db.query('delete from public.game_records where id=$1', [human.id]));
        assert.deepEqual(await settle(human), humanResult);
        assert.equal((await profile('Alice')).rating_10s, 1016);
        assert.equal(await count('game_records'), 0);
        await rejected(() => asRole('service_role', () => db.query('delete from public.ranked_match_settlements')), '42501');
        await rejected(() => asRole('service_role', () => db.query('truncate public.ranked_match_settlements')), '42501');
    });

    const blackCpuId = `ai:${randomUUID()}`;
    const whiteCpuId = `ai:${randomUUID()}`;
    const cpuMatch = match('Carol', blackCpuId, { time: 180, cpuId: blackCpuId, cpuRating: 1200, cpuLevel: 5 });
    await test('CPU black settlement rates only its human; never creates a CPU profile', async () => {
        assert.deepEqual(await settle(cpuMatch), {
            timeControl: 180, white: { userId: 'Carol', before: 1000, after: 1024, delta: 24 },
        });
        assert.equal(await profile(blackCpuId), undefined);
        const record = await row('select mode,cpu_level,time_control,black_player from public.game_records where id=$1', [cpuMatch.id]);
        assert.deepEqual(record, { mode: 'ranked_cpu', cpu_level: 5, time_control: '3m', black_player: 'CPU Lv.5' });
        assert.equal((await profile('Carol')).rating, 1024);
    });

    await test('CPU white settlement never updates an existing CPU-named profile', async () => {
        await db.query('insert into public.profiles(id,name,rating) values($1,$2,777)', [whiteCpuId, 'Should stay untouched']);
        const before = await profile(whiteCpuId);
        const result = await settle(match(whiteCpuId, 'Dan', { cpuId: whiteCpuId, cpuRating: 1200, cpuLevel: 3 }));
        assert.deepEqual(result, { timeControl: 10, black: { userId: 'Dan', before: 1000, after: 992, delta: -8 } });
        assert.deepEqual(await profile(whiteCpuId), before);
    });

    await test('unequal draw computes global and selected Elo independently', async () => {
        const result = await settle(match('Eve', 'Frank', { winner: 'DRAW', time: 600 }));
        assert.deepEqual(result, { timeControl: 600,
            white: { userId: 'Eve', before: 1400, after: 1387, delta: -13 },
            black: { userId: 'Frank', before: 1000, after: 1013, delta: 13 } });
        assert.equal((await profile('Eve')).rating, 1784);
        assert.equal((await profile('Frank')).rating, 1016);
    });

    await test('rating floor remains nonnegative', async () => {
        const cpuId = `ai:${randomUUID()}`;
        const result = await settle(match('Zero', cpuId, { winner: 'BLACK', cpuId, cpuRating: 0, cpuLevel: 1 }));
        assert.deepEqual(result.white, { userId: 'Zero', before: 0, after: 0, delta: 0 });
    });

    await test('missing or null-rated profiles abort without a durable claim or history', async () => {
        const ledgerBefore = await count('ranked_match_settlements');
        const historyBefore = await count('game_records');
        const aliceBefore = await profile('Alice');
        await rejected(() => settle(match('Alice', 'Missing')), '22023');
        await rejected(() => settle(match('Alice', 'NullRating', { time: 180 })), '22023');
        assert.equal(await count('ranked_match_settlements'), ledgerBefore);
        assert.equal(await count('game_records'), historyBefore);
        assert.deepEqual(await profile('Alice'), aliceBefore);
    });

    await test('failed history insertion rolls all rating and claim writes back', async () => {
        const input = match('Alice', 'Bob');
        await db.query("insert into public.game_records(id,white_player,black_player,mode) values($1,'A','B','casual')", [input.id]);
        const before = await profile('Alice');
        const ledgerBefore = await count('ranked_match_settlements');
        await rejected(() => settle(input), '23505');
        assert.deepEqual(await profile('Alice'), before);
        assert.equal(await count('ranked_match_settlements'), ledgerBefore);
    });

    await test('all malformed metadata fails closed and does not consume match IDs', async () => {
        const before = await count('ranked_match_settlements');
        for (const changes of [
            { id: null }, { white: 'GUEST-12' }, { black: 'anon_test' }, { black: 'ai' },
            { black: 'SUPABASE-Bob' }, { white: ' ' }, { white: 'Alice\n' }, { white: 'x'.repeat(257) },
            { white: 'Alice', black: 'Alice' }, { winner: null }, { winner: 'white' },
            { time: 1 }, { time: null }, { history: {} }, { history: null },
            { history: Array(5001).fill(0) }, { history: ['x'.repeat(2097152)] },
            { cpuRating: 1000 }, { cpuLevel: 1 },
            { cpuId: `ai:${randomUUID()}`, cpuRating: 1000, cpuLevel: 1 },
        ]) await rejected(() => settle(match('Alice', 'Bob', changes)), '22023');
        for (const changes of [{ cpuRating: null }, { cpuRating: -1 }, { cpuRating: 10001 }, { cpuLevel: null }, { cpuLevel: 0 }, { cpuLevel: 101 }]) {
            await rejected(() => settle({ ...cpuMatch, id: randomUUID(), ...changes }), '22023');
        }
        assert.equal(await count('ranked_match_settlements'), before);
    });

    await test('CPU replay fingerprint includes fixed rating and level', async () => {
        await rejected(() => settle({ ...cpuMatch, cpuRating: 1201 }), '22023');
        await rejected(() => settle({ ...cpuMatch, cpuLevel: 4 }), '22023');
    });

    console.log(`Verified ${passed} settlement/security scenarios against disposable PGlite.`);
} finally {
    await db.close();
}
