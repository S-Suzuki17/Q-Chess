import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(resolve('../../scratch/ranked-auth-agent/qa-runtime/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db=new PGlite();
try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema storage;create table storage.objects(id text);
      alter table storage.objects enable row level security;
      create policy "Users can upload their own avatar." on storage.objects for insert with check(true);
      create policy "Users can update their own avatar." on storage.objects for update using(true);
      create table public.profiles(id text primary key,name text,avatar_url text);
      grant usage on schema public to anon,authenticated,service_role;
      grant all on public.profiles to anon,authenticated,service_role;
      insert into public.profiles values('Alice','A','old-photo'),('Bob','B','other-photo');`);
    await db.exec(await readFile('supabase/migrations/20260918085709_protect_profile_avatar_writes.sql','utf8'));
    for(const role of ['anon','authenticated']) {
        await db.exec(`set role ${role}`);
        await assert.rejects(db.exec("update public.profiles set avatar_url='forged' where id='Bob'"),{code:'42501'});
        await assert.rejects(db.exec("update public.profiles set avatar_url=null where id='Alice'"),{code:'42501'});
        await assert.rejects(db.exec("insert into public.profiles values('Fake','F','forged')"),{code:'42501'});
        await db.exec("update public.profiles set avatar_url=avatar_url where id='Alice'");
        await db.exec('reset role');
    }
    await db.exec("set role service_role;update public.profiles set avatar_url='/avatars/circuit-01.svg' where id='Alice';reset role;");
    const {rows}=await db.query('select id,avatar_url from public.profiles order by id');
    assert.deepEqual(rows,[{id:'Alice',avatar_url:'/avatars/circuit-01.svg'},{id:'Bob',avatar_url:'other-photo'}]);
    assert.equal((await db.query("select count(*)::integer n from pg_policies where schemaname='storage' and cmd in ('INSERT','UPDATE')")).rows[0].n,0);
    console.log('PASS avatar owner-service guard: anon/auth denied; service allowed; existing photos preserved; direct uploads retired');
} finally {await db.close();}
