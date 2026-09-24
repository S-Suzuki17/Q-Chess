import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

if (!process.argv[2]) throw Error('Pass a local PGlite runtime, never a database URL.');
const {PGlite} = await import(pathToFileURL(resolve(process.argv[2])).href);
const db = new PGlite();
const scalar = async (sql, args=[]) => Object.values((await db.query(sql,args)).rows[0])[0];
try {
    await db.exec(`
        create role anon; create role authenticated; create role service_role bypassrls;
        revoke create on schema public from public;
        create schema extensions; create schema attacker;
        grant usage on schema public,extensions,attacker to anon,authenticated,service_role;
        create table public.profiles(id text primary key,name text,password_hash text,email text);
        create table attacker.profiles (like public.profiles);
        create temp table profiles (like public.profiles);
        insert into public.profiles values('Alice','Alice','real',null);
        insert into attacker.profiles values('Alice','Fake','wrong',null);
        insert into pg_temp.profiles values('Alice','Fake','wrong',null);
        -- Deterministic crypto doubles test schema resolution, NOT bcrypt.
        create function extensions.crypt(text,text) returns text language sql as $$select $1$$;
        create function extensions.gen_salt(text) returns text language sql as $$select 'fixture'::text$$;
        create function attacker.crypt(text,text) returns text language sql as $$select $2$$;
        create function public.login_user(p_id text,p_password text) returns boolean language plpgsql security definer as $$
        declare v_hash text; begin select password_hash into v_hash from profiles where id=p_id;
        if v_hash is null then return false; end if; return v_hash=crypt(p_password,v_hash); end $$;
        create function public.register_user(p_id text,p_password text) returns boolean language plpgsql security definer as $$
        begin insert into profiles(id,name,password_hash) values(p_id,p_id,crypt(p_password,gen_salt('bf')));
        return true; exception when unique_violation then return false; end $$;
        create function public.update_user_email(p_id text,p_password text,p_email text) returns boolean language plpgsql security definer as $$
        declare v_hash text; begin select password_hash into v_hash from profiles where id=p_id;
        if v_hash is null then return false; end if;
        if v_hash=crypt(p_password,v_hash) then update profiles set email=p_email where id=p_id; return true;
        else return false; end if; end $$;
        create function public.record_match_result(uuid,text,text,text,integer) returns boolean language sql as $$select false$$;
        create function public.update_ratings_on_match() returns trigger language plpgsql as $$begin return new; end$$;
    `);
    await db.exec(await readFile('supabase/migrations/20260924145927_fixed_legacy_function_search_paths.sql','utf8'));
    const paths=(await db.query("select proconfig from pg_proc where pronamespace='public'::regnamespace and proname in ('login_user','register_user','update_user_email','record_match_result','update_ratings_on_match')")).rows;
    assert.equal(paths.length,5);
    assert.ok(paths.every(r=>r.proconfig.includes('search_path=pg_catalog, public, extensions, pg_temp')));
    for (const role of ['anon','authenticated','service_role']) {
        await db.exec(`set role ${role}; set search_path=attacker,pg_temp,public,extensions;`);
        assert.equal(await scalar("select public.login_user('Alice','wrong')"),false);
        assert.equal(await scalar("select public.login_user('Alice','real')"),true);
        assert.equal(await scalar("select public.update_user_email('Alice','wrong','bad@example.test')"),false);
        assert.equal(await scalar("select public.update_user_email('Alice','real','verified-path@example.test')"),true);
        assert.equal(await scalar('select public.register_user($1,$2)', ['New'+role,'real']),true);
        await db.exec('reset role; reset search_path;');
        assert.equal(await scalar('select count(*) from public.profiles where id=$1',['New'+role]),1);
        assert.equal(await scalar('select count(*) from attacker.profiles where id=$1',['New'+role]),0);
    }
    assert.equal(await scalar("select email from public.profiles where id='Alice'"),'verified-path@example.test');
    assert.equal(await scalar("select email from attacker.profiles where id='Alice'"),null);
    assert.equal(await scalar("select email from pg_temp.profiles where id='Alice'"),null);
    console.log('PASS fixed paths on all 5 functions; caller/temp-schema shadowing denied for all 3 API roles.');
    console.log('PASS legacy signatures and successful login/register/email behavior preserved; unrelated rows untouched.');
} finally { await db.close(); }
