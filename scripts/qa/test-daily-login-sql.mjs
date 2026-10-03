import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

// Setup: npm install --prefix scratch/ticket-sql --save-exact @electric-sql/pglite@0.5.8 --ignore-scripts
const root = resolve(process.argv[2] ?? fileURLToPath(new URL('../..', import.meta.url)));
const require = createRequire(resolve(root, 'scratch/ticket-sql/package.json'));
const { PGlite } = require('@electric-sql/pglite');
const db = await PGlite.create();
const claim = async id => (await db.query('select public.claim_daily_login_reward($1) as result', [id])).rows[0].result;
const status = async id => (await db.query('select public.daily_login_reward_status($1) as result', [id])).rows[0].result;
const clock = async value => db.query('update public.test_clock_value set value=$1::timestamptz', [value]);
const owner = async sql => { await db.exec('reset role'); await db.exec(sql); await db.exec('set role service_role'); };

try {
    await db.exec(`
        create role anon; create role authenticated; create role service_role bypassrls;
        create table public.profiles(id text primary key);
        create table public.account_deletion_jobs(user_id text, phase text);
        create table public.account_restrictions(user_id text, blocked boolean);
        create table public.account_terms_consents(user_id text, version text);
        create table public.test_clock_value(value timestamptz);
        insert into public.test_clock_value values ('2026-10-03T23:59:59Z');
        create function public.test_clock() returns timestamptz language sql as $$ select value from public.test_clock_value $$;
        grant usage on schema public to anon, authenticated, service_role;
        grant all on all tables in schema public to service_role;
        grant execute on function public.test_clock() to service_role;
        insert into public.profiles values ('Alice'), ('Bob'), ('NoTerms'), ('Deleting'), ('Blocked'), ('Burst'), ('Cap');
        insert into public.account_terms_consents select id,'2026-09-25.1' from public.profiles where id <> 'NoTerms';
        insert into public.account_deletion_jobs values ('Deleting','pending');
        insert into public.account_restrictions values ('Blocked',true);
    `);
    const migration = await readFile(resolve(root, 'supabase/migrations/20260930083253_ticket_wallet_daily_login.sql'), 'utf8');
    // Replace the clock ONLY inside this disposable database. Production RPC has no caller clock argument.
    await db.exec(migration.replaceAll('clock_timestamp()', 'public.test_clock()'));
    for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role}`);
        await assert.rejects(status('Alice'), /permission denied/i);
        await assert.rejects(claim('Alice'), /permission denied/i);
        await assert.rejects(db.query('select * from public.ticket_wallets'), /permission denied/i);
        await db.exec('reset role');
    }
    await db.exec("set role service_role; set time zone 'Asia/Tokyo'");
    assert.deepEqual((await status('Alice')).tickets, { ranked: 0, hint: 0 });
    assert.equal((await db.query('select count(*)::integer as n from public.ticket_wallets')).rows[0].n, 0);
    for (const id of ['Missing', 'NoTerms', 'Deleting', 'Blocked']) {
        await assert.rejects(claim(id), /unavailable/i);
        await assert.rejects(status(id), /unavailable/i);
    }
    for (const id of [null, '', 'x'.repeat(257), 'あ'.repeat(100)]) await assert.rejects(claim(id), /Invalid reward account/);
    const ranked = [1,1,1,2,2,2,3], hint = [2,2,3,3,4,4,5];
    for (let day=0; day<9; day++) {
        await clock(`2026-10-${String(3+day).padStart(2,'0')}T23:59:59Z`);
        await owner("update public.ticket_wallets set ranked_tickets=0,hint_tickets=0 where user_id='Alice'");
        const result = await claim('Alice');
        assert.equal(result.streakDays, Math.min(day+1,7));
        assert.equal(result.lastClaimUtcDay, `2026-10-${String(3+day).padStart(2,'0')}`);
        assert.deepEqual(result.credited, {ranked:ranked[Math.min(day,6)],hint:hint[Math.min(day,6)]});
        assert.equal(result.claimed, true);
        const repeated = await claim('Alice');
        assert.equal(repeated.claimed, false);
        assert.deepEqual(repeated.credited, {ranked:0,hint:0});
        assert.deepEqual(repeated.tickets, result.tickets);
    }
    await clock('2026-10-13T00:00:00Z');
    assert.equal((await claim('Alice')).streakDays, 1);
    await clock('2026-10-13T23:59:59.999Z');
    assert.equal((await claim('Alice')).claimed, false);
    await clock('2026-10-14T00:00:00Z');
    assert.equal((await claim('Alice')).streakDays, 2);
    await claim('Cap');
    await owner("update public.ticket_wallets set ranked_tickets=19,hint_tickets=20,streak_days=6,last_claim_utc_day='2026-10-13' where user_id='Cap'");
    const capped = await claim('Cap');
    assert.deepEqual(capped.credited,{ranked:1,hint:0});
    assert.deepEqual(capped.tickets,{ranked:20,hint:20});
    // PGlite queues these requests on one connection; this proves retries, not independent-session row-lock contention.
    const burst = await Promise.all(Array.from({length:16},()=>claim('Burst')));
    assert.equal(burst.filter(r=>r.claimed).length,1);
    assert.deepEqual((await status('Burst')).tickets,{ranked:1,hint:2});
    await owner("delete from public.account_terms_consents where user_id='Burst'");
    await assert.rejects(claim('Burst'), /unavailable/i);
    await owner("insert into public.account_deletion_jobs values ('Burst','pending')");
    await assert.rejects(claim('Burst'), /unavailable/i);
    await owner("delete from public.profiles where id='Alice'");
    assert.equal((await db.query("select count(*)::integer as n from public.ticket_wallets where user_id='Alice'")).rows[0].n,0);
    await assert.rejects(claim('Alice'), /unavailable/i);
    await owner("update public.ticket_wallets set last_claim_utc_day='2026-10-15' where user_id='Cap'");
    await assert.rejects(claim('Cap'), /Invalid reward state/);
    console.log('PASS: daily-login SQL; 1–7/repeat/reset, UTC boundary, caps, retries, ACLs, consent, deletion/cascade, restriction, invalid input/state. Independent-session concurrency remains unverified.');
} finally { await db.close(); }
