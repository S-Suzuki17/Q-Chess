import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

if (!process.argv[2]) throw new Error('Pass a local PGlite runtime. Never a database URL.');
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2])).href);
const db = new PGlite();
let passed = 0;
const run = async (name, test) => { await test(); passed++; console.log(`PASS ${name}`); };
const scalar = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0];
const call = (name, args) => scalar(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')})`, args);
const as = async (role, fn) => { await db.exec(`set role ${role}`); try { return await fn(); } finally { await db.exec('reset role'); } };
const hash = 'a'.repeat(64), otherHash = 'b'.repeat(64);
try {
    await db.exec(`
        create role anon; create role authenticated; create role service_role bypassrls;
        create schema auth; create schema storage;
        create table auth.users(id uuid primary key);
        create function auth.uid() returns uuid language sql as $$select null::uuid$$;
        create table storage.objects(bucket_id text, name text, owner uuid, owner_id text);
        grant usage on schema public,storage,auth to service_role,anon,authenticated;
        grant select on storage.objects to service_role;
        create table public.profiles(id text primary key, name text, email text, password_hash text, rating integer default1000);
    `.replace('default1000', 'default 1000'));
    await db.exec(`
        create table public.friends(user_id text,friend_id text);
        create table public.active_matches(room_id text,white_id text,black_id text);
        create table public.game_records(id uuid primary key,white_id text,black_id text,white_player text,black_player text,winner text,moves jsonb,replay_expired boolean default false);
        create table public.ranked_match_settlements(match_id uuid primary key,request_hash bytea,result jsonb);
        create table public.founders_entitlements(user_id text);
        grant select,insert,update,delete on all tables in schema public to service_role;
        insert into public.profiles values('Alice','Alice','a@example.test','hash-a',1080),('Bob','Bob','b@example.test','hash-b',920),('Carol','Carol',null,null,1000);
        insert into public.friends values('Alice','Bob'),('Bob','Alice'),('Bob','Carol');
        insert into public.active_matches values('old','Alice','Bob');
        insert into public.game_records values
          ('00000000-0000-4000-8000-000000000001','Alice','Bob','Alice','Bob','white_wins','[{"playerId":"Alice"}]',false),
          ('00000000-0000-4000-8000-000000000002','Alice','ai','Alice','CPU','white_wins','[]',false),
          ('00000000-0000-4000-8000-000000000003','Bob','Carol','Bob','Carol','black_wins','[{"move":"a2a4"}]',false);
        insert into public.ranked_match_settlements values('00000000-0000-4000-8000-000000000001',sha256('old'::bytea),'{"white":{"userId":"Alice","delta":16},"black":{"userId":"Bob","delta":-16}}');
        insert into public.founders_entitlements values('Alice'),('Bob');
        insert into storage.objects values('avatars','u/'||encode(sha256('Alice'::bytea),'hex')||'/old.webp',null,null),('avatars','unrelated.webp',null,'Bob');
    `);
    await db.exec(await readFile('supabase/migrations/20260924114521_self_service_account_deletion.sql', 'utf8'));
    await run('anonymous clients cannot read jobs or invoke deletion', async () => {
        for (const role of ['anon','authenticated']) await as(role, async () => {
            await assert.rejects(db.exec('select * from public.account_deletion_jobs'), /permission denied/);
            await assert.rejects(call('begin_account_deletion', ['Bob',hash,null]), /permission denied/);
        });
    });
    await run('intent is scoped, resumable and does not prematurely delete profile', async () => {
        await as('service_role', () => call('begin_account_deletion', ['Alice', hash, null]));
        assert.equal(await scalar("select count(*) from profiles where id='Alice'"), 1);
        await as('service_role', () => call('begin_account_deletion', ['Alice', hash, null]));
        assert.equal(await scalar('select count(*) from account_deletion_jobs'), 1);
        await as('service_role', () => assert.rejects(call('begin_account_deletion', ['Alice',otherHash,'00000000-0000-4000-8000-000000000004']), /Invalid/));
    });
    await run('pending deletion blocks writes, not unrelated accounts', async () => {
        await as('service_role', () => assert.rejects(db.exec("update profiles set name='reset' where id='Alice'"), /progress/));
        await as('service_role', () => db.exec("update profiles set name='Bob kept' where id='Bob'"));
        await as('service_role', () => assert.rejects(db.exec("insert into friends values('Carol','Alice')"), /progress/));
    });
    await run('image ownership enumeration and failure preserve application data', async () => {
        const rows = await as('service_role', async () => (await db.query('select * from account_deletion_objects($1)', [hash])).rows);
        assert.equal(rows.length, 1); assert.ok(rows[0].name.endsWith('/old.webp'));
        await as('service_role', () => assert.rejects(call('erase_account_data', [hash]), /images/));
        assert.equal(await scalar("select count(*) from profiles where id='Alice'"), 1);
        // Simulate successful Storage API deletion; production never deletes these rows via SQL.
        await db.exec("delete from storage.objects where owner_id is null");
    });
    await run('erasure removes self, anonymizes opponent result and preserves unrelated data', async () => {
        await as('service_role', () => call('erase_account_data', [hash]));
        assert.equal(await scalar("select count(*) from profiles where id='Alice'"), 0);
        assert.equal(await scalar("select rating from profiles where id='Bob'"), 920);
        assert.equal(await scalar('select count(*) from friends'), 1);
        assert.equal(await scalar('select count(*) from active_matches'), 0);
        assert.equal(await scalar('select count(*) from founders_entitlements'), 1);
        const shared = (await db.query("select * from game_records where black_id='Bob'")).rows[0];
        assert.equal(shared.white_id, null); assert.equal(shared.white_player, 'Deleted player');
        assert.equal(shared.winner, 'white_wins'); assert.equal(shared.replay_expired, true); assert.deepEqual(shared.moves, []);
        assert.equal(await scalar('select count(*) from game_records'), 2);
        assert.deepEqual(await scalar("select moves from game_records where black_id='Carol'"), [{ move:'a2a4' }]);
        const receipt = await scalar('select result from ranked_match_settlements');
        assert.equal(receipt.white, undefined); assert.equal(receipt.black.userId, 'Bob');
    });
    await run('retry is idempotent and completion erases job identity', async () => {
        await as('service_role', () => call('erase_account_data', [hash]));
        await as('service_role', () => call('finish_account_deletion', [hash]));
        await as('service_role', () => call('finish_account_deletion', [hash]));
        const job = (await db.query('select * from account_deletion_jobs')).rows[0];
        assert.equal(job.phase,'completed'); assert.equal(job.user_id,null); assert.equal(job.auth_user_id,null);
        assert.equal(await scalar('select count(*) from storage.objects'),1);
    });
    await run('verified Auth identities without application profiles can still delete themselves', async () => {
        const id = '00000000-0000-4000-8000-000000000009';
        await as('service_role', () => assert.rejects(call('begin_account_deletion', ['missing-legacy',otherHash,null]), /unavailable/));
        await as('service_role', () => call('begin_account_deletion', [id,otherHash,id]));
        await as('service_role', () => call('erase_account_data', [otherHash]));
        await as('service_role', () => call('finish_account_deletion', [otherHash]));
        assert.equal(await scalar('select count(*) from account_deletion_jobs where user_id is not null'),0);
    });
    console.log(`Verified ${passed} account deletion/security scenarios in disposable PGlite.`);
} finally { await db.close(); }
