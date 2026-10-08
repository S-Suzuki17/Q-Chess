import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {it,expect} from 'vitest';
it('atomically stores contact email and bcrypt, logs in new and legacy names, and denies public access',async()=>{
 const db=await PGlite.create({extensions:{pgcrypto}});
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema extensions;create extension pgcrypto with schema extensions;
   create schema auth;create table auth.sessions(id uuid,user_id uuid,not_after timestamptz);
   create table public.system_status(maintenance_mode boolean);
   create table public.profiles(id text primary key,name text,password_hash text,rating int,rating_10s int,rating_3m int,rating_10m int);
   create table public.account_deletion_jobs(user_id text,phase text);
   grant usage on schema public to service_role,anon,authenticated;`);
  for(const file of ['20260924160910_account_security_controls.sql','20260924150213_legacy_password_attempt_budget.sql','20261008093454_email_account_registration.sql'])await db.exec(await readFile(`supabase/migrations/${file}`,'utf8'));
  const call=async(sql:string,params:unknown[])=> (await db.query<{ok:boolean}>(sql,params)).rows[0].ok;
  await db.exec('set role service_role');
  expect(await call('select public.register_account_secure($1,$2) ok',['Legacy','legacy-password-17'])).toBe(true);
  expect(await call('select public.register_account_with_email($1,$2,$3) ok',['NewName','correct-horse-17','new@example.test'])).toBe(true);
  expect(await call('select public.register_account_with_email($1,$2,$3) ok',['NewName','different-password-17','other@example.test'])).toBe(false);
  expect(await call('select public.login_user($1,$2) ok',['NewName','correct-horse-17'])).toBe(true);
  expect(await call('select public.login_user($1,$2) ok',['Legacy','legacy-password-17'])).toBe(true);
  expect(await call('select public.login_user($1,$2) ok',['NewName','incorrect-password'])).toBe(false);
  await expect(call('select public.register_account_with_email($1,$2,$3) ok',['Invalid','correct-horse-17','invalid'])).rejects.toThrow(/Invalid registration/);
  await expect(db.query('select * from qg_private.registration_contacts')).rejects.toThrow(/permission denied/);
  await db.exec('reset role');
  const row=(await db.query<{email:string;password_hash:string}>('select email,password_hash from qg_private.registration_contacts c join public.profiles p on p.id=c.user_id where p.id=$1',['NewName'])).rows[0];
  expect(row.email).toBe('new@example.test');expect(row.password_hash).toMatch(/^\$2[aby]\$/);expect(row.password_hash).not.toContain('correct-horse');
  expect((await db.query('select id from public.profiles where id=$1',['Invalid'])).rows).toHaveLength(0);
  for(const role of ['anon','authenticated']){
   await db.exec(`set role ${role}`);
   await expect(call('select public.register_account_with_email($1,$2,$3) ok',['Forged','correct-horse-17','fake@example.test'])).rejects.toThrow(/permission denied/);
   await expect(db.query('select * from qg_private.registration_contacts')).rejects.toThrow(/permission denied/);
   await db.exec('reset role');
  }
  await db.exec("delete from public.profiles where id='NewName'");expect((await db.query('select * from qg_private.registration_contacts')).rows).toHaveLength(0);
 }finally{await db.close();}
},30000);
