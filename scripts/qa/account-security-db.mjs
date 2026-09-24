import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';
if(!process.argv[2])throw Error('Pass a local PGlite runtime, never a production URL.');
const runtime=resolve(process.argv[2]);
const {PGlite}=await import(pathToFileURL(runtime).href);
const {pgcrypto}=await import(pathToFileURL(join(dirname(runtime),'contrib/pgcrypto.js')).href);
const db=new PGlite({extensions:{pgcrypto}});
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const as=async(role,fn)=>{await db.exec('set role '+role);try{return await fn();}finally{await db.exec('reset role');}};
let passed=0;const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema extensions;
      create extension pgcrypto with schema extensions;
      create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
      create table public.profiles(id text primary key,name text,password_hash text,rating integer,rating_10s integer,rating_3m integer,rating_10m integer);
      create table public.system_status(id integer primary key,maintenance_mode boolean not null default false,announcement_en text,announcement_ja text,updated_at timestamptz not null default now());
      alter table public.system_status enable row level security;
      create policy public_status on public.system_status for select using(true);
      grant all on public.system_status to anon,authenticated,service_role;
      insert into public.system_status(id) values(1);
      grant usage on schema public,extensions to service_role,anon,authenticated;
      grant select,insert,update,delete on profiles to service_role;
      insert into profiles values('Existing','Existing','keep',2100,2100,2100,2100);`);
    await db.exec(await readFile('supabase/migrations/20260924160910_account_security_controls.sql','utf8'));
    await db.exec(await readFile('supabase/migrations/20260924163400_account_progress_sync.sql','utf8'));
    await db.exec(await readFile('supabase/migrations/20260924170224_account_security_audit.sql','utf8'));
    await test('initializes a missing service-status row without overwriting operator settings',async()=>{
        const migration=await readFile('supabase/migrations/20260924171734_initialize_service_status.sql','utf8');
        await db.exec('delete from public.system_status');await db.exec(migration);
        assert.equal(await scalar('select maintenance_mode from system_status where id=1'),false);
        assert.equal(await scalar('select minimum_android_build from system_status where id=1'),0);
        await db.exec('update system_status set maintenance_mode=true where id=1');await db.exec(migration);
        assert.equal(await scalar('select maintenance_mode from system_status where id=1'),true);
        await db.exec('update system_status set maintenance_mode=false where id=1');
    });
    await test('all new privileged functions and restriction rows reject ordinary clients',async()=>{
        for(const role of ['anon','authenticated'])await as(role,async()=>{
            await assert.rejects(db.exec('select * from public.account_restrictions'),/permission denied/);
            await assert.rejects(db.exec("select public.register_account_secure('Evil','correct-horse-123')"),/permission denied/);
            await assert.rejects(db.exec("select public.account_session_active(null,null)"),/permission denied/);
            await assert.rejects(db.exec("update system_status set maintenance_mode=true"),/permission denied/);
            assert.equal(await scalar('select minimum_android_build from system_status where id=1'),0);
        });
    });
    await test('new account uses bcrypt cost10 and preserves rating1000 defaults',async()=>{
        assert.equal(await as('service_role',()=>scalar("select register_account_secure('Alice','correct-horse-123')")),true);
        const row=(await db.query("select * from profiles where id='Alice'")).rows[0];
        assert.match(row.password_hash,/^\$2[abxy]\$10\$/);assert.notEqual(row.password_hash,'correct-horse-123');assert.equal(row.rating,1000);
        assert.equal(await scalar("select password_hash=extensions.crypt('correct-horse-123',password_hash) from profiles where id='Alice'"),true);
    });
    await test('duplicates do not overwrite a password or rating, invalid passwords fail',async()=>{
        assert.equal(await as('service_role',()=>scalar("select register_account_secure('Existing','different-password-123')")),false);
        assert.equal(await scalar("select rating from profiles where id='Existing'"),2100);
        assert.equal(await scalar("select password_hash from profiles where id='Existing'"),'keep');
        for(const pw of ['short','x'.repeat(73),'漢'.repeat(30)])await assert.rejects(as('service_role',()=>scalar('select register_account_secure($1,$2)',['Other',pw])),/Invalid registration/);
    });
    const owner='00000000-0000-4000-8000-000000000001',session='00000000-0000-4000-8000-000000000002';
    await test('live session is owner-bound, expires and stops authorizing after removal',async()=>{
        await db.query('insert into auth.sessions values($1,$2,null)',[session,owner]);
        const live=()=>as('service_role',()=>scalar('select account_session_active($1,$2)',[owner,session]));
        assert.equal(await live(),true);assert.equal(await as('service_role',()=>scalar('select account_session_active($1,$2)',[session,session])),false);
        await db.exec("update auth.sessions set not_after=now()-interval '1 second'");assert.equal(await live(),false);
        await db.exec('delete from auth.sessions');assert.equal(await live(),false);
    });
    await test('account deletion cascades restriction data without changing another account',async()=>{
        const save=(revision,value)=>as('service_role',()=>scalar('select save_account_progress($1,$2,$3)',['Alice',revision,JSON.stringify(value)]));
        assert.equal(await save(0,{version:2,stageStars:[1]}),true);
        assert.equal(await save(0,{version:2,stageStars:[3]}),false);
        assert.equal(await save(1,{version:2,stageStars:[3]}),true);
        assert.equal(await save(1,{version:2,stageStars:[1]}),false);
        assert.equal(await scalar("select revision from account_progress where user_id='Alice'"),2);
        for(const role of ['anon','authenticated'])await as(role,async()=>{
            await assert.rejects(db.exec('select * from account_progress'),/permission denied/);
            await assert.rejects(db.exec("select save_account_progress('Alice',2,'{}')"),/permission denied/);
        });
        await as('service_role',()=>db.exec("insert into account_restrictions(user_id,blocked) values('Alice',true);delete from profiles where id='Alice'"));
        assert.equal(await scalar('select count(*) from account_progress'),0);
        assert.equal(await scalar('select count(*) from account_restrictions'),0);assert.equal(await scalar("select rating from profiles where id='Existing'"),2100);
    });
    await test('audit metadata is private, bounded, owner-erased and expires after 30 days',async()=>{
        for(const role of ['anon','authenticated'])await as(role,async()=>{
            await assert.rejects(db.exec("select record_security_event('login','success','Existing')"),/permission denied/);
            await assert.rejects(db.exec("select set_account_restriction('Existing',true)"),/permission denied/);
            await assert.rejects(db.exec('select * from qg_private.security_events'),/permission denied/);
        });
        await as('service_role',()=>db.exec("select set_account_restriction('Existing',true);select set_account_restriction('Existing',false)"));
        assert.equal(await scalar("select count(*) from qg_private.security_events where event in ('block','unblock')"),2);
        assert.equal(await scalar("select blocked from account_restrictions where user_id='Existing'"),false);
        await assert.rejects(as('service_role',()=>db.exec("select record_security_event('arbitrary-secret','error',null)")),/check constraint/);
        await db.exec("insert into qg_private.security_events(occurred_at,event,outcome) values(now()-interval '31 days','login','denied'),(now()-interval '29 days','login','denied')");
        assert.equal(await as('service_role',()=>scalar('select qg_private.purge_security_events()')),1);
        await as('service_role',()=>db.exec("delete from profiles where id='Existing'"));
        assert.equal(await scalar('select count(*) from qg_private.security_events where user_id is not null'),0);
        assert.equal(await scalar('select count(*) from qg_private.security_events'),1);
    });
    console.log(`${passed} account-security SQL scenarios passed (isolated database, real pgcrypto).`);
}finally{await db.close();}
