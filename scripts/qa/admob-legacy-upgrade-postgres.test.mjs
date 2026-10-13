// Exact allowance-era upgrade on disposable native PostgreSQL. This does not
// claim that the repository's separate historical full-replay blockers are fixed.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setupBaseline} from './fixtures/commerce-postgres-baseline.mjs';
import {combinedPendingMigrations,hintPolicyMigrations,emailRegistrationMigrations,assertReviewedMigrationInventory} from './fixtures/session-postgres-baseline.mjs';
import {connect,scalar,account,wallet,HASH} from './commerce-postgres-support.mjs';
const text=name=>readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8');
const compat='20261013075800_preserve_legacy_ad_reward_intents.sql';
test('allowance-era AdMob migration preserves rows and upgrades to an independent protocol-2 ledger',async t=>{
 const admin=await connect();let service;
 try{
  await assertReviewedMigrationInventory();await setupBaseline(admin);
  for(const name of [...combinedPendingMigrations,...hintPolicyMigrations,...emailRegistrationMigrations,'20261013071700_conventional_registration_repair.sql'])await admin.query(await text(name));
  await admin.query(await text('20260918165008_admob_reward_allowances.sql'));
  service=await connect('service_role');
  const user=await account(admin),pending=randomUUID(),credited=randomUUID();
  await admin.query('insert into public.ad_reward_intents(id,user_id,kind,transaction_id,credited_at) values($1,$3,\'hint\',null,null),($2,$3,\'hint\',\'legacy_credited_001\',clock_timestamp())',[pending,credited,user]);
  await admin.query("insert into public.ad_allowances(user_id,kind,used,bonus) values($1,'hint',2,6)",[user]);
  const rows=await scalar(admin,'select jsonb_agg(to_jsonb(i) order by id) as result from public.ad_reward_intents i');
  const before=await wallet(admin,user);
  await t.test('raw compatibility and protocol-2 SQL preserve old rows, indexes, wallet and callback grants',async()=>{
   await admin.query(await text(compat));await admin.query(await text('20261013075925_admob_verified_ticket_rewards.sql'));
   assert.deepEqual(await scalar(admin,'select jsonb_agg(to_jsonb(i) order by id) as result from public.ad_allowance_reward_intents i'),rows);
   assert.deepEqual(await wallet(admin,user),before);
   assert.equal(await scalar(service,'select public.ad_ticket_reward_protocol() as result'),2);
   assert.equal(await scalar(admin,"select has_function_privilege('service_role','public.ad_credit(uuid,text,text,bigint)','execute') as result"),true);
   // Applying this missing compatibility file to an already-upgraded target is safe.
   await admin.query(await text(compat));assert.deepEqual(await wallet(admin,user),before);
  });
  await t.test('old pending callbacks settle only old allowances and cannot grant new tickets',async()=>{
   const timestamp=Number(await scalar(admin,'select floor(extract(epoch from created_at)*1000)::bigint as result from public.ad_allowance_reward_intents where id=$1',[pending]));
   assert.equal(await scalar(service,"select public.ad_credit($1,'hint','legacy_pending_001',$2) as result",[pending,timestamp]),true);
   assert.equal(await scalar(service,"select public.ad_credit($1,'hint','legacy_pending_001',$2) as result",[pending,timestamp]),true);
   assert.equal(await scalar(admin,"select bonus as result from public.ad_allowances where user_id=$1 and kind='hint'",[user]),9);
   const result=await scalar(service,"select public.credit_ad_ticket_reward($1,'hint','legacy_pending_001',$2,$3) as result",[pending,timestamp,HASH]);
   assert.equal(result.status,'ignored');assert.deepEqual(await wallet(admin,user),before);
  });
  await t.test('new consented reward credits once; old callback cannot consume its intent',async()=>{
   const intent=await scalar(service,"select public.create_ad_ticket_reward($1,'hint') as result",[user]);
   const timestamp=Number(await scalar(admin,'select floor(extract(epoch from created_at)*1000)::bigint as result from public.ad_reward_intents where id=$1',[intent]));
   assert.equal(await scalar(service,"select public.ad_credit($1,'hint','new_ticket_001',$2) as result",[intent,timestamp]),false);
   assert.equal((await scalar(service,"select public.credit_ad_ticket_reward($1,'hint','new_ticket_001',$2,$3) as result",[intent,timestamp,HASH])).status,'credited');
   assert.equal((await wallet(admin,user)).hint_tickets,Number(before.hint_tickets)+3);
   for(const role of ['anon','authenticated'])assert.equal(await scalar(admin,'select has_table_privilege($1,\'public.ad_allowance_reward_intents\',\'select\') as result',[role]),false);
   await admin.query('delete from public.profiles where id=$1',[user]);
   assert.equal(await scalar(admin,'select count(*)::integer as result from public.ad_allowance_reward_intents where user_id=$1',[user]),0);
   assert.equal(await scalar(admin,'select count(*)::integer as result from public.ad_ticket_reward_receipts where intent_id=$1',[intent]),1);
  });
 }finally{await Promise.all([admin.end(),service?.end()]);}
});
