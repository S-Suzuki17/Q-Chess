// Local, in-memory PostgreSQL only. Install the pinned test dependency in scratch:
// npm install --prefix scratch/founders-sql --save-exact @electric-sql/pglite@0.5.8 --ignore-scripts
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../scratch/founders-sql/package.json',import.meta.url));
const {PGlite}=require('@electric-sql/pglite');
const db=await PGlite.create();
try {
 await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create table public.profiles(id text primary key); insert into public.profiles values ('alice'),('bob'); grant usage on schema public to anon,authenticated,service_role; alter default privileges in schema public grant all on tables to anon,authenticated,service_role;");
 await db.exec(await readFile(new URL('../supabase/migrations/20260919024638_founders_preregistration.sql',import.meta.url),'utf8'));
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);
  await assert.rejects(db.query('select * from public.founders_entitlements'),/permission denied/);
  await assert.rejects(db.query('select public.grant_founders_reward($1,$2)',['alice','a'.repeat(64)]),/permission denied/);
  await db.exec('reset role');
 }
 await db.exec('set role service_role');
 const claim=async(user,hash)=>(await db.query('select public.grant_founders_reward($1,$2) as result',[user,hash])).rows[0].result;
 assert.equal(await claim('alice','a'.repeat(64)),'granted');
 assert.equal(await claim('alice','a'.repeat(64)),'owned');
 assert.equal(await claim('bob','a'.repeat(64)),'conflict');
 assert.equal(await claim('alice','b'.repeat(64)),'conflict');
 assert.equal(await claim('bob','b'.repeat(64)),'granted');
 await assert.rejects(claim('alice','invalid'),/Invalid entitlement/);
 await assert.rejects(claim('missing-profile','c'.repeat(64)),/foreign key/);
 await assert.rejects(db.query("update public.founders_entitlements set user_id='bob' where user_id='alice'"),/permission denied/);
 await assert.rejects(db.query('delete from public.founders_entitlements'),/permission denied/);
 assert.equal((await db.query('select count(*)::int as count from public.founders_entitlements')).rows[0].count,2);
 console.log('PASS: local PostgreSQL migration, RLS/grants, duplicate receipt/account, foreign key and mutation boundaries.');
}finally{await db.close();}
