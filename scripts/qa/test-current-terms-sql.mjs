// In-memory PostgreSQL only: no cluster directory, installation or network.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { setupStripeFixture } from './stripe-canonical-fixture.mjs';
const require = createRequire(new URL('../../scratch/ticket-sql/package.json', import.meta.url));
const { PGlite } = require('@electric-sql/pglite');
const migration = await readFile(new URL('../../supabase/migrations/20261003042315_approved_current_terms_consent.sql', import.meta.url),'utf8');
const consentTable = await readFile(new URL('../../supabase/migrations/20260924174539_account_terms_consent.sql', import.meta.url),'utf8');
for (const live of [false,true]) {
 const db=await PGlite.create();
 const scalar=async(sql,args=[]) => (await db.query(sql,args)).rows[0].result;
 const denied=async(sql,args=[]) => assert.rejects(()=>db.query(sql,args),/unavailable|effective|permission denied|Trusted service/i);
 try {
  await setupStripeFixture(db);
  await db.exec('drop table public.account_terms_consents;'+consentTable);
  await db.exec("insert into public.profiles(id) values('TermsOwner'),('NewOwner'); insert into public.account_terms_consents(user_id,version) values('TermsOwner','2026-09-25.1');");
  // An existing membership is established using the pre-upgrade contract.
  await db.exec('set role service_role');
  const checkout=live?'cs_live_TERMS001':'cs_test_TERMS001', price=live?'price_1ULM9fQWzwYDIuXWgs5Uj3yt':'price_TERMS001';
  const register=(owner,id)=>live?db.query('select public.register_stripe_live_checkout_intent($1,$2,$3,clock_timestamp()+interval \'1 hour\')',[owner,id,price]):db.query('select public.register_stripe_checkout_intent($1,$2,$3,false,clock_timestamp()+interval \'1 hour\')',[owner,id,price]);
  await register('TermsOwner',checkout);
  await db.exec('reset role;'+migration+'set role service_role');
  // Exercise pending-publication behavior explicitly without changing release SQL.
  await db.exec('reset role; update public.current_terms_policy set effective_date=null; set role service_role');
  const policy=()=>scalar("select public.current_account_terms_status('TermsOwner') as result");
  const accept=owner=>scalar('select public.accept_current_account_terms($1,\'2026-10-03.1\') as result',[owner]);
  assert.equal((await policy()).effective,false); assert.equal((await policy()).effectiveDate,null);
  await denied("select public.accept_current_account_terms('TermsOwner','2026-10-03.1')");
  const prefix=live?'stripe_live_':'stripe_';
  const grant='claim_'+prefix+'member_daily_grant';
  const paths=["public.claim_daily_login_reward('TermsOwner')",`public.${prefix}checkout_preflight('TermsOwner')`,`public.${grant}('TermsOwner')`,`public.${grant}_with_schedule('TermsOwner')`];
  for(const call of paths) await denied('select '+call);
  await assert.rejects(()=>register('TermsOwner',live?'cs_live_TERMS002':'cs_test_TERMS002'),/unavailable/);
  await db.exec("reset role; update public.current_terms_policy set effective_date=(clock_timestamp() at time zone 'Asia/Tokyo')::date+1; set role service_role");
  assert.equal((await policy()).effective,false);
  await denied("select public.accept_current_account_terms('TermsOwner','2026-10-03.1')");
  await db.exec("reset role; update public.current_terms_policy set effective_date=(clock_timestamp() at time zone 'Asia/Tokyo')::date; set role service_role");
  // Old consent alone still rejects every claim and both Checkout SQL entry points.
  assert.equal((await policy()).effective,true); assert.equal((await policy()).consent,null);
  for(const call of paths) await denied('select '+call);
  await assert.rejects(()=>register('TermsOwner',live?'cs_live_TERMS002':'cs_test_TERMS002'),/unavailable/);
  // Late signed payment projection must work despite no new consent.
  const lease=await scalar("select public.acquire_stripe_reconciliation('sub_TERMS001',$1) as result",[live]);
  const applied=await scalar(`select public.apply_stripe_canonical_membership_snapshot(
   'evt_TERMS001',$1,'invoice.paid',100,clock_timestamp(),'sub_TERMS001',$2,'cus_TERMS001','TermsOwner',$3,
   'active',clock_timestamp()+interval '30 days',$4,true,false,$5) as result`,['a'.repeat(64),checkout,price,live,lease.token]);
  assert.equal(applied.applied,true);
  await db.query("select public.release_stripe_reconciliation('sub_TERMS001',$1,$2)",[live,lease.token]);
  assert.equal((await scalar(`select public.${prefix}member_status_with_schedule('TermsOwner') as result`)).active,true);
  const consent=await accept('TermsOwner'); assert.ok(consent.consent.acceptedAt);
  assert.equal((await accept('TermsOwner')).consent.acceptedAt,consent.consent.acceptedAt);
  assert.equal((await scalar("select public.claim_daily_login_reward('TermsOwner') as result")).claimed,true);
  const received=await scalar(`select public.${grant}_with_schedule('TermsOwner') as result`);
  assert.deepEqual(received.credited,{ranked:3,hint:3});
  assert.equal((await scalar(`select public.${grant}('TermsOwner') as result`)).claimed,false);
  const walletPrefix=live?'member_':'test_member_', day=live?'last_live_member_grant_utc_day':'last_member_grant_utc_day';
  await db.exec(`update public.ticket_wallets set ranked_tickets=20,hint_tickets=20,${walletPrefix}ranked_tickets=59,${walletPrefix}hint_tickets=59,${day}=(clock_timestamp() at time zone 'UTC')::date-8 where user_id='TermsOwner'`);
  const capped=await scalar(`select public.${grant}('TermsOwner') as result`);
  assert.deepEqual(capped.credited,{ranked:1,hint:1}); assert.deepEqual(capped.tickets,{ranked:60,hint:60});
  assert.deepEqual(capped.freeTickets,{ranked:20,hint:20});
  // A new-version-only account can read/claim and open a new intent.
  await accept('NewOwner');
  assert.equal((await scalar("select public.daily_login_reward_status('NewOwner') as result")).enabled,true);
  assert.equal((await scalar(`select public.${prefix}checkout_preflight('NewOwner') as result`)).eligible,true);
  await register('NewOwner',live?'cs_live_NEWTERM1':'cs_test_NEWTERM1');
  await db.exec("insert into public.account_deletion_jobs values('NewOwner','canceling')");
  await denied("select public.accept_current_account_terms('NewOwner','2026-10-03.1')");
  for(const role of ['anon','authenticated']) {
   await db.exec('reset role; set role '+role);
   for(const call of paths) await denied('select '+call);
   await denied("select public.current_account_terms_status('TermsOwner')");
   await denied("select public.has_current_ticket_terms('TermsOwner')");
   await denied("select public.accept_current_account_terms('TermsOwner','2026-10-03.1')");
   await denied("update public.current_terms_policy set effective_date=current_date");
  }
  await db.exec('reset role; set role service_role');
  await denied("update public.current_terms_policy set effective_date=current_date");
  console.log(`PASS ${live?'live':'test'} SQL: pending/future/old-only denied; post-consent claims+checkout; pre-consent payment/status; retry; free20/paid60; role ACL; deletion fence`);
 } finally { await db.close(); }
}
