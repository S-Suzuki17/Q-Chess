import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID, randomBytes } from 'node:crypto';
import { readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupSessionBaseline, combinedPendingMigrations, applySessionFile, sessionBaselineEvidence } from './fixtures/session-postgres-baseline.mjs';
import { connect, scalar, account, contended, bind, member, snapshot, LEGACY_PRICE, HASH } from './commerce-postgres-support.mjs';

const CROWN='20261006172232_dormant_crown_first_attempt.sql';
const pending=[...new Set([...combinedPendingMigrations,CROWN])].sort();
const key='crown:strength:v1:1'; // Current release mapping, still behind closed provider gates.
const authorize=(client,user,rank=key,id=randomUUID())=>scalar(client,'select public.authorize_crown_first_attempt($1,$2,$3) as result',[id,user,rank]);
const grant=(user,rank=key)=>({id:randomUUID(),user,rank,purpose:'crown_first_attempt',provider:'fixture_verified',transaction:randomUUID(),hash:HASH});
const record=(client,g)=>scalar(client,'select public.record_verified_rewarded_ad($1,$2,$3,$4,$5,$6,$7,null) as result',
    [g.id,g.user,g.purpose,g.rank,g.provider,g.transaction,g.hash]);
const entitlement=(client,user)=>scalar(client,'select public.get_shared_match_entitlement($1) as result',[user]);

