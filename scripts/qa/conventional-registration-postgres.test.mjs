// Disposable loopback PostgreSQL17 with real pgcrypto; no hosted writes or real accounts.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {connect,scalar,contended} from './commerce-postgres-support.mjs';
import {setupSessionBaseline,sessionBaselineEvidence} from './fixtures/session-postgres-baseline.mjs';
const oldFile='20261008093454_email_account_registration.sql',repairFile='20261013071700_conventional_registration_repair.sql';
const password='synthetic-registration-password-17',other='synthetic-alternative-password-17';
const register=(db,id,email='fixture@example.test',pw=password)=>scalar(db,'select public.register_account_with_email($1,$2,$3) as result',[id,pw,email]);
const login=(db,id,pw=password)=>scalar(db,'select public.login_user($1,$2) as result',[id,pw]);
test('repair observed hosted email escaping and reserved-name registration without replacing conventional auth',{timeout:180000},async t=>{
 const clients=[],checks=[];let admin,service,second,postgres,before,completed=false;
 const open=async role=>{const db=await connect(role);clients.push(db);return db;};
 const check=async(name,fn)=>{await t.test(name,async()=>{await fn();checks.push(name);});};
 const profile=id=>scalar(admin,'select to_jsonb(p) as result from public.profiles p where id=$1',[id]);
 const contact=id=>scalar(admin,'select email as result from qg_private.registration_contacts where user_id=$1',[id]);
 const signatures=['qg_private.register_account(text,text)','qg_private.register_account_with_email(text,text,text)','public.register_account_with_email(text,text,text)','public.register_account_secure(text,text)','public.login_user(text,text)'];
 const access=()=>scalar(admin,`select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('owner',p.proowner,'definer',p.prosecdef,'config',p.proconfig,'acl',p.proacl)) as result from pg_proc p where p.oid=any($1::regprocedure[])`,[signatures]);
 const preserved=async()=>({profile:await profile('BeforeRepair'),wallet:await scalar(admin,"select to_jsonb(w) as result from public.ticket_wallets w where user_id='BeforeRepair'"),status:await scalar(admin,'select jsonb_agg(to_jsonb(s)) as result from public.system_status s'),terms:await scalar(admin,'select jsonb_agg(to_jsonb(t)) as result from public.current_terms_policy t'),access:await access(),loginDefinition:await scalar(admin,"select pg_get_functiondef('public.login_user(text,text)'::regprocedure) as result")});
 try{
  admin=await open();await setupSessionBaseline(admin,'commerce_upgrade');postgres=await scalar(admin,'select version() as result');
  assert.equal(await scalar(admin,"select l.lanname as result from pg_proc p join pg_language l on l.oid=p.prolang where p.oid='extensions.crypt(text,text)'::regprocedure"),'c');
  // Reproduce the two-backslash literal independently observed in the hosted
  // function AND table constraint. Never rewrite historical source migrations.
  const historical=await readFile(new URL('../../supabase/migrations/'+oldFile,import.meta.url),'utf8');
  assert.equal((historical.match(/\+\\\./g)??[]).length,2);
  await admin.query(historical.replaceAll('+\\.','+\\\\.'));
  service=await open('service_role');second=await open('service_role');
  assert.equal(await scalar(service,"select public.register_account_secure('BeforeRepair',$1) as result",[password]),true);
  await admin.query("insert into public.ticket_wallets(user_id,ranked_tickets) values('BeforeRepair',3)");before=await preserved();
  await check('actual PostgreSQL standard strings reject normal email in the observed historical drift',async()=>{
   assert.equal(await scalar(admin,"select current_setting('standard_conforming_strings') as result"),'on');
   await assert.rejects(register(service,'BrokenEmail'),{code:'22023'});assert.equal(await profile('BrokenEmail'),undefined);assert.equal(await contact('BrokenEmail'),undefined);
  });
  await check('exact raw forward preserves existing passwords wallet settings terms and all function authority',async()=>{
   await admin.query(await readFile(new URL('../../supabase/migrations/'+repairFile,import.meta.url),'utf8'));assert.deepEqual(await preserved(),before);
   assert.equal(await login(service,'BeforeRepair'),true);assert.equal(await contact('BeforeRepair'),undefined);
  });
  await check('ordinary email registration uses real bcrypt and independent account-name login',async()=>{
   for(const [id,email] of [['EmailAfter','new@example.test'],['Guestly','guest+tag@sub.example.test'],['CPU17','cpu@example.test']]){
    assert.equal(await register(service,id,email),true);const row=await profile(id);assert.match(row.password_hash,/^\$2[aby]\$10\$/);
    assert.equal(await login(service,id),true);assert.equal(await login(service,id,other),false);assert.equal(await contact(id),email);
   }
   assert.equal(await login(service,'new@example.test'),false);assert.equal(await scalar(admin,'select count(*)::integer as result from auth.users'),0);
  });
  await check('invalid email formatting retains atomic rejection in function and contact constraint',async()=>{
   for(const [index,email] of [null,'','a@b','a@@b.test','A@example.test',' a@example.test','a b@example.test','a\n@example.test','<a>@example.test'].entries()){
    const id='Invalid'+index;await assert.rejects(register(service,id,email),{code:'22023'});assert.equal(await profile(id),undefined);assert.equal(await contact(id),undefined);
   }
   await assert.rejects(admin.query("update qg_private.registration_contacts set email='a@b' where user_id='EmailAfter'"),{code:'23514'});
   assert.equal(await contact('EmailAfter'),'new@example.test');
  });
  await check('reserved guest anonymous and computer identities cannot become unusable registered accounts',async()=>{
   for(const id of ['Guest','gUeSt','Anon','Anonymous','CPU','cpu']){
    await assert.rejects(register(service,id),{code:'22023'});await assert.rejects(scalar(service,'select public.register_account_secure($1,$2) as result',[id,password]),{code:'22023'});assert.equal(await profile(id),undefined);
   }
  });
  await check('duplicates cannot replace credentials or attach a different email',async()=>{
   const original=await profile('EmailAfter');assert.equal(await register(service,'EmailAfter','replacement@example.test',other),false);
   assert.deepEqual(await profile('EmailAfter'),original);assert.equal(await contact('EmailAfter'),'new@example.test');assert.equal(await login(service,'EmailAfter'),true);
  });
  await check('existing service-only registration and private contact ACL remain closed to public clients',async()=>{
   for(const role of ['anon','authenticated']){const db=await open(role);await assert.rejects(register(db,'Forbidden'),{code:'42501'});await assert.rejects(db.query('select * from qg_private.registration_contacts'),{code:'42501'});}
   assert.deepEqual(await access(),before.access);assert.equal(await profile('Forbidden'),undefined);
  });
  await check('contact persistence failure rolls back inserted profile and allows a genuine retry',async()=>{
   await admin.query("create function pg_temp.reject_contact() returns trigger language plpgsql as $$begin raise exception 'synthetic failure' using errcode='23514';end$$; create trigger qa_reject_contact before insert on qg_private.registration_contacts for each row execute function pg_temp.reject_contact()");
   try{await assert.rejects(register(service,'AtomicEmail'),{code:'23514'});assert.equal(await profile('AtomicEmail'),undefined);}finally{await admin.query('drop trigger qa_reject_contact on qg_private.registration_contacts');}
   assert.equal(await register(service,'AtomicEmail'),true);
  });
  await check('two independent backends commit one matching profile and contact on duplicate signup',async()=>{
   assert.deepEqual(await contended(admin,service,second,db=>register(db,'RaceEmail','first@example.test'),db=>register(db,'RaceEmail','second@example.test',other)),[true,false]);
   assert.equal(await contact('RaceEmail'),'first@example.test');assert.equal(await login(service,'RaceEmail'),true);assert.equal(await login(service,'RaceEmail',other),false);
  });
  await check('profile erasure removes contact and credentials without touching another account',async()=>{
   assert.equal(await register(service,'EraseEmail'),true);await admin.query("delete from public.profiles where id='EraseEmail'");
   assert.equal(await contact('EraseEmail'),undefined);assert.equal(await login(service,'EraseEmail'),false);assert.deepEqual(await preserved(),before);
  });
  assert.equal(checks.length,10);completed=true;
 }finally{
  const files=['supabase/migrations/'+repairFile,'scripts/qa/conventional-registration-postgres.test.mjs'];
  const sourceSha256=Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(await readFile(new URL('../../'+file,import.meta.url))).digest('hex')])));
  await writeFile(join(tmpdir(),'conventional-registration-postgres-results.json'),JSON.stringify({completed,passed:checks.length,checks,postgres,sourceSha256,baseline:sessionBaselineEvidence,independentBackends:true,limits:'Historical public auth/commerce scaffolding plus observed escaping drift and exact forward repair. Real bcrypt and lock contention; synthetic accounts only. Not hosted ACL equivalence, PostgREST, actual browser login or physical Android proof.'},null,2)+'\n');
  await Promise.allSettled(clients.map(db=>db.end()));
 }
});
