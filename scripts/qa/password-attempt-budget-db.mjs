import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
if(!process.argv[2])throw Error('Pass local PGlite, never a database URL.');
const {PGlite}=await import(pathToFileURL(resolve(process.argv[2])).href);
const db=new PGlite(); let passed=0;
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const as=async(role,fn)=>{await db.exec('set role '+role);try{return await fn();}finally{await db.exec('reset role');}};
const login=(id,pw)=>scalar('select public.login_user($1,$2)',[id,pw]);
const run=async(name,fn)=>{await fn();console.log('PASS '+name);passed++;};
try{
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
        create schema qg_private; revoke all on schema qg_private from public;
        create schema extensions; grant usage on schema public,extensions to anon,authenticated,service_role;
        create table profiles(id text primary key,name text,password_hash text,email text,rating integer default 1000);
        create table account_deletion_jobs(user_id text,phase text);
        insert into profiles values('Alice','Alice','correct',null,1200),('Bob','Bob','bob',null,900),('OAuth','OAuth',null,null,1000);
        create sequence crypto_calls;
        -- Crypto test double counts work; production uses installed pgcrypto.
        create function extensions.crypt(text,text) returns text language plpgsql as $$begin perform nextval('public.crypto_calls');return $1;end$$;
        grant select,delete on profiles to service_role;
    `);
    await db.exec(await readFile('supabase/migrations/20260924150213_legacy_password_attempt_budget.sql','utf8'));
    await run('private counters and cleanup function inaccessible to all API roles',async()=>{
        for(const role of ['anon','authenticated','service_role'])await as(role,async()=>{
            await assert.rejects(db.exec('select * from qg_private.password_attempt_budgets'),/permission denied/);
            await assert.rejects(db.exec('select qg_private.erase_password_attempt_budget()'),/permission denied/);
        });
    });
    await run('unknown, OAuth-only and malformed IDs do not grow the budget table',async()=>{
        for(const id of ['unknown','OAuth','x'.repeat(257)])assert.equal(await as('anon',()=>login(id,'bad')),false);
        assert.equal(await scalar('select count(*) from qg_private.password_attempt_budgets'),0);
    });
    await run('10 checks share one budget across direct RPC, service and email changes',async()=>{
        assert.equal(await as('anon',()=>login('Alice','correct')),true);
        for(let i=0;i<8;i++)assert.equal(await as(i%2?'service_role':'authenticated',()=>login('Alice','bad')),false);
        assert.equal(await as('anon',()=>scalar("select public.update_user_email('Alice','bad','bad@example.test')")),false);
        const calls=await scalar('select last_value from crypto_calls');
        assert.equal(await as('service_role',()=>login('Alice','correct')),false);
        assert.equal(await as('anon',()=>scalar("select public.update_user_email('Alice','correct','bad@example.test')")),false);
        assert.equal(await scalar('select last_value from crypto_calls'),calls);
        assert.equal(await scalar("select email from profiles where id='Alice'"),null);
        assert.equal(await as('authenticated',()=>login('Bob','bob')),true);
    });
    await run('budget reopens after 60 seconds and preserves password/rating',async()=>{
        await db.exec("update qg_private.password_attempt_budgets set window_started=now()-interval '61 seconds'");
        assert.equal(await as('anon',()=>login('Alice','correct')),true);
        assert.equal(await as('authenticated',()=>scalar("select public.update_user_email('Alice','correct','new@example.test')")),true);
        assert.equal(await scalar("select password_hash from profiles where id='Alice'"),'correct');
        assert.equal(await scalar("select rating from profiles where id='Alice'"),1200);
    });
    await run('pending deletion denies even the correct password before crypto',async()=>{
        await db.exec("insert into account_deletion_jobs values('Alice','pending')");
        const calls=await scalar('select last_value from crypto_calls');
        assert.equal(await as('service_role',()=>login('Alice','correct')),false);
        assert.equal(await scalar('select last_value from crypto_calls'),calls);
    });
    await run('account erasure removes its counter only',async()=>{
        await as('service_role',()=>db.exec("delete from profiles where id='Alice'"));
        assert.equal(await scalar("select count(*) from qg_private.password_attempt_budgets where account_key=sha256(convert_to('Alice','UTF8'))"),0);
        assert.equal(await scalar("select count(*) from qg_private.password_attempt_budgets where account_key=sha256(convert_to('Bob','UTF8'))"),1);
    });
    await run('old counters are cleaned on subsequent known-account verification',async()=>{
        await db.exec("update qg_private.password_attempt_budgets set window_started=now()-interval '2 hours'; insert into profiles values('Carol','Carol','carol',null,1000)");
        assert.equal(await as('anon',()=>login('Carol','carol')),true);
        assert.equal(await scalar('select count(*) from qg_private.password_attempt_budgets'),1);
    });
    console.log(`${passed} password-attempt scenarios passed; isolated DB, no real accounts/passwords.`);
}finally{await db.close();}
