import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
if(!process.argv[2])throw Error('Pass a local PGlite runtime, never a database URL.');
const {PGlite}=await import(pathToFileURL(resolve(process.argv[2])).href),db=new PGlite();
let passed=0;
const run=async(name,test)=>{await test();passed++;console.log('PASS '+name);};
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const call=(name,args)=>scalar(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args);
const as=async(role,fn)=>{await db.exec('set role '+role);try{return await fn();}finally{await db.exec('reset role');}};
const authId='00000000-0000-4000-8000-000000000001',otherId='00000000-0000-4000-8000-000000000002';
try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
        create schema auth;create schema storage;create schema extensions;
        create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,is_anonymous boolean default false);
        create table auth.identities(user_id uuid,provider text);
        create function auth.uid() returns uuid language sql as $$select null::uuid$$;
        create table storage.objects(bucket_id text,name text,owner uuid,owner_id text);
        grant usage on schema public,auth,storage,extensions to anon,authenticated,service_role;
        grant select on storage.objects to service_role;
        -- Test double for unavailable PGlite pgcrypto. Tests transaction/auth behavior,
        -- NOT cryptographic strength; production uses extensions.crypt + bcrypt cost12.
        create function extensions.gen_salt(text,integer) returns text language sql as $$select 'fixture-salt'::text$$;
        create function extensions.crypt(text,text) returns text language sql as $$select 'fixture-hash:'||md5($1||$2)$$;
        create table profiles(id text primary key,name text,email text,password_hash text,rating integer default 1000);
        create table friends(user_id text,friend_id text);
        create table active_matches(room_id text,white_id text,black_id text);
        create table game_records(id uuid,white_id text,black_id text,white_player text,black_player text,winner text,moves jsonb,replay_expired boolean default false);
        create table ranked_match_settlements(match_id uuid,request_hash bytea,result jsonb);
        grant select,insert,update,delete on all tables in schema public to service_role;
        insert into profiles values('Alice','Alice','unverified@example.test','old-hash',1200),('Bob','Bob',null,'bob-hash',900);
        insert into auth.users values('${authId}','alice@example.test',now(),null,false),('${otherId}','bob@example.test',null,null,false);
        insert into auth.identities values('${authId}','email'),('${otherId}','email');`);
    for(const file of ['20260924140124_self_service_account_deletion.sql','20260924140234_verified_account_recovery.sql'])await db.exec(await readFile(resolve('supabase/migrations',file),'utf8'));
    await run('old unverified email is never auto-enrolled',async()=>{
        assert.equal(await scalar('select count(*) from account_recovery_emails'),0);
        await as('service_role',()=>assert.rejects(call('reset_legacy_account_password',['Alice','unverified@example.test',authId,'new-password-123']),/unavailable/i));
        assert.equal(await scalar("select password_hash from profiles where id='Alice'"),'old-hash');
    });
    await run('public roles cannot read emails or call privileged helpers',async()=>{
        for(const role of ['anon','authenticated'])await as(role,async()=>{
            await assert.rejects(db.query('select * from account_recovery_emails'),/permission denied/);
            await assert.rejects(call('enroll_account_recovery',['Alice','alice@example.test',authId]),/permission denied/);
            await assert.rejects(scalar('select qg_private.recovery_identity_matches($1,$2)',[authId,'alice@example.test']),/permission denied/);
        });
    });
    await run('unconfirmed, mismatched and existing playable Auth identities cannot enroll',async()=>{
        await as('service_role',()=>assert.rejects(call('enroll_account_recovery',['Bob','bob@example.test',otherId]),/unavailable/i));
        await as('service_role',()=>assert.rejects(call('enroll_account_recovery',['Alice','wrong@example.test',authId]),/unavailable/i));
        await db.query('insert into profiles(id,name) values($1,$2)',[authId,'Existing OAuth player']);
        await as('service_role',()=>assert.rejects(call('enroll_account_recovery',['Alice','alice@example.test',authId]),/unavailable/i));
        await db.query('delete from profiles where id=$1',[authId]);
    });
    await run('enrollment is verified, unique, idempotent and preserves player ID',async()=>{
        await as('service_role',()=>call('enroll_account_recovery',['Alice','alice@example.test',authId]));
        await as('service_role',()=>call('enroll_account_recovery',['Alice','alice@example.test',authId]));
        await as('service_role',()=>assert.rejects(call('enroll_account_recovery',['Bob','alice@example.test',authId]),/unique/));
        assert.equal(await scalar('select count(*) from account_recovery_emails'),1);assert.equal(await scalar("select rating from profiles where id='Alice'"),1200);
    });
    await run('password reset checks binding and touches no rating/opponent data',async()=>{
        // Later identity linking must not invalidate an already proven recovery address.
        await db.query('insert into auth.identities values($1,$2)',[authId,'google']);
        await as('service_role',()=>assert.rejects(call('reset_legacy_account_password',['Bob','alice@example.test',authId,'new-password-123']),/unavailable/i));
        await as('service_role',()=>assert.rejects(call('reset_legacy_account_password',['Alice','alice@example.test',authId,'short']),/Invalid/));
        await as('service_role',()=>call('reset_legacy_account_password',['Alice','alice@example.test',authId,'new-password-123']));
        assert.match(await scalar("select password_hash from profiles where id='Alice'"),/^fixture-hash:/);
        assert.equal(await scalar("select rating from profiles where id='Alice'"),1200);assert.equal(await scalar("select password_hash from profiles where id='Bob'"),'bob-hash');
    });
    await run('deleted Auth identity cannot reset a password',async()=>{
        await db.query('update auth.users set deleted_at=now() where id=$1',[authId]);
        await as('service_role',()=>assert.rejects(call('reset_legacy_account_password',['Alice','alice@example.test',authId,'another-password']),/unavailable/i));
        await db.query('update auth.users set deleted_at=null where id=$1',[authId]);
    });
    await run('deletion captures the recovery identity and blocks password changes',async()=>{
        const hash='a'.repeat(64);await as('service_role',()=>call('begin_account_deletion',['Alice',hash,null]));
        assert.equal(await scalar('select auth_user_id from account_deletion_jobs'),authId);
        await as('service_role',()=>assert.rejects(call('reset_legacy_account_password',['Alice','alice@example.test',authId,'another-password']),/unavailable/i));
        await as('service_role',()=>call('erase_account_data',[hash]));
        assert.equal(await scalar('select count(*) from account_recovery_emails'),0);assert.equal(await scalar('select auth_user_id from account_deletion_jobs'),authId);
        await as('service_role',()=>call('finish_account_deletion',[hash]));assert.equal(await scalar('select auth_user_id from account_deletion_jobs'),null);
    });
    console.log(`Account recovery SQL: ${passed} scenarios passed (isolated local DB).`);
}finally{await db.close();}
