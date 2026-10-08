import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {connect,scalar,wallet,account,bind,member,snapshot,paidPeriod,contended,HASH,LEGACY_PRICE,unique} from './commerce-postgres-support.mjs';
import {setupBaseline,applyPending,baselineEvidence} from './fixtures/commerce-postgres-baseline.mjs';

// All provider rows here are explicitly SYNTHETIC. Real PostgreSQL transactions
// prove accounting and lock behavior, not provider signatures or public rollout.
test('native shared online/ranked start, consent, refund and entitlement', {timeout:180000}, async t=>{
    const clients=[],results=[];let failures=0;
    const open=async role=>{const c=await connect(role);clients.push(c);return c;};
    const admin=await open();let a,b;
    t.after(async()=>{await Promise.allSettled(clients.map(c=>c.end()));});
    const check=(name,fn)=>t.test(name,{timeout:20000},async()=>{try{await fn();results.push(name);}catch(e){failures++;throw e;}});
    const owner=async()=>{const id=randomUUID();await a.query('select public.renew_ranked_server_lease($1)',[id]);return id;};
    const cpu=(user,epoch,id=randomUUID())=>({id,host:user,joiner:`ai:${id}`,cpu:`ai:${id}`,owner:epoch,mode:'ranked',tokens:{}});
    const pvp=(host,joiner,epoch,mode='random')=>({id:randomUUID(),host,joiner,owner:epoch,mode,tokens:{}});
    const admit=(c,m)=>scalar(c,'select public.admit_shared_match($1,$2,$3,600,$4,$5,$6,$7,$8,$9) as result',
        [m.id,m.host,m.joiner,m.owner,m.mode,JSON.stringify(m.tokens),m.cpu??null,m.cpu?1200:null,m.cpu?4:null]);
    const finish=(c,m)=>m.mode==='random'?scalar(c,'select public.finish_shared_online_match($1,$2) as result',[m.id,m.owner])
        :scalar(c,"select public.settle_ranked_match($1,$2,$3,'WHITE',600,$4,$5,$6,'[]',$7) as result",[m.id,m.host,m.joiner,m.cpu??null,m.cpu?1200:null,m.cpu?4:null,m.owner]);
    const voided=(c,m)=>scalar(c,"select public.void_ranked_admission($1,$2,'synthetic_prestart_failure') as result",[m.id,m.owner]);
    const consent=async(c,m,user,source='ticket',grant=null,token=randomUUID())=>{
        const returned=await scalar(c,'select public.issue_shared_match_consent($1,$2,$3,$4,$5) as result',[token,user,m.id,source,grant]);
        m.tokens[user]=returned;return returned;
    };
    const grant=async(c,user,m,purpose='online_ranked_match',target=m.id)=>{
        const id=randomUUID(),transaction=unique('SYNTHETIC_AD_');
        const args=[id,user,purpose,target,'synthetic_signed_fixture',transaction,HASH,null];
        const issue=client=>scalar(client,'select public.record_verified_rewarded_ad($1,$2,$3,$4,$5,$6,$7,$8) as result',args);
        await issue(c);return {id,args,issue};
    };
    const used=(c,user)=>scalar(c,"select count(*)::integer as result from public.shared_match_allocations a join public.ranked_match_admissions m using(match_id) where user_id=$1 and utc_day=(clock_timestamp() at time zone 'UTC')::date and m.state in ('active','settled')",[user]);
    const exhausted=()=>account(admin,{quota:3,ranked:2});
    await check('all thirteen pending raw files apply over the explicit public baseline',async()=>{
        await setupBaseline(admin);await applyPending(admin);a=await open('service_role');b=await open('service_role');
        assert.notEqual(a.fixturePid,b.fixturePid);await bind(admin);
        assert.equal(await scalar(a,'select public.shared_match_admission_protocol_version() as result'),1);
        assert.equal(baselineEvidence.pending.length,13);
        assert.equal(baselineEvidence.pending.at(-1),'20261007141624_dormant_commerce_checkout_retirement.sql');
    });
    await check('three combined random and ranked STARTED matches then explicit choice without automatic ticket spend',async()=>{
        const user=await account(admin,{ranked:7}),epoch=await owner();
        for(let i=0;i<3;i++){
            const m=i===1?cpu(user,epoch):pvp(user,await account(admin),epoch);
            assert.equal((await admit(a,m)).state,'active');await finish(a,m);
        }
        assert.equal(await used(a,user),3);const m=cpu(user,epoch);
        assert.equal((await admit(a,m)).state,'choice_required');assert.equal((await wallet(a,user)).ranked_tickets,7);
        assert.equal(await scalar(a,'select count(*)::integer as result from public.ranked_match_admissions where match_id=$1',[m.id]),0);
        await consent(a,m,user);assert.equal((await admit(a,m)).state,'active');assert.equal((await wallet(a,user)).ranked_tickets,6);
        assert.equal(await scalar(a,'select source as result from public.shared_match_allocations where match_id=$1',[m.id]),'free_ticket');await finish(a,m);
    });
    await check('UTC day changes restore daily starts without deleting old receipts',async()=>{
        const user=await account(admin),epoch=await owner();
        for(let i=0;i<3;i++){const m=cpu(user,epoch);await admit(a,m);await finish(a,m);}
        await admin.query("update public.shared_match_allocations set utc_day=utc_day-1 where user_id=$1",[user]);
        assert.equal((await admit(a,cpu(user,epoch))).state,'active');assert.equal(await used(a,user),1);
    });
    await check('the same already-waiting match can use reset database UTC quota without creating a ticket consent',async()=>{
        const user=await account(admin,{quota:3,ranked:5}),m=cpu(user,await owner());
        assert.equal((await admit(a,m)).state,'choice_required');
        // Deterministic equivalent of these receipts falling before DB midnight;
        // the production function still reads clock_timestamp() and UTC itself.
        await admin.query("update public.ticket_spend_receipts set spent_at=spent_at-interval '1 day' where user_id=$1",[user]);
        assert.equal((await admit(a,m)).state,'active');
        assert.equal(await scalar(a,'select source as result from public.shared_match_allocations where match_id=$1',[m.id]),'daily_quota');
        assert.equal((await wallet(a,user)).ranked_tickets,5);
        assert.equal(await scalar(a,'select count(*)::integer as result from public.shared_match_consents where match_id=$1',[m.id]),0);
    });
    await check('PvP choice and insufficient participant roll back both humans atomically',async()=>{
        const funded=await account(admin,{quota:3,ranked:1}),empty=await account(admin,{quota:3}),epoch=await owner(),m=pvp(funded,empty,epoch);
        await consent(a,m,funded);assert.equal((await admit(a,m)).state,'choice_required');assert.equal((await wallet(a,funded)).ranked_tickets,1);
        await consent(a,m,empty);assert.equal((await admit(a,m)).reason,'INSUFFICIENT_FUNDS');assert.equal((await wallet(a,funded)).ranked_tickets,1);
        assert.equal(await scalar(a,'select count(*)::integer as result from public.shared_match_allocations where match_id=$1',[m.id]),0);
        assert.equal(await scalar(a,'select count(*)::integer as result from public.shared_match_consents where match_id=$1 and consumed_at is not null',[m.id]),0);
    });
    await check('reversed-order concurrent PvP matches serialize account locks and charge exactly one match',async()=>{
        const left=await exhausted(),right=await exhausted(),epoch=await owner(),m=pvp(left,right,epoch),n=pvp(right,left,epoch,'ranked');
        for(const x of [m,n])for(const user of [left,right])await consent(a,x,user);
        const responses=await Promise.all([admit(a,m),admit(b,n)]);
        assert.equal(responses.filter(r=>r.state==='active').length,1);assert.equal(responses.filter(r=>r.reason==='ACCOUNT_BUSY').length,1);
        assert.equal((await wallet(a,left)).ranked_tickets,1);assert.equal((await wallet(a,right)).ranked_tickets,1);
    });
    await check('duplicate/reconnected starts under real lock contention debit one ticket once',async()=>{
        const user=await exhausted(),m=cpu(user,await owner());await consent(a,m,user);
        const result=await contended(admin,a,b,c=>admit(c,m),c=>admit(c,m));assert.equal(result[0].state,'active');assert.equal(result[1].duplicate,true);
        assert.equal((await wallet(a,user)).ranked_tickets,1);
        const reconnect=await open('service_role');assert.equal((await admit(reconnect,m)).duplicate,true);
        await assert.rejects(admit(a,{...m,mode:'random'}),{code:'22023'});
    });
    await check('rollback after prepared start leaves quota, ticket and consent untouched',async()=>{
        const user=await exhausted(),m=cpu(user,await owner());await consent(a,m,user);
        const r=await contended(admin,a,b,c=>admit(c,m),c=>admit(c,m),{rollback:true});
        assert.equal(r[1].duplicate,false);assert.equal((await wallet(a,user)).ranked_tickets,1);
        assert.equal(await scalar(a,'select count(*)::integer as result from public.shared_match_allocations where match_id=$1',[m.id]),1);
    });
    await check('canceled queues/tombstones and prestart voids cost no daily start',async()=>{
        const user=await account(admin),epoch=await owner(),neverStarted=cpu(user,epoch);
        await voided(a,neverStarted);assert.equal((await admit(a,neverStarted)).state,'voided');assert.equal(await used(a,user),0);
        const m=cpu(user,epoch);await admit(a,m);assert.equal(await used(a,user),1);
        await voided(a,m);assert.equal(await used(a,user),0);assert.equal((await admit(b,m)).state,'voided');
    });
    await check('prestart ticket voids restore uncapped original free provenance exactly once',async()=>{
        const user=await exhausted(),epoch=await owner(),m=cpu(user,epoch);await consent(a,m,user);await admit(a,m);
        await contended(admin,a,b,c=>voided(c,m),c=>voided(c,m));assert.equal(await used(a,user),0);
        const refunds=(await a.query('select pool,spent_by from public.ranked_ticket_refunds where source_match_id=$1',[m.id])).rows;
        assert.deepEqual(refunds,[{pool:'free',spent_by:null}]);const n=cpu(user,epoch);await consent(a,n,user);await admit(a,n);await voided(a,n);
        assert.equal(await scalar(a,'select count(*)::integer as result from public.ranked_ticket_refunds where user_id=$1',[user]),1);
        assert.equal((await wallet(a,user)).ranked_tickets,1);
    });
    await check('consent binds account, match and source; source changes and replay races reject',async()=>{
        const user=await exhausted(),other=await exhausted(),epoch=await owner(),m=cpu(user,epoch),n=cpu(other,epoch);
        const token=await consent(a,m,user);n.tokens[other]=token;await assert.rejects(admit(a,n),{code:'42501'});
        const another=cpu(user,epoch);another.tokens[user]=token;await assert.rejects(admit(a,another),{code:'42501'});
        const evidence=await grant(a,user,m);
        await assert.rejects(consent(a,m,user,'verified_ad',evidence.id),{code:'23505'});
        const same=await contended(admin,a,b,c=>consent(c,m,user),c=>consent(c,m,user));assert.deepEqual(same,[token,token]);
    });
    await check('expired choice nonce is rejected without expiring earned ad credit',async()=>{
        const user=await exhausted(),m=cpu(user,await owner()),e=await grant(a,user,m);await consent(a,m,user,'verified_ad',e.id);
        await admin.query("update public.shared_match_consents set issued_at=clock_timestamp()-interval '20 minutes',expires_at=clock_timestamp()-interval '10 minutes' where match_id=$1",[m.id]);
        await assert.rejects(admit(a,m),{code:'42501'});
        assert.equal(await scalar(a,'select expires_at as result from public.verified_rewarded_ad_grants where grant_id=$1',[e.id]),null);
        assert.equal(await scalar(a,'select consumed_by as result from public.verified_rewarded_ad_grants where grant_id=$1',[e.id]),null);
    });
    await check('synthetic verified ad evidence deduplicates provider event and cannot switch account/purpose/target',async()=>{
        const user=await exhausted(),m=cpu(user,await owner()),e=await grant(a,user,m);
        assert.equal((await e.issue(b)).duplicate,true);
        const args=[...e.args];args[1]=await account(admin);
        await assert.rejects(scalar(a,'select public.record_verified_rewarded_ad($1,$2,$3,$4,$5,$6,$7,$8) as result',args),{code:'23505'});
        args[1]=user;args[2]='crown_first_attempt';await assert.rejects(scalar(a,'select public.record_verified_rewarded_ad($1,$2,$3,$4,$5,$6,$7,$8) as result',args),{code:'23505'});
        const other=cpu(user,m.owner);await assert.rejects(consent(a,other,user,'verified_ad',e.id),{code:'42501'});
    });
    await check('new verified grants require current ticket consent while exact existing receipt replay stays allowed',async()=>{
        const user=await account(admin,{oldTermsOnly:true}),m=cpu(user,await owner()),id=randomUUID();
        const args=[id,user,'online_ranked_match',m.id,'synthetic_signed_fixture',unique('SYNTHETIC_TERMS_'),HASH,null];
        const record=c=>scalar(c,'select public.record_verified_rewarded_ad($1,$2,$3,$4,$5,$6,$7,$8) as result',args);
        await assert.rejects(record(a),{code:'42501',message:'CURRENT_TICKET_TERMS_REQUIRED'});
        assert.equal(await scalar(a,'select count(*)::integer as result from public.verified_rewarded_ad_grants where grant_id=$1',[id]),0);
        await admin.query("insert into public.account_terms_consents(user_id,version) values($1,'2026-10-07.1')",[user]);
        assert.equal((await record(a)).duplicate,false);
        await admin.query("delete from public.account_terms_consents where user_id=$1 and version='2026-10-07.1'",[user]);
        assert.equal((await record(b)).duplicate,true);
        await admin.query("insert into public.account_terms_consents(user_id,version) values($1,'2026-10-07.1')",[user]);
        const next=await member(a,user,'plus_monthly',true);await snapshot(a,next);
        await admin.query("delete from public.account_terms_consents where user_id=$1 and version='2026-10-07.1'",[user]);
        assert.equal((await record(a)).duplicate,true); // A receipt read never requests an ad for a now-paid account.
    });
    await check('one verified ad pays exactly one match and never spends a ticket; duplicate void restores reusable credit',async()=>{
        const user=await exhausted(),epoch=await owner(),m=cpu(user,epoch),e=await grant(a,user,m);await consent(a,m,user,'verified_ad',e.id);
        await contended(admin,a,b,c=>admit(c,m),c=>admit(c,m));assert.equal((await wallet(a,user)).ranked_tickets,2);
        assert.equal(await scalar(a,'select consumed_by as result from public.verified_rewarded_ad_grants where grant_id=$1',[e.id]),m.id);
        await contended(admin,a,b,c=>voided(c,m),c=>voided(c,m));
        const n=cpu(user,epoch);assert.equal(await scalar(a,'select public.get_shared_match_ad_choice($1,$2) as result',[user,n.id]),e.id);
        await consent(a,n,user,'verified_ad',e.id);await admit(a,n);await finish(a,n);
        assert.equal(await scalar(a,'select consumed_by as result from public.verified_rewarded_ad_grants where grant_id=$1',[e.id]),n.id);
        const last=cpu(user,epoch);await assert.rejects(consent(a,last,user,'verified_ad',e.id),{code:'42501'});
    });
    await check('late verified completion after a pre-admission cancellation preserves earned credit for a new match',async()=>{
        const user=await exhausted(),epoch=await owner(),m=cpu(user,epoch);
        await voided(a,m); // Tombstone exists; no allocation or debit ever existed.
        const e=await grant(a,user,m),n=cpu(user,epoch);
        assert.equal(await scalar(a,'select public.get_shared_match_ad_choice($1,$2) as result',[user,n.id]),e.id);
        await consent(a,n,user,'verified_ad',e.id);assert.equal((await admit(a,n)).state,'active');
        assert.equal((await wallet(a,user)).ranked_tickets,2);await finish(a,n);
    });
    await check('Crown-purpose grants cannot authorize a match or be consumed by match RPCs',async()=>{
        const user=await exhausted(),m=cpu(user,await owner()),e=await grant(a,user,m,'crown_first_attempt','rank:rook');
        await assert.rejects(consent(a,m,user,'verified_ad',e.id),{code:'42501'});
        assert.equal(await scalar(a,'select consumed_by as result from public.verified_rewarded_ad_grants where grant_id=$1',[e.id]),null);
    });
    for(const plan of ['standard_monthly','plus_monthly'])await check(`${plan} canonical live entitlement is unlimited and ad-free with zero asset spend`,async()=>{
        const user=await exhausted(),memb=await member(a,user,plan,true);const paid=await snapshot(a,memb);await paidPeriod(a,memb,paid.event);
        const ent=await scalar(a,'select public.get_shared_match_entitlement($1) as result',[user]);assert.equal(ent.unlimitedOnlineRanked,true);assert.equal(ent.noAds,true);
        const epoch=await owner();for(let i=0;i<5;i++){const m=cpu(user,epoch);assert.equal((await admit(a,m)).state,'active');await finish(a,m);}
        assert.equal((await wallet(a,user)).ranked_tickets,2);
        assert.equal(await scalar(a,"select count(*)::integer as result from public.shared_match_allocations where user_id=$1 and source<>'subscription_unlimited'",[user]),0);
        await assert.rejects(grant(a,user,cpu(user,epoch)),{code:'42501'});
    });
    await check('test-mode, expired, off-price, canceled and refund-blocked memberships do not confer new paid access',async()=>{
        for(const kind of ['test','expired','offprice','canceled','refund']){
            if(kind==='test')await admin.query('delete from public.stripe_billing_mode_pin'); // disposable synthetic mode pin only
            const user=await exhausted(),memb=await member(a,user,'plus_monthly',kind!=='test');const paid=await snapshot(a,memb);await paidPeriod(a,memb,paid.event);
            if(kind==='expired')await admin.query("update public.stripe_memberships set period_end=clock_timestamp()-interval '1 second' where user_id=$1",[user]);
            if(kind==='offprice')await admin.query("update public.stripe_memberships set current_price_id='price_OFFPRICE' where user_id=$1",[user]);
            if(kind==='canceled')await admin.query("update public.stripe_memberships set status='canceled' where user_id=$1",[user]);
            if(kind==='refund')await admin.query('update public.stripe_memberships set refund_blocked_until=period_end where user_id=$1',[user]);
            const ent=await scalar(a,'select public.get_shared_match_entitlement($1) as result',[user]);assert.equal(ent.unlimitedOnlineRanked,false);assert.equal(ent.noAds,false);
            assert.equal((await admit(a,cpu(user,await owner()))).state,'choice_required');
        }
    });
    await check('legacy 2.99 remains ticket-based and refunds retain the original subscription expiry',async()=>{
        const user=await account(admin,{quota:3}),checkout=unique('cs_live_LEGACY'),subscription=unique('sub_LEGACY');
        await a.query("select public.register_stripe_live_checkout_intent($1,$2,$3,clock_timestamp()+interval '1 hour')",[user,checkout,LEGACY_PRICE]);
        const token=(await scalar(a,'select public.acquire_stripe_reconciliation($1,true) as result',[subscription])).token;
        const legacy={user,checkout,subscription,token,price:LEGACY_PRICE,live:true,end:new Date(Date.now()+86400000).toISOString()};
        await snapshot(a,legacy);
        await admin.query('update public.ticket_wallets set member_ranked_tickets=1,member_ticket_subscription_id=$2 where user_id=$1',[user,subscription]);
        const entitlement=await scalar(a,'select public.get_shared_match_entitlement($1) as result',[user]);
        assert.deepEqual(entitlement,{plan:'legacy299',unlimitedOnlineRanked:false,noAds:false,periodEnd:null});
        const m=cpu(user,await owner());assert.equal((await admit(a,m)).state,'choice_required');await consent(a,m,user);await admit(a,m);await voided(a,m);
        const refund=(await a.query('select pool,subscription_id,expires_at from public.ranked_ticket_refunds where source_match_id=$1',[m.id])).rows[0];
        assert.equal(refund.pool,'paid');assert.equal(refund.subscription_id,subscription);assert.equal(refund.expires_at.toISOString(),legacy.end);
        await admin.query("update public.stripe_memberships set status='canceled' where user_id=$1",[user]);
        const n=cpu(user,m.owner);await consent(a,n,user);assert.equal((await admit(a,n)).reason,'INSUFFICIENT_FUNDS');
    });
    await check('random completion and void contend to exactly one terminal result; settled random cannot be refunded later',async()=>{
        const user=await exhausted(),other=await exhausted(),epoch=await owner(),m=pvp(user,other,epoch);await consent(a,m,user);await consent(a,m,other);await admit(a,m);
        const r=await contended(admin,a,b,c=>finish(c,m),c=>voided(c,m));assert.equal(r[0].state,'settled');assert.equal(r[1].state,'settled');
        await admin.query("update public.ranked_server_leases set expires_at=clock_timestamp()-interval '1 second' where owner_id=$1",[epoch]);
        await a.query('select public.recover_expired_ranked_admissions()');assert.equal(await used(a,user),1);
        assert.equal(await scalar(a,'select count(*)::integer as result from public.ranked_ticket_refunds where source_match_id=$1',[m.id]),0);
    });
    await check('owner recovery refunds an unfinished shared match and cannot revive its UUID',async()=>{
        const user=await exhausted(),epoch=await owner(),m=cpu(user,epoch);await consent(a,m,user);await admit(a,m);
        await admin.query("update public.ranked_server_leases set expires_at=clock_timestamp()-interval '1 second' where owner_id=$1",[epoch]);
        await Promise.all([a.query('select public.recover_expired_ranked_admissions()'),b.query('select public.recover_expired_ranked_admissions()')]);
        assert.equal((await admit(a,m)).state,'voided');assert.equal(await used(a,user),0);
    });
    await check('restrictions, terms and deletion checks reject before any accounting',async()=>{
        for(const kind of ['restriction','terms','deletion']){
            const user=await account(admin),m=cpu(user,await owner());
            if(kind==='restriction')await admin.query("insert into public.account_restrictions(user_id,blocked) values($1,true)",[user]);
            if(kind==='terms')await admin.query('delete from public.account_terms_consents where user_id=$1',[user]);
            if(kind==='deletion')await admin.query("insert into public.account_deletion_jobs(ticket_hash,user_id,phase) values('cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',$1,'pending')",[user]);
            await assert.rejects(admit(a,m),{code:'42501'});assert.equal(await used(a,user),0);
        }
    });
    await check('metadata domains, integer overflow and unexpected consent account fail without admission',async()=>{
        const user=await account(admin),m=cpu(user,await owner());
        for(const bad of [{...m,host:'GUEST-bad'},{...m,cpu:'ai:bad'},{...m,tokens:{Intruder:randomUUID()}}])await assert.rejects(admit(a,bad),{code:'22023'});
        await assert.rejects(a.query('select public.admit_shared_match($1,$2,$3,2147483648::integer,$4,$5)',[m.id,m.host,m.joiner,m.owner,'ranked']),{code:'22003'});
        for(const isolation of ['read uncommitted','repeatable read','serializable']){
            await a.query(`begin isolation level ${isolation}`);
            try { await assert.rejects(admit(a,m),{code:'40001'}); }
            finally { await a.query('rollback'); }
        }
        assert.equal(await used(a,user),0);
    });
    await check('account erasure retains only provider replay fence and cannot recreate an earned credit',async()=>{
        const user=await exhausted(),m=cpu(user,await owner()),e=await grant(a,user,m);await admin.query('delete from public.profiles where id=$1',[user]);
        assert.equal(await scalar(a,'select user_id as result from public.verified_rewarded_ad_grants where grant_id=$1',[e.id]),null);
        await assert.rejects(e.issue(a),{code:'42501'});
        const other=await account(admin),args=[...e.args];args[1]=other;
        await assert.rejects(scalar(a,'select public.record_verified_rewarded_ad($1,$2,$3,$4,$5,$6,$7,$8) as result',args),{code:'23505'});
    });
    await check('anonymous/authenticated roles cannot issue grants, consent, entitlement, start or finish; RLS denies rows',async()=>{
        const user=await account(admin),m=cpu(user,await owner());
        for(const role of ['anon','authenticated']){
            const c=await open(role);
            await assert.rejects(admit(c,m),{code:'42501'});await assert.rejects(consent(c,m,user),{code:'42501'});
            await assert.rejects(grant(c,user,m),{code:'42501'});
            await assert.rejects(c.query('select public.get_shared_match_entitlement($1)',[user]),{code:'42501'});
            for(const table of ['verified_rewarded_ad_grants','shared_match_consents','shared_match_allocations'])await assert.rejects(c.query(`select * from public.${table}`),{code:'42501'});
        }
        assert.equal(await scalar(admin,"select count(*)::integer as result from pg_proc where pronamespace='public'::regnamespace and (proname like '%shared_match%' or proname='record_verified_rewarded_ad') and prosecdef"),0);
        for(const table of ['verified_rewarded_ad_grants','shared_match_consents','shared_match_allocations'])assert.equal(await scalar(admin,'select relrowsecurity as result from pg_class where oid=$1::regclass',[`public.${table}`]),true);
    });
    const sourceSha256={};for(const name of baselineEvidence.pending)sourceSha256[name]=createHash('sha256').update(await readFile(new URL(`../../supabase/migrations/${name}`,import.meta.url))).digest('hex');
    const report={complete:failures===0&&results.length===27,passed:results.length,failed:failures,nativePostgreSQL:true,independentBackends:true,syntheticProviderEvidence:true,providerVerified:false,publicActivation:false,baseline:baselineEvidence,sourceSha256,tests:results};
    await writeFile(join(tmpdir(),'shared-match-admission-postgres-results.json'),JSON.stringify(report,null,2)+'\n');
    assert.equal(failures,0);assert.equal(results.length,27);console.log(JSON.stringify(report));
});