test('Crown first attempt: actual shared ledger on combined native PostgreSQL upgrade', {timeout:180000},async t=>{
    const clients=[],passed=[];let failures=0;
    const open=async role=>{const c=await connect(role);clients.push(c);return c;};
    const admin=await open();let a,b,legacy,nativeVersion,standardMember;
    t.after(async()=>{await Promise.allSettled(clients.map(c=>c.end()));});
    const check=async(name,fn)=>t.test(name,{timeout:20000},async()=>{try{await fn();passed.push(name);}catch(error){failures++;throw error;}});
    const count=(table,user)=>scalar(admin,`select count(*)::integer as result from public.${table} where user_id=$1`,[user]);
    const consumed=g=>scalar(admin,'select consumed_by::text as result from public.verified_rewarded_ad_grants where grant_id=$1',[g.id]);

    await check('public-only baseline applies every original pending file, actual shared foundation and Crown without SQL rewrites',async()=>{
        nativeVersion=await setupSessionBaseline(admin,'commerce_upgrade');
        a=await open('service_role');b=await open('service_role');
        const user=await account(admin),checkout='cs_live_CROWNPREUPGRADE';
        await a.query("select public.register_stripe_live_checkout_intent($1,$2,$3,clock_timestamp()+interval '1 hour')",[user,checkout,LEGACY_PRICE]);
        legacy={user,checkout,subscription:'sub_CROWNPREUPGRADE',price:LEGACY_PRICE,live:true,
            start:new Date(Date.now()-86400000).toISOString(),end:new Date(Date.now()+29*86400000).toISOString()};
        await admin.query('delete from public.stripe_billing_mode_pin');
        const discovered=(await readdir(new URL('../../supabase/migrations/',import.meta.url)))
            .filter(name=>name.endsWith('.sql')&&name>=pending[0]).sort();
        assert.deepEqual(discovered,pending,'Every pending migration must be covered by the combined fixture');
        assert.equal(pending.includes('20261006171148_shared_match_admission.sql'),true);
        for(const name of pending)await applySessionFile(admin,name);
        assert.deepEqual(await scalar(a,'select public.stripe_commerce_protocol_version() as result'),
            {version:1,newSalesEnabled:false,spendingEnabled:false,reversalsReady:false});
        assert.equal(await scalar(admin,'select count(*)::integer as result from public.stripe_commerce_price_bindings'),0);
        await bind(admin);
    });
    assert.ok(a&&b,'Baseline did not complete');
    await check('anonymous/authenticated have neither table access nor execution and RLS defaults to deny',async()=>{
        assert.equal(await scalar(admin,"select relrowsecurity as result from pg_class where oid='public.crown_first_attempt_authorizations'::regclass"),true);
        assert.equal(await scalar(admin,"select prosecdef as result from pg_proc where oid='public.authorize_crown_first_attempt(uuid,text,text)'::regprocedure"),false);
        for(const role of ['anon','authenticated']) {
            const c=await open(role);
            await assert.rejects(authorize(c,'Alice'),{code:'42501'});
            await assert.rejects(c.query('select * from public.crown_first_attempt_authorizations'),{code:'42501'});
            await assert.rejects(record(c,grant('Alice')),{code:'42501'});
        }
        await admin.query('create role qg_crown_probe; grant usage on schema public to qg_crown_probe; grant select,insert on public.crown_first_attempt_authorizations to qg_crown_probe');
        const user=await account(admin),g=grant(user);await record(a,g);await authorize(a,user);
        await admin.query('set role qg_crown_probe');
        assert.equal(await scalar(admin,'select count(*)::integer as result from public.crown_first_attempt_authorizations'),0);
        await assert.rejects(admin.query("insert into public.crown_first_attempt_authorizations(user_id,rank_key,authorization_id,source) values($1,$2,$3,'subscription')",[user,'other',randomUUID()]),{code:'42501'});
        await admin.query('reset role');
    });
    await check('absence of independently verified evidence creates neither authorization nor bonus allowance',async()=>{
        const user=await account(admin);
        assert.deepEqual(await authorize(a,user),{state:'reward_required',userId:user,rankKey:key});
        assert.equal(await count('crown_first_attempt_authorizations',user),0);
        assert.equal(await count('verified_rewarded_ad_grants',user),0);
        assert.equal(await scalar(admin,'select ranked_tickets::text as result from public.ticket_wallets where user_id=$1',[user]),'0');
    });
    await check('100 stage keys consume only 34 strength grants, with every time-control change and retry reused',async()=>{
        const user=await account(admin),grants=[];
        for(let strength=1;strength<=34;strength++){
            const credit=grant(user,`crown:strength:v1:${strength}`);grants.push(credit);await record(a,credit);
        }
        const firstByKey=new Map();
        for(let stage=1;stage<=100;stage++){
            const rank=`crown:strength:v1:${Math.floor((stage-1)/3)+1}`,first=firstByKey.get(rank);
            const receipt=await authorize(a,user,rank);
            if(first)assert.deepEqual(receipt,{...first,reused:true});
            else {assert.equal(receipt.reused,false);firstByKey.set(rank,receipt);}
            assert.deepEqual(await authorize(b,user,rank),{...receipt,reused:true});
        }
        assert.equal(firstByKey.size,34);assert.equal(await count('crown_first_attempt_authorizations',user),34);
        assert.equal((await Promise.all(grants.map(consumed))).filter(Boolean).length,34);
        assert.equal(await scalar(admin,'select ranked_tickets::text as result from public.ticket_wallets where user_id=$1',[user]),'0');
    });
    await check('current terms guard new monetized unlocks while existing no-charge retries retain their rights',async()=>{
        const user=await account(admin),earned=grant(user),spare=grant(user),newRank='crown:fixture:v1:newtermsrank',next=grant(user,newRank);
        for(const credit of [earned,spare,next])await record(a,credit);
        await admin.query("delete from public.account_terms_consents where user_id=$1 and version='2026-10-07.1'",[user]);
        await assert.rejects(authorize(a,user),{code:'42501'});
        assert.equal(await count('crown_first_attempt_authorizations',user),0);assert.equal(await consumed(earned),null);
        await admin.query("insert into public.account_terms_consents(user_id,version) values($1,'2026-10-07.1')",[user]);
        const first=await authorize(a,user);
        await admin.query("delete from public.account_terms_consents where user_id=$1 and version='2026-10-07.1'",[user]);
        assert.deepEqual(await authorize(b,user),{...first,reused:true});
        await assert.rejects(authorize(b,user,newRank),{code:'42501'});
        assert.equal(await count('crown_first_attempt_authorizations',user),1);
        assert.equal(await consumed(earned),first.authorizationId);assert.equal(await consumed(spare),null);
        assert.equal(await consumed(next),null);
    });
    await check('a long-earned grant has no expiry and consumes once for any number of retries',async()=>{
        const user=await account(admin),g=grant(user);await record(a,g);
        await admin.query("update public.verified_rewarded_ad_grants set verified_at=clock_timestamp()-interval '5 years' where grant_id=$1",[g.id]);
        assert.equal(await consumed(g),null);const first=await authorize(a,user);
        assert.equal(first.source,'verified_ad');assert.equal(first.reused,false);assert.equal(await consumed(g),first.authorizationId);
        for(let i=0;i<5;i++)assert.deepEqual(await authorize(b,user),{...first,reused:true});
        assert.equal(await count('crown_first_attempt_authorizations',user),1);
        assert.deepEqual(await record(a,g),{grantId:g.id,duplicate:true});
        await assert.rejects(a.query('select public.record_verified_rewarded_ad($1,$2,$3,$4,$5,$6,$7,clock_timestamp())',
            [randomUUID(),user,g.purpose,key,g.provider,randomUUID(),HASH]),{code:'22023'});
    });
    await check('wrong account, purpose and stable key cannot spend a grant',async()=>{
        const user=await account(admin),other=await account(admin);
        const grants=[grant(other),{...grant(user),purpose:'online_ranked_match'},grant(user,'crown:fixture:v1:rank2')];
        for(const g of grants)await record(a,g);
        assert.equal((await authorize(b,user)).state,'reward_required');
        for(const g of grants)assert.equal(await consumed(g),null);
    });
    await check('provider transaction collisions and cross-account replay never award another credit',async()=>{
        const user=await account(admin),other=await account(admin),g=grant(user);await record(a,g);
        for(const change of [{id:randomUUID()},{user:other},{rank:'different'},{hash:'b'.repeat(64)},{purpose:'online_ranked_match'}]) {
            await assert.rejects(record(b,{...g,...change}),{code:'23505'});
        }
        assert.equal(await count('verified_rewarded_ad_grants',user),1);assert.equal(await count('verified_rewarded_ad_grants',other),0);
    });
    await check('multiple legitimate grants consume exactly one and preserve the remaining earned grant',async()=>{
        const user=await account(admin),one=grant(user),two=grant(user);await record(a,one);await record(a,two);
        const first=await authorize(a,user);await authorize(b,user);
        const values=await Promise.all([consumed(one),consumed(two)]);
        assert.equal(values.filter(v=>v===first.authorizationId).length,1);assert.equal(values.filter(v=>v===null).length,1);
    });
    await check('independent concurrent first attempts contend and return one durable authorization',async()=>{
        const user=await account(admin),g=grant(user);await record(a,g);
        const [left,right]=await contended(admin,a,b,c=>authorize(c,user),c=>authorize(c,user));
        assert.equal(left.reused,false);assert.deepEqual(right,{...left,reused:true});
        assert.equal(await consumed(g),left.authorizationId);assert.equal(await count('crown_first_attempt_authorizations',user),1);
    });
    await check('rollback of the first concurrent attempt leaves the same earned credit for the waiter',async()=>{
        const user=await account(admin),g=grant(user);await record(a,g);
        const [rolledBack,committed]=await contended(admin,a,b,c=>authorize(c,user),c=>authorize(c,user),{rollback:true});
        assert.notEqual(rolledBack.authorizationId,committed.authorizationId);assert.equal(committed.reused,false);
        assert.equal(await consumed(g),committed.authorizationId);assert.equal(await count('crown_first_attempt_authorizations',user),1);
    });
    await check('a delayed verifier commit is visible to a waiting first attempt without another ad',async()=>{
        const user=await account(admin),g=grant(user);
        const [,result]=await contended(admin,a,b,c=>record(c,g),c=>authorize(c,user));
        assert.equal(result.state,'authorized');assert.equal(await consumed(g),result.authorizationId);
    });
    await check('paid Standard and Plus first attempts persist authorization for free retries after expiry',async()=>{
        for(const sku of ['standard_monthly','plus_monthly']) {
            const user=await account(admin),earned=sku==='standard_monthly'?grant(user):null;
            if(earned)await record(a,earned);
            const m=await member(a,user,sku,true);
            const evidence={eventId:`evt_CROWN${randomBytes(8).toString('hex')}`,payloadHash:HASH,eventType:'invoice.paid',eventCreated:100,
                observedAt:new Date().toISOString(),checkoutId:m.checkout,userId:user,sku,priceId:m.price,amountTotal:m.amount,currency:'usd',livemode:true,
                subscriptionId:m.subscription,customerId:`cus_${user}`,status:'active',periodEnd:m.end,paidNewPeriod:true,cancelAtPeriodEnd:false,token:m.token,
                latestInvoiceId:`in_${user}`,paidPeriod:{invoiceId:`in_${user}`,periodStart:m.start,periodEnd:m.end}};
            assert.equal((await scalar(a,'select public.fulfill_stripe_commerce_subscription($1::jsonb) as result',[JSON.stringify(evidence)])).applied,true);
            assert.equal((await entitlement(a,user)).noAds,true);const first=await authorize(a,user);assert.equal(first.source,'subscription');
            if(sku==='standard_monthly')standardMember={user,subscription:m.subscription,paidEnd:m.end};
            assert.equal(await count('verified_rewarded_ad_grants',user),earned?1:0);
            if(earned)assert.equal(await consumed(earned),null,'Paid exemption must preserve previously earned credit');
            await assert.rejects(record(a,grant(user)),{code:'42501'});
            await admin.query('update public.stripe_memberships set refund_blocked_until=period_end where user_id=$1',[user]);
            assert.equal((await entitlement(a,user)).noAds,false);
            assert.equal((await authorize(b,user,'crown:fixture:v1:refundedrank')).state,'reward_required');
            assert.deepEqual(await authorize(b,user),{...first,reused:true});
            assert.equal(await count('crown_first_attempt_authorizations',user),1);
            await admin.query('update public.stripe_memberships set refund_blocked_until=null where user_id=$1',[user]);
            await admin.query("update public.stripe_memberships set period_end=clock_timestamp()-interval '1 hour' where user_id=$1",[user]);
            assert.equal((await entitlement(a,user)).plan,'free');assert.deepEqual(await authorize(b,user),{...first,reused:true});
            assert.equal((await authorize(b,user,'crown:fixture:v1:newrank')).state,'reward_required');
        }
    });
    await check('legacy exemption stays local to Campaign and also survives membership expiry for retries',async()=>{
        legacy.token=(await scalar(a,'select public.acquire_stripe_reconciliation($1,true) as result',[legacy.subscription])).token;
        assert.equal((await snapshot(a,legacy)).result.applied,true);
        assert.deepEqual(await entitlement(a,legacy.user),{plan:'legacy299',noAds:false,unlimitedOnlineRanked:false,periodEnd:null});
        await assert.rejects(authorize(a,legacy.user),{code:'42501'});
        await a.query("select public.accept_current_account_terms($1,'2026-10-07.1')",[legacy.user]);
        const first=await authorize(a,legacy.user);assert.equal(first.source,'legacy_campaign');
        await admin.query("update public.stripe_memberships set period_end=clock_timestamp()-interval '1 hour' where user_id=$1",[legacy.user]);
        assert.deepEqual(await authorize(b,legacy.user),{...first,reused:true});
    });
    await check('restriction, missing accounts and invalid keys fail closed even for retries',async()=>{
        const user=await account(admin),g=grant(user);await record(a,g);await authorize(a,user);
        await admin.query('insert into public.account_restrictions(user_id,blocked) values($1,true)',[user]);
        await assert.rejects(authorize(a,user),{code:'42501'});await assert.rejects(record(a,grant(user)),{code:'42501'});
        await assert.rejects(authorize(a,'MissingAccount'),{code:'42501'});
        for(const invalid of ['',null,'bad key','x'.repeat(129)])await assert.rejects(authorize(a,user,invalid),{code:'22023'});
    });
    await check('all unsupported isolation levels reject stale restrictions, paid entitlement and ad snapshots without spending or unlocking',async()=>{
        assert.ok(standardMember);
        const untouched=async(user,g,rank=key)=>{
            assert.equal(await scalar(admin,'select count(*)::integer as result from public.crown_first_attempt_authorizations where user_id=$1 and rank_key=$2',[user,rank]),0);
            if(g)assert.equal(await consumed(g),null);
        };
        for(const isolation of ['read uncommitted','repeatable read','serializable']) {
            // Capture a snapshot while eligible. The independent backend holds
            // the account lock and changes its restriction; the guard must reject
            // before waiting on that lock or consuming the existing earned ad.
            const user=await account(admin),g=grant(user);await record(b,g);
            await a.query(`begin isolation level ${isolation}`);
            assert.equal(await scalar(a,'select count(*)::integer as result from public.verified_rewarded_ad_grants where user_id=$1',[user]),1);
            await b.query('begin');await b.query('select id from public.profiles where id=$1 for update',[user]);
            await b.query('insert into public.account_restrictions(user_id,blocked) values($1,true)',[user]);
            try{await assert.rejects(authorize(a,user),{code:'25000'});}finally{await a.query('rollback');await b.query('commit');}
            await untouched(user,g);

            // A newly committed independently verified grant cannot be lost or
            // spent by an authorization transaction with an older snapshot.
            const waiting=await account(admin),earned=grant(waiting);
            await a.query(`begin isolation level ${isolation}`);
            assert.equal(await scalar(a,'select count(*)::integer as result from public.verified_rewarded_ad_grants where user_id=$1',[waiting]),0);
            await record(b,earned);
            try{await assert.rejects(authorize(a,waiting),{code:'25000'});}finally{await a.query('rollback');}
            await untouched(waiting,earned);

            // Expiry after a paid snapshot must not establish a new free retry
            // authorization. An earlier legitimate authorization is untouched.
            await admin.query('update public.stripe_memberships set period_end=$2 where subscription_id=$1',[standardMember.subscription,standardMember.paidEnd]);
            await a.query(`begin isolation level ${isolation}`);assert.equal((await entitlement(a,standardMember.user)).noAds,true);
            await admin.query("update public.stripe_memberships set period_end=clock_timestamp()-interval '1 hour' where subscription_id=$1",[standardMember.subscription]);
            const newRank='crown:fixture:v1:expiredsnapshot';
            try{await assert.rejects(authorize(a,standardMember.user,newRank),{code:'25000'});}finally{await a.query('rollback');}
            await untouched(standardMember.user,null,newRank);
            assert.equal(await count('crown_first_attempt_authorizations',standardMember.user),1);
        }
    });
    await check('erasure removes unlock and account binding while preserving the provider replay fence across recreation',async()=>{
        const user=await account(admin),g=grant(user);await record(a,g);await authorize(a,user);
        const ticket=randomBytes(32).toString('hex');await a.query('select public.begin_account_deletion($1,$2,null)',[user,ticket]);
        await assert.rejects(authorize(b,user),{code:'42501'});
        await a.query('select public.erase_account_data($1)',[ticket]);await a.query('select public.finish_account_deletion($1)',[ticket]);
        assert.equal(await count('crown_first_attempt_authorizations',user),0);
        assert.equal(await scalar(admin,'select user_id as result from public.verified_rewarded_ad_grants where grant_id=$1',[g.id]),null);
        await admin.query('insert into public.profiles(id) values($1)',[user]);
        await admin.query("insert into public.account_terms_consents(user_id,version) values($1,'2026-10-07.1')",[user]);
        assert.equal((await authorize(b,user)).state,'reward_required');await assert.rejects(record(b,g),{code:'23505'});
        const fresh=grant(user);await record(a,fresh);assert.equal((await authorize(a,user)).source,'verified_ad');
    });
    await check('account deletion ordered before admission fences both pending and existing reward credits',async()=>{
        const user=await account(admin),g=grant(user);await record(a,g);const ticket=randomBytes(32).toString('hex');
        const result=await contended(admin,a,b,c=>c.query('select public.begin_account_deletion($1,$2,null)',[user,ticket]),
            c=>authorize(c,user).then(()=>({denied:false}),error=>({denied:error.code==='42501'})));
        assert.deepEqual(result[1],{denied:true});assert.equal(await consumed(g),null);
    });
    await writeFile(join(tmpdir(),'crown-postgres-results.json'),JSON.stringify({passed:passed.length,failures,checks:passed,
        nativeVersion,baseline:{...sessionBaselineEvidence,pending},providerValidation:false,mappingActivated:false},null,2));
    assert.equal(failures,0);
    assert.equal(passed.length,18,'Do not silently drop Crown verification scenarios');
});
