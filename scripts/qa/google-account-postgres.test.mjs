import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {connect,contended,scalar,wallet} from './commerce-postgres-support.mjs';
import {setupBaseline} from './fixtures/commerce-postgres-baseline.mjs';
import {applyHintPolicyRelease,applyRelease22Forward,applySessionFile,learningMigrations,googleAccountMigrations} from './fixtures/session-postgres-baseline.mjs';

test('Google onboarding preserves accounts and enforces database boundaries',{timeout:120000},async t=>{
 const clients=[],passed=[];const open=async role=>{const c=await connect(role);clients.push(c);return c;};
 t.after(async()=>{await Promise.allSettled(clients.map(c=>c.end()));});
 const admin=await open();await setupBaseline(admin);await applyHintPolicyRelease(admin);await applyRelease22Forward(admin);
 for(const file of [...learningMigrations,...googleAccountMigrations])await applySessionFile(admin,file);
 const a=await open('service_role'),b=await open('service_role');
 const hash='scrypt-v1:'+'a'.repeat(32)+':'+'b'.repeat(128),replacement='scrypt-v1:'+'c'.repeat(32)+':'+'d'.repeat(128);
 const terms=await scalar(admin,'select version as result from public.current_terms_policy where singleton');
 const auth=async()=>{const id=randomUUID();await admin.query('insert into auth.users(id) values($1)',[id]);return id;};
 const setup=(c,id,name,legacy=null,version=terms,passwordHash=hash)=>scalar(c,'select public.complete_google_account($1,$2,$3,$4,$5,$6) as result',[id,name,passwordHash,version,legacy!==null,legacy]);
 const credential=(c,id)=>scalar(c,'select public.google_account_credential($1) as result',[id]);
 const check=async(name,fn)=>t.test(name,async()=>{await fn();passed.push(name);});
 await check('new account, consent and private password are committed once across concurrent requests',async()=>{
  const id=await auth();
  const [left,right]=await contended(admin,a,b,()=>setup(a,id,'NewPlayer'),()=>setup(b,id,'OtherName'));
  assert.deepEqual(left,right);assert.equal(left.userId,id);assert.equal(left.username,'NewPlayer');
  assert.equal(await scalar(admin,'select count(*)::int as result from public.account_terms_consents where user_id=$1 and version=$2',[id,terms]),1);
  assert.equal(await credential(a,id),hash);
  await setup(a,id,'Changed',null,terms,replacement);assert.equal(await credential(a,id),hash);
 });
 await check('failed consent rolls back profile, link and password',async()=>{
  const id=await auth();await assert.rejects(setup(a,id,'NoConsent',null,'old-version'));
  assert.equal(await scalar(admin,'select count(*)::int as result from public.profiles where id=$1',[id]),0);
  assert.equal(await credential(a,id),null);
 });
 await check('existing Google profile retains wallet and progress',async()=>{
  const id=await auth();await admin.query('insert into public.profiles(id,name,rating) values($1,$2,1234)',[id,'OldDisplay']);
  await admin.query('insert into public.ticket_wallets(user_id,ranked_tickets,hint_tickets) values($1,7,4)',[id]);
  const before=await wallet(admin,id);
  assert.equal((await setup(a,id,'OldGoogle')).userId,id);
  assert.deepEqual(await wallet(admin,id),before);
  assert.equal(await scalar(admin,'select rating as result from public.profiles where id=$1',[id]),1234);
 });
 await check('legacy linking verifies real bcrypt, retains ID/tickets, and cannot bind twice',async()=>{
  const id=await auth(),name='LegacyQA',old='SyntheticOldPassword123';
  await admin.query("insert into public.profiles(id,name,password_hash,rating) values($1,$1,extensions.crypt($2,extensions.gen_salt('bf',4)),1400)",[name,old]);
  await admin.query('insert into public.ticket_wallets(user_id,ranked_tickets) values($1,9)',[name]);
  assert.equal((await setup(a,id,name,'wrong')).code,'LEGACY_AUTH_REQUIRED');
  assert.equal(await scalar(admin,"select attempts as result from qg_private.password_attempt_budgets where account_key=sha256(convert_to($1,'UTF8'))",[name]),1);
  const before=await wallet(admin,name);assert.equal((await setup(a,id,name,old)).userId,name);
  assert.deepEqual(await wallet(admin,name),before);assert.equal(await credential(a,id),hash);
  await assert.rejects(setup(b,await auth(),name,old));
  await assert.rejects(setup(b,await auth(),'newplayer'));
 });
 await check('a second existing profile is never discarded by linking',async()=>{
  const id=await auth();await admin.query("insert into public.profiles(id,name) values($1,'Existing')",[id]);
  assert.equal((await setup(a,id,'LegacyQA','SyntheticOldPassword123')).code,'ALREADY_HAS_ACCOUNT');
  assert.equal(await credential(a,id),null);
 });
 await check('linked deletion verifies both IDs and password updates preserve game data',async()=>{
  const id=await scalar(admin,"select auth_user_id as result from public.google_account_links where user_id='LegacyQA'");
  const before=await wallet(admin,'LegacyQA');
  assert.equal(await scalar(a,'select public.change_google_account_password($1,$2) as result',[id,replacement]),true);
  assert.equal(await credential(a,id),replacement);assert.deepEqual(await wallet(admin,'LegacyQA'),before);
  await assert.rejects(a.query("select public.begin_account_deletion('LegacyQA',$1,$2)",['a'.repeat(64),randomUUID()]));
  await a.query("select public.begin_account_deletion('LegacyQA',$1,$2)",['a'.repeat(64),id]);
  await assert.rejects(a.query('select public.change_google_account_password($1,$2)',[id,hash]));
  await admin.query("delete from public.profiles where id='LegacyQA'");
  assert.equal(await credential(a,id),null);
 });
 await check('browser roles cannot read credentials, forge links or call retired password RPCs',async()=>{
  for(const role of ['anon','authenticated']){
   const c=await open(role),id=await auth();
   await assert.rejects(setup(c,id,'Forged'));
   await assert.rejects(credential(c,id));
   await assert.rejects(c.query('select * from public.google_account_links'));
   await assert.rejects(c.query('select * from qg_private.google_account_credentials'));
   await assert.rejects(c.query("select public.login_user('LegacyQA','guess')"));
   await assert.rejects(c.query("select public.register_user('Forged','password')"));
  }
 });
 await writeFile(join(tmpdir(),'google-account-postgres-results.json'),JSON.stringify({passed,postgres:17,externalRequests:false},null,2));
});
