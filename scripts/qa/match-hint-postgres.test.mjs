import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { connect, scalar, wallet, account, contended, MAX, HASH, LEGACY_PRICE,
    bind, register, purchase, member, snapshot, paidPeriod, unique } from './commerce-postgres-support.mjs';
import { setupBaseline, baselineEvidence, historical } from './fixtures/commerce-postgres-baseline.mjs';
import { combinedPendingMigrations } from './fixtures/session-postgres-baseline.mjs';

// Real PostgreSQL, public repository SQL and synthetic accounts only. This suite
// deliberately keeps the already-released migration inventories untouched.
const MIGRATION = '20261008054904_match_hint_tickets_and_free_practice.sql';
const state = { sideToMove: 'white', ply: 0, winner: null, pieces: Array.from({ length: 32 }, () => ({})) };
const hint = { fromRow: 6, fromCol: 0, toRow: 5, toCol: 0 };
const move = { pieceId: 'w_1', target: { row: 5, col: 0 } };
const context = (userId, changes = {}) => ({ requestId: randomUUID(), userId, contextId: randomUUID(), kind: 'match',
    mode: 'ranked', side: 'white', revision: 0, stateHash: HASH, rulesVersion: 'quantum-match-v1',
    validUntil: new Date(Date.now() + 3600_000).toISOString(), move, hint, ...changes });
const buy = (c, p) => scalar(c, 'select public.buy_match_hint($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) as result',
    [p.requestId,p.userId,p.contextId,p.kind,p.mode,p.side,p.revision,p.stateHash,p.rulesVersion,p.validUntil,
        JSON.stringify(p.move),JSON.stringify(p.hint)]);
const read = (c,p) => scalar(c,'select public.read_match_hint_receipt($1,$2,$3,$4) as result',
    [p.requestId,p.userId,p.contextId,p.revision]);
const recoverAfter = (c,p,notBefore) => scalar(c,'select public.read_match_hint_receipt($1,$2,$3,$4,$5) as result',
    [p.requestId,p.userId,p.contextId,p.revision,notBefore]);
const existing = (c,p) => scalar(c,'select public.read_existing_match_hint($1,$2,$3) as result',[p.userId,p.contextId,p.revision]);
const restore = (c,receipt,user,reason='unrecoverable_delivery') => scalar(c,'select public.restore_match_hint_credit($1,$2,$3) as result',
    [receipt.receiptId,user,reason]);
const receipt = (c,id) => scalar(c,'select to_jsonb(r) as result from public.match_hint_receipts r where request_id=$1',[id]);
const receiptCount = (c,user) => scalar(c,'select count(*)::integer as result from public.match_hint_receipts where user_id=$1',[user]);
const restorationCount = (c,id) => scalar(c,'select count(*)::integer as result from public.match_hint_restorations where receipt_id=$1',[id]);
const source = (c,intent) => scalar(c,'select to_jsonb(s) as result from public.stripe_commerce_sources s where checkout_id=$1',[intent.checkout]);
const quantities = row => Object.fromEntries(['quantity','available','held','consumed','revoked'].map(key=>[key,Number(row[key])]));
const expected = (quantity,available,held,consumed,revoked) => ({quantity,available,held,consumed,revoked});
const assertSource = async(c,intent,amount,stateValue) => {
    const row=await source(c,intent); assert.deepEqual(quantities(row),amount);
    assert.equal(row.state,stateValue);assert.equal(amount.quantity,amount.available+amount.held+amount.consumed+amount.revoked);return row;
};
const balances = async(c,user) => {const w=await wallet(c,user);return Object.fromEntries(['hint_tickets','member_hint_tickets',
    'subscription_hint_tickets','purchased_hint_tickets','test_subscription_hint_tickets','test_purchased_hint_tickets'].map(k=>[k,Number(w[k])]));};
const openPractice = (c,user) => scalar(c,"select public.cpu_practice_open($1,$2,'white',1,600,'quantum-practice-v1',$3,$4) as result",
    [randomUUID(),user,JSON.stringify(state),HASH]);
const oldBuy = (c,s,id=randomUUID(),name='buy_cpu_hint_v2') => {
    assert.ok(['buy_cpu_hint','buy_cpu_hint_v2'].includes(name));
    return scalar(c,`select public.${name}($1,$2,$3,$4,$5,$6,$7) as result`,[id,s.userId,s.sessionId,s.revision,s.stateHash,JSON.stringify(move),JSON.stringify(hint)]);
};
const fundFree = async(admin,count=1) => {const user=await account(admin);await admin.query('update public.ticket_wallets set hint_tickets=$2 where user_id=$1',[user,count]);return user;};
const purchased = async(admin,c,sku='hints_13',live=true,user=null) => {
    user??=await account(admin);const intent=await register(c,user,sku,live);
    intent.token=(await scalar(c,'select public.acquire_stripe_commerce_reconciliation($1,$2) as result',[intent.checkout,live])).token;
    assert.ok(intent.token);await purchase(c,intent);return intent;
};
const riskEvidence = (intent,riskState='refunded') => {
    const key=intent.checkout.replaceAll('_','');
    return {eventId:unique('evt_MATCHHINTRISK'),payloadHash:HASH,observedAt:new Date().toISOString(),checkoutId:intent.checkout,
        userId:intent.user,sku:intent.sku,priceId:intent.price,amountTotal:intent.amount,currency:'usd',livemode:intent.live,
        subscriptionId:null,invoiceId:null,periodStart:null,periodEnd:null,token:intent.token,
        paymentSource:{paymentIntentId:`pi_${key}`,chargeId:`ch_${key}`,customerId:null,
            amountRefunded:riskState==='refunded'?intent.amount:0,riskState,
            disputeId:['disputed','dispute_lost'].includes(riskState)?`du_${key}`:null,
            disputeStatus:riskState==='disputed'?'needs_response':riskState==='dispute_lost'?'lost':null}};
};
const risk = (c,evidence) => scalar(c,'select public.apply_stripe_commerce_source_risk($1::jsonb) as result',[JSON.stringify(evidence)]);
async function legacy(admin,user,status='active') {
    const subscription=`sub_MATCHHINT${user}`,checkout=`cs_live_MATCHHINT${user}`,customer=`cus_MATCHHINT${user}`;
    await admin.query("insert into public.stripe_checkout_intents(checkout_id,user_id,price_id,livemode,expires_at) values($1,$2,$3,true,clock_timestamp()+interval '1 hour')",[checkout,user,LEGACY_PRICE]);
    await admin.query('insert into public.stripe_customer_links(customer_id,user_id) values($1,$2)',[customer,user]);
    await admin.query(`insert into public.stripe_memberships(subscription_id,checkout_id,customer_id,user_id,current_price_id,status,period_end,event_created,observed_at)
        values($1,$2,$3,$4,$5,$6,clock_timestamp()+interval '1 day',1,clock_timestamp())`,[subscription,checkout,customer,user,LEGACY_PRICE,status]);
    await admin.query('update public.ticket_wallets set member_ticket_subscription_id=$2,member_hint_tickets=1 where user_id=$1',[user,subscription]);
    return subscription;
}
const beginDeletion = (c,user) => scalar(c,'select public.begin_account_deletion($1,$2,null) as result',[user,randomUUID().replaceAll('-','').repeat(2)]);

test('native PostgreSQL match hints and free-practice forward upgrade',{timeout:180_000},async t=>{
    const clients=[],results=[];let failures=0,a,b,oldUser,oldSession,oldReceipt,oldRequest;
    const connectAs=async role=>{const c=await connect(role);clients.push(c);return c;};
    const admin=await connectAs();t.after(async()=>{await Promise.allSettled(clients.map(c=>c.end()));});
    const check=(name,run)=>t.test(name,{timeout:20_000},async()=>{try{await run();results.push(name);}catch(e){failures++;throw e;}});
    await check('raw released baseline then one forward migration preserves an actually charged practice receipt',async()=>{
        await setupBaseline(admin);
        const discovered=(await readdir(new URL('../../supabase/migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')&&n>=combinedPendingMigrations[0]).sort();
        // This historical PR20 proof applies only its own forward file. PR21's
        // explicitly reviewed email migration is applied by its dedicated suite.
        assert.deepEqual(discovered,[...combinedPendingMigrations,MIGRATION,
            '20261008093454_email_account_registration.sql']);
        for(const name of combinedPendingMigrations)await admin.query(await readFile(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8'));
        a=await connectAs('service_role');b=await connectAs('service_role');await bind(admin);
        oldUser=await fundFree(admin,2);oldSession=await openPractice(a,oldUser);oldRequest=randomUUID();oldReceipt=await oldBuy(a,oldSession,oldRequest);
        assert.ok(oldReceipt.receiptId);const before=await wallet(a,oldUser);
        await admin.query(await readFile(new URL(`../../supabase/migrations/${MIGRATION}`,import.meta.url),'utf8'));
        assert.deepEqual(await wallet(a,oldUser),before);
        assert.equal(await scalar(a,"select version as result from public.current_terms_policy where singleton"),'2026-10-08.1');
        assert.equal(await scalar(a,'select count(*)::integer as result from public.match_hint_receipts'),0);
    });
    assert.ok(a&&b,'Baseline must be installed before scenarios');
    await check('old terms permit old receipt replay and aliases while every fresh practice debit is refused',async()=>{
        for(const name of ['buy_cpu_hint','buy_cpu_hint_v2']) {
            assert.deepEqual(await oldBuy(a,oldSession,oldRequest,name),oldReceipt);
            assert.deepEqual(await oldBuy(a,oldSession,randomUUID(),name),oldReceipt);
        }
        assert.deepEqual(await scalar(a,'select public.read_cpu_hint_receipt($1,$2,$3,$4) as result',[oldRequest,oldUser,oldSession.sessionId,oldSession.revision]),oldReceipt);
        await a.query("select public.accept_current_account_terms($1,'2026-10-08.1')",[oldUser]);
        const fresh=await openPractice(a,oldUser),before=await wallet(a,oldUser);
        for(const name of ['buy_cpu_hint','buy_cpu_hint_v2'])await assert.rejects(oldBuy(a,fresh,randomUUID(),name),/PRACTICE_HINTS_FREE/);
        assert.deepEqual(await wallet(a,oldUser),before);
        assert.equal(await scalar(a,"select public.restore_cpu_hint_credit($1,$2,'unrecoverable_delivery') as result",[oldReceipt.receiptId,oldUser]),1);
    });
    await check('sandbox sources are invisible to match hints',async()=>{
        const intent=await purchased(admin,a,'hints_13',false),before=await wallet(a,intent.user),sourceBefore=await source(a,intent);
        assert.deepEqual(await buy(a,context(intent.user)),{error:'INSUFFICIENT_FUNDS'});
        assert.deepEqual(await wallet(a,intent.user),before);assert.deepEqual(await source(a,intent),sourceBefore);
    });
    await check('the lower-level historical CPU event cannot charge a new practice hint',async()=>{
        const user=await fundFree(admin,2),before=await wallet(a,user),id=randomUUID();
        await assert.rejects(scalar(a,"select public.spend_game_tickets('cpu_hint_delivered',$1,$2) as result",[id,[user]]),/PRACTICE_HINTS_FREE/);
        assert.deepEqual(await wallet(a,user),before);
        assert.equal(await scalar(a,'select count(*)::integer as result from public.ticket_spend_receipts where event_id=$1',[id]),0);
    });
    await check('the old historical CPU debit event still replays its immutable receipt',async()=>{
        const before=await wallet(a,oldUser);
        const result=await scalar(a,"select public.spend_game_tickets('cpu_hint_delivered',$1,$2) as result",[oldRequest,[oldUser]]);
        assert.equal(result.duplicate,true);assert.equal(result.applied,false);assert.equal(result.insufficient,false);
        assert.deepEqual(result.entries,[{userId:oldUser,pool:'free'}]);assert.deepEqual(await wallet(a,oldUser),before);
    });
    await check('the established ranked ticket debit still consumes once and replays normally',async()=>{
        const user=await account(admin,{quota:20,ranked:1}),id=randomUUID();
        const run=()=>scalar(a,"select public.spend_game_tickets('ranked_match_start',$1,$2) as result",[id,[user]]);
        const result=await run();assert.equal(result.applied,true);assert.equal(result.insufficient,false);
        assert.equal((await wallet(a,user)).ranked_tickets,0);assert.equal((await run()).duplicate,true);
        assert.equal((await wallet(a,user)).ranked_tickets,0);
    });
    await check('ranked, random, private and Crown each debit one free ticket without a CPU session',async()=>{
        for(const mode of ['ranked','random','private','crown']){
            const user=await fundFree(admin),p=context(user,{mode,kind:mode==='crown'?'crown':'match'}),r=await buy(a,p);
            assert.ok(r.receiptId);assert.equal(r.contextId,p.contextId);assert.equal(r.mode,mode);assert.equal(r.kind,p.kind);
            assert.equal(r.deliveryState,'paid_retrievable');assert.deepEqual(r.move,move);assert.deepEqual(r.hint,hint);
            assert.equal((await wallet(a,user)).hint_tickets,0);assert.equal((await receipt(a,r.receiptId)).origin,'free');
            assert.equal(await scalar(a,'select count(*)::integer as result from public.cpu_practice_sessions where user_id=$1',[user]),0);
        }
    });
    await check('immutable aliases, same revision and discarded response replay never debit twice',async()=>{
        const user=await fundFree(admin,3),p=context(user),r=await buy(a,p),before=await wallet(a,user);
        assert.deepEqual(await buy(a,p),r);const alias={...p,requestId:randomUUID()};assert.deepEqual(await buy(a,alias),r);
        assert.deepEqual(await read(a,alias),r);assert.deepEqual(await existing(a,p),r);assert.deepEqual(await wallet(a,user),before);
        assert.equal(await receiptCount(a,user),1);
        assert.deepEqual(await buy(a,{...p,validUntil:new Date(0).toISOString()}),r,'Committed response is recoverable after expiry');
    });
    await check('request ID and same-revision bindings reject cross-user, context, revision and board metadata reuse',async()=>{
        const user=await fundFree(admin,4),other=await fundFree(admin),p=context(user),r=await buy(a,p),before=await wallet(a,user);
        const changes=[{userId:other},{contextId:randomUUID()},{revision:1},{stateHash:'b'.repeat(64)},{kind:'crown',mode:'crown'},
            {mode:'private'},{side:'black'},{rulesVersion:'quantum-match-v2'}];
        for(const change of changes)await assert.rejects(buy(a,{...p,...change}),/MISMATCH|CONFLICT/);
        for(const change of changes.slice(3))await assert.rejects(buy(a,{...p,requestId:randomUUID(),...change}),/MISMATCH|CONFLICT/);
        for(const change of changes.slice(0,3))await assert.rejects(read(a,{...p,...change}),/MISMATCH|CONFLICT/);
        assert.deepEqual(await existing(a,{...p,userId:other}),null);assert.deepEqual(await wallet(a,user),before);assert.deepEqual(await read(a,p),r);
    });
    await check('invalid contexts and invalid hint coordinates cannot spend a credit',async()=>{
        const user=await fundFree(admin,20),p=context(user),before=await wallet(a,user);
        for(const changes of [{kind:'practice'},{kind:'crown',mode:'ranked'},{mode:'practice'},{side:'spectator'},{revision:-1},
            {stateHash:'A'.repeat(64)},{rulesVersion:''},{hint:{}},{hint:{...hint,toRow:8}},{hint:{...hint,toRow:hint.fromRow,toCol:hint.fromCol}},
            {validUntil:new Date(Date.now()-10_000).toISOString()}])await assert.rejects(buy(a,{...p,requestId:randomUUID(),...changes}));
        assert.deepEqual(await wallet(a,user),before);assert.equal(await receiptCount(a,user),0);
    });
    await check('old consent blocks a new charge but cannot hide an already-paid match receipt',async()=>{
        const user=await fundFree(admin,2),p=context(user),r=await buy(a,p);
        await admin.query("delete from public.account_terms_consents where user_id=$1 and version='2026-10-08.1'",[user]);
        assert.deepEqual(await read(a,p),r);assert.deepEqual(await existing(a,p),r);assert.deepEqual(await buy(a,p),r);
        const before=await wallet(a,user);await assert.rejects(buy(a,context(user)),/TERMS/);assert.deepEqual(await wallet(a,user),before);
    });
    await check('insufficient funds leaves no receipt and no alias to obstruct a later funded retry',async()=>{
        const user=await account(admin),p=context(user);assert.deepEqual(await buy(a,p),{error:'INSUFFICIENT_FUNDS'});
        assert.equal(await read(a,p),null);assert.equal(await receiptCount(a,user),0);
        await admin.query('update public.ticket_wallets set hint_tickets=1 where user_id=$1',[user]);assert.ok((await buy(a,p)).receiptId);
    });
    await check('priority is free then eligible legacy member then earned Plus then purchased sources',async()=>{
        const user=await fundFree(admin),m=await member(a,user,'plus_monthly',true),paid=await snapshot(a,m);
        await paidPeriod(a,m,paid.event);await purchased(admin,a,'hints_1',true,user);const legacySubscription=await legacy(admin,user);
        for(const origin of ['free','member',...Array(10).fill('subscription'),'purchased']){
            const r=await buy(a,context(user)),row=await receipt(a,r.receiptId);assert.equal(row.origin,origin);
            if(origin==='member')assert.equal(row.subscription_id,legacySubscription);
            if(['subscription','purchased'].includes(origin))assert.ok(row.source_id);
        }
        const w=await balances(a,user);assert.deepEqual([w.hint_tickets,w.member_hint_tickets,w.subscription_hint_tickets,w.purchased_hint_tickets],[0,0,0,0]);
        assert.deepEqual(await buy(a,context(user)),{error:'INSUFFICIENT_FUNDS'});
    });
    await check('paused and canceled legacy membership cannot spend its old pool',async()=>{
        for(const status of ['paused','canceled']){
            const user=await account(admin);await legacy(admin,user,status);await purchased(admin,a,'hints_1',true,user);
            const r=await buy(a,context(user));assert.equal((await receipt(a,r.receiptId)).origin,'purchased');
        }
    });
    await check('aggregate balances without purchase provenance never fabricate sources or receipts',async()=>{
        const user=await account(admin);await admin.query('update public.ticket_wallets set subscription_hint_tickets=13,purchased_hint_tickets=13 where user_id=$1',[user]);
        const before=await wallet(a,user);assert.deepEqual(await buy(a,context(user)),{error:'INSUFFICIENT_FUNDS'});assert.deepEqual(await wallet(a,user),before);
    });
    await check('active-source restore returns to its original source exactly once',async()=>{
        const intent=await purchased(admin,a,'hints_1'),p=context(intent.user),r=await buy(a,p);
        assert.equal((await receipt(a,r.receiptId)).source_id,(await source(a,intent)).id);
        await assertSource(a,intent,expected(1,0,0,1,0),'active');assert.equal(await restore(a,r,intent.user),1);
        assert.equal(await restore(a,r,intent.user),0);await assertSource(a,intent,expected(1,1,0,0,0),'active');assert.deepEqual(await read(a,p),r);
    });
    await check('full refund revokes unused stock and failed delivery restoration cannot resurrect it',async()=>{
        const intent=await purchased(admin,a),r=await buy(a,context(intent.user));await risk(a,riskEvidence(intent));
        await assertSource(a,intent,expected(13,0,0,1,12),'revoked');assert.equal(await restore(a,r,intent.user),0);
        await assertSource(a,intent,expected(13,0,0,0,13),'revoked');assert.equal((await balances(a,intent.user)).purchased_hint_tickets,0);
    });
    await check('dispute-held restore stays held until won and never creates usable credit early',async()=>{
        const intent=await purchased(admin,a),r=await buy(a,context(intent.user));await risk(a,riskEvidence(intent,'disputed'));
        assert.equal(await restore(a,r,intent.user),0);await assertSource(a,intent,expected(13,0,13,0,0),'held');
        assert.deepEqual(await buy(a,context(intent.user)),{error:'INSUFFICIENT_FUNDS'});
        const won=riskEvidence(intent,'clear');won.paymentSource.disputeId='du_'+intent.checkout.replaceAll('_','');won.paymentSource.disputeStatus='won';
        await risk(a,won);await assertSource(a,intent,expected(13,13,0,0,0),'active');assert.equal(await restore(a,r,intent.user),0);
    });
    await check('lost dispute restoration remains revoked despite delayed clear evidence',async()=>{
        const intent=await purchased(admin,a),r=await buy(a,context(intent.user));await risk(a,riskEvidence(intent,'disputed'));await risk(a,riskEvidence(intent,'dispute_lost'));
        assert.equal(await restore(a,r,intent.user),0);await risk(a,riskEvidence(intent,'clear'));
        await assertSource(a,intent,expected(13,0,0,0,13),'revoked');
    });
    await check('numeric overflow leaves no restoration marker or source mutation and retry succeeds',async()=>{
        const intent=await purchased(admin,a,'hints_1'),r=await buy(a,context(intent.user));
        await admin.query('update public.ticket_wallets set purchased_hint_tickets=$2 where user_id=$1',[intent.user,MAX]);
        await assert.rejects(restore(a,r,intent.user),{code:'22003'});assert.equal(await restorationCount(a,r.receiptId),0);
        await assertSource(a,intent,expected(1,0,0,1,0),'active');
        await admin.query('update public.ticket_wallets set purchased_hint_tickets=0 where user_id=$1',[intent.user]);
        assert.equal(await restore(a,r,intent.user),1);assert.equal(await restorationCount(a,r.receiptId),1);
    });
    await check('free and legacy restoration respect caps and preserve distinct origins',async()=>{
        for(const origin of ['free','member']){
            const user=await account(admin);if(origin==='free')await admin.query('update public.ticket_wallets set hint_tickets=1 where user_id=$1',[user]);else await legacy(admin,user);
            const r=await buy(a,context(user)),column=origin==='free'?'hint_tickets':'member_hint_tickets';
            await admin.query(`update public.ticket_wallets set ${column}=$2 where user_id=$1`,[user,MAX]);
            await assert.rejects(restore(a,r,user),{code:'22003'});assert.equal(Number((await wallet(a,user))[column]),MAX);
            assert.equal(await restorationCount(a,r.receiptId),0);
            await admin.query(`update public.ticket_wallets set ${column}=$2 where user_id=$1`,[user,MAX-1]);
            assert.equal(await restore(a,r,user),1);assert.equal(Number((await wallet(a,user))[column]),MAX);
            assert.equal(await restore(a,r,user),0);
        }
    });
    await check('two independent backends competing for the last ticket authorize exactly one hint',async()=>{
        const user=await fundFree(admin),p=context(user),q=context(user);
        const [left,right]=await contended(admin,a,b,c=>buy(c,p),c=>buy(c,q));assert.ok(left.receiptId);assert.deepEqual(right,{error:'INSUFFICIENT_FUNDS'});
        assert.equal((await wallet(a,user)).hint_tickets,0);assert.equal(await receiptCount(a,user),1);
    });
    await check('different concurrent request aliases for one position converge on one immutable receipt',async()=>{
        const user=await fundFree(admin,2),p=context(user),q={...p,requestId:randomUUID()};
        const [left,right]=await contended(admin,a,b,c=>buy(c,p),c=>buy(c,q));assert.deepEqual(right,left);
        assert.equal((await wallet(a,user)).hint_tickets,1);assert.equal(await receiptCount(a,user),1);assert.deepEqual(await read(a,q),left);
    });
    for(const [name,recover] of [['readReceipt',read],['readExisting',existing]])for(const rollback of [false,true]){
        await check(`${name} waits for the buying backend and observes ${rollback?'rollback with no receipt':'the committed immutable receipt'}`,async()=>{
            const user=await fundFree(admin),p=context(user);
            const [left,right]=await contended(admin,a,b,c=>buy(c,p),c=>recover(c,p),{rollback});
            assert.deepEqual(right,rollback?null:left);
            assert.equal((await wallet(a,user)).hint_tickets,rollback?1:0);
            assert.equal(await receiptCount(a,user),rollback?0:1);
        });
    }
    await check('rollback releases the last ticket without a ghost receipt or alias',async()=>{
        const user=await fundFree(admin),p=context(user),q=context(user);
        const [,right]=await contended(admin,a,b,c=>buy(c,p),c=>buy(c,q),{rollback:true});assert.ok(right.receiptId);
        assert.equal(await read(a,p),null);assert.equal(await receiptCount(a,user),1);
    });
    await check('concurrent refund commits before a waiting hint can consume the revoked source',async()=>{
        const intent=await purchased(admin,a,'hints_1'),p=context(intent.user);
        const [,right]=await contended(admin,a,b,c=>risk(c,riskEvidence(intent)),c=>buy(c,p));assert.deepEqual(right,{error:'INSUFFICIENT_FUNDS'});
        await assertSource(a,intent,expected(1,0,0,0,1),'revoked');
    });
    await check('concurrent hint commits before refund so consumed stock never turns into account debt',async()=>{
        const intent=await purchased(admin,a,'hints_1');await contended(admin,a,b,c=>buy(c,context(intent.user)),c=>risk(c,riskEvidence(intent)));
        await assertSource(a,intent,expected(1,0,0,1,0),'revoked');assert.equal((await balances(a,intent.user)).purchased_hint_tickets,0);
    });
    await check('two concurrent restorations credit only once',async()=>{
        const intent=await purchased(admin,a,'hints_1'),r=await buy(a,context(intent.user));
        assert.deepEqual(await contended(admin,a,b,c=>restore(c,r,intent.user),c=>restore(c,r,intent.user)),[1,0]);
        await assertSource(a,intent,expected(1,1,0,0,0),'active');
    });
    await check('deletion admission wins its profile lock and a waiting charge fails closed',async()=>{
        const user=await fundFree(admin),p=context(user);
        const [,right]=await contended(admin,a,b,c=>beginDeletion(c,user),c=>buy(c,p).catch(error=>({error: error.message,code:error.code})));
        assert.equal(right.code,'42501');assert.match(right.error,/DELET|unavailable|blocked/i);assert.equal(await receiptCount(admin,user),0);
    });
    await check('account erasure removes private hints and aliases while same-name new UID has no access',async()=>{
        const user=await fundFree(admin),p=context(user),r=await buy(a,p);await restore(a,r,user);
        await admin.query('delete from public.profiles where id=$1',[user]);
        assert.equal(await receiptCount(admin,user),0);assert.equal(await scalar(admin,'select count(*)::integer as result from public.match_hint_request_aliases where request_id=$1',[p.requestId]),0);
        assert.equal(await restorationCount(admin,r.receiptId),0);const fresh=await fundFree(admin);
        assert.equal(await read(a,{...p,userId:fresh}),null);assert.equal((await wallet(a,fresh)).hint_tickets,1);
    });
    await check('non-read-committed snapshots are refused before debit or restore',async()=>{
        const user=await fundFree(admin,2),p=context(user),r=await buy(a,p);
        for(const isolation of ['read uncommitted','repeatable read','serializable']){
            await a.query(`begin isolation level ${isolation}`);try{await assert.rejects(buy(a,context(user)),/READ_COMMITTED_REQUIRED/);}finally{await a.query('rollback');}
            await a.query(`begin isolation level ${isolation}`);try{await assert.rejects(restore(a,r,user),/READ_COMMITTED_REQUIRED/);}finally{await a.query('rollback');}
        }
        assert.equal((await wallet(a,user)).hint_tickets,1);assert.equal(await restorationCount(a,r.receiptId),0);
    });
    await check('validUntil is checked after a real profile-lock wait, not only before it',async()=>{
        const user=await fundFree(admin),p=context(user,{validUntil:new Date(Date.now()+750).toISOString()});
        await a.query('begin');let pending;
        try{
            await a.query('select 1 from public.profiles where id=$1 for update',[user]);
            pending=buy(b,p).then(value=>({value}),error=>({error}));
            let blocked=false;
            for(let i=0;i<100;i++){
                const row=(await admin.query('select wait_event_type,pg_blocking_pids(pid) as blockers from pg_stat_activity where pid=$1',[b.fixturePid])).rows[0];
                if(row?.wait_event_type==='Lock'&&row.blockers.includes(a.fixturePid)){blocked=true;break;}
                await delay(10);
            }
            assert.ok(blocked,'Expiry proof requires a real profile-lock wait');
            await delay(Math.max(0,Date.parse(p.validUntil)-Date.now()+100));await a.query('commit');
            const right=await pending;assert.ok(right.error);assert.match(right.error.message,/EXPIRED|STALE/);
        }finally{await a.query('rollback');if(pending)await pending;}
        assert.equal((await wallet(a,user)).hint_tickets,1);assert.equal(await receiptCount(a,user),0);
    });
    await check('recovery cannot return a conclusive null before the database reaches the purchase deadline',async()=>{
        const user=await fundFree(admin),p=context(user);
        const future=(await scalar(admin,"select clock_timestamp()+interval '30 seconds' as result")).toISOString();
        // A host that believes the deadline has passed must still be denied.
        assert.equal(await read(a,p),null);
        await assert.rejects(recoverAfter(a,p,future),{message:'HINT_STORE_UNAVAILABLE',code:'55000'});
        assert.equal((await wallet(a,user)).hint_tickets,1);assert.equal(await receiptCount(a,user),0);
        const saved=await buy(a,p);
        assert.deepEqual(await recoverAfter(a,p,future),saved,'An existing receipt resolves before notBefore');
    });
    await check('service database clock reports canonical milliseconds within actual database observations',async()=>{
        const before=await scalar(admin,'select clock_timestamp() as result');
        const value=await scalar(a,'select public.match_hint_clock() as result');
        const after=await scalar(admin,'select clock_timestamp() as result');
        assert.match(value,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        assert.equal(new Date(value).toISOString(),value);
        assert.ok(Date.parse(value)>=before.getTime()-1&&Date.parse(value)<=after.getTime());
        const user=await fundFree(admin);
        const p=context(user,{validUntil:new Date(Date.parse(value)+5000).toISOString()});
        assert.ok((await buy(a,p)).receiptId);
        assert.equal((await wallet(a,user)).hint_tickets,0);
    });
    await check('recovery deadline rejects non-finite database timestamps',async()=>{
        const user=await fundFree(admin),p=context(user);
        for(const notBefore of ['infinity','-infinity'])await assert.rejects(recoverAfter(a,p,notBefore),{message:'INVALID_REQUEST',code:'22023'});
        assert.equal(await recoverAfter(a,p,null),null);
    });
    await check('a database-confirmed expired null prevents a delayed original buy from consuming',async()=>{
        const user=await fundFree(admin),p=context(user);
        p.validUntil=(await scalar(admin,"select clock_timestamp()-interval '1 second' as result")).toISOString();
        assert.equal(await recoverAfter(a,p,p.validUntil),null);
        await assert.rejects(buy(b,p),{message:'HINT_CONTEXT_EXPIRED',code:'22023'});
        assert.equal((await wallet(a,user)).hint_tickets,1);assert.equal(await receiptCount(a,user),0);
        const q=context(user);const saved=await buy(a,q);
        assert.deepEqual(await recoverAfter(a,q,p.validUntil),saved);
    });
    await check('recovery checks the database deadline after the profile lock wait, not at request start',async()=>{
        const user=await fundFree(admin),p=context(user);
        const notBefore=(await scalar(admin,"select clock_timestamp()+interval '750 milliseconds' as result")).toISOString();
        await a.query('begin');let pending;
        try{
            await a.query('select 1 from public.profiles where id=$1 for update',[user]);
            pending=recoverAfter(b,p,notBefore).then(value=>({value}),error=>({error}));
            let blocked=false;
            for(let i=0;i<100;i++){
                const row=(await admin.query('select wait_event_type,pg_blocking_pids(pid) as blockers from pg_stat_activity where pid=$1',[b.fixturePid])).rows[0];
                if(row?.wait_event_type==='Lock'&&row.blockers.includes(a.fixturePid)){blocked=true;break;}
                await delay(10);
            }
            assert.ok(blocked,'Recovery must wait on the same lock as purchase');
            let reached=false;
            for(let i=0;i<100;i++){
                reached=await scalar(admin,'select clock_timestamp()>=$1::timestamptz as result',[notBefore]);
                if(reached)break;
                await delay(20);
            }
            assert.ok(reached,'The database clock must reach notBefore before releasing the lock');
            await a.query('commit');
            assert.deepEqual(await pending,{value:null});
        }finally{await a.query('rollback');if(pending)await pending;}
        await assert.rejects(buy(a,{...p,validUntil:notBefore}),{message:'HINT_CONTEXT_EXPIRED',code:'22023'});
        assert.equal((await wallet(a,user)).hint_tickets,1);
    });
    await check('client roles cannot read or mutate any new table or call any new hint RPC',async()=>{
        const tables=['match_hint_receipts','match_hint_request_aliases','match_hint_restorations'];
        const funcs=(await admin.query("select oid::regprocedure::text as signature,proname,prosecdef,proconfig from pg_proc where pronamespace='public'::regnamespace and proname in('read_match_hint_receipt','read_existing_match_hint','buy_match_hint','restore_match_hint_credit','match_hint_payload','match_hint_assert_account','match_hint_clock')")).rows;
        assert.ok(funcs.length>=4);
        for(const f of funcs){assert.equal(f.prosecdef,false);assert.deepEqual(f.proconfig,['search_path=""']);}
        for(const role of ['anon','authenticated']){
            const c=await connectAs(role);
            await assert.rejects(c.query('select public.match_hint_clock()'),{code:'42501'});
            for(const table of tables){
                await assert.rejects(c.query(`select * from public.${table}`),{code:'42501'});
                await assert.rejects(c.query(`insert into public.${table} default values`),{code:'42501'});
                const column=table==='match_hint_restorations'?'receipt_id':'request_id';
                await assert.rejects(c.query(`update public.${table} set ${column}=${column}`),{code:'42501'});
                await assert.rejects(c.query(`delete from public.${table}`),{code:'42501'});
            }
            const p=context('Nobody');for(const operation of [()=>buy(c,p),()=>read(c,p),()=>existing(c,p),()=>restore(c,{receiptId:randomUUID()},'Nobody')])await assert.rejects(operation(),{code:'42501'});
            for(const f of funcs)assert.equal(await scalar(admin,'select has_function_privilege($1,$2,\'EXECUTE\') as result',[role,f.signature]),false);
        }
        for(const table of tables){
            const flags=(await admin.query('select relrowsecurity,relforcerowsecurity from pg_class where oid=$1::regclass',['public.'+table])).rows[0];
            assert.deepEqual(flags,{relrowsecurity:true,relforcerowsecurity:true});
            for(const operation of ['UPDATE','DELETE','TRUNCATE'])assert.equal(await scalar(admin,'select has_table_privilege(\'service_role\',$1,$2) as result',['public.'+table,operation]),false);
            const column=table==='match_hint_restorations'?'receipt_id':'request_id';
            await assert.rejects(a.query(`update public.${table} set ${column}=${column}`),{code:'42501'});
            await assert.rejects(a.query(`delete from public.${table}`),{code:'42501'});
            await assert.rejects(a.query(`truncate public.${table}`),{code:'42501'});
        }
        await admin.query('create role qg_rls_probe;grant usage on schema public to qg_rls_probe;grant select,insert,update,delete on public.match_hint_receipts,public.match_hint_request_aliases,public.match_hint_restorations to qg_rls_probe');
        const probe=await connectAs('qg_rls_probe');
        for(const table of tables){assert.equal(await scalar(probe,`select count(*)::integer as result from public.${table}`),0);
            const column=table==='match_hint_restorations'?'receipt_id':'request_id';
            assert.equal((await probe.query(`update public.${table} set ${column}=${column}`)).rowCount,0);assert.equal((await probe.query(`delete from public.${table}`)).rowCount,0);
            const sample=await scalar(admin,`select to_jsonb(r) as result from public.${table} r limit 1`);assert.ok(sample);
            await assert.rejects(probe.query(`insert into public.${table} select * from jsonb_populate_record(null::public.${table},$1::jsonb)`,[JSON.stringify(sample)]),{code:'42501'});
        }
    });
    await check('all source quantities remain conserved and match allocations never borrow another account source',async()=>{
        assert.equal(await scalar(admin,'select count(*)::integer as result from public.stripe_commerce_sources where available<0 or held<0 or consumed<0 or revoked<0 or quantity<>available+held+consumed+revoked'),0);
        assert.equal(await scalar(admin,'select count(*)::integer as result from public.match_hint_receipts r join public.stripe_commerce_sources s on s.id=r.source_id where s.user_id<>r.user_id or not s.livemode or s.origin<>r.origin'),0);
    });
    const files=[...new Set([...historical,...combinedPendingMigrations,MIGRATION])].map(name=>'supabase/migrations/'+name);
    files.push('scripts/qa/match-hint-postgres.test.mjs','scripts/qa/match-hint-native.mjs','scripts/qa/commerce-postgres-support.mjs',
        'scripts/qa/fixtures/commerce-postgres-baseline.mjs','scripts/qa/fixtures/session-postgres-baseline.mjs','server/src/services/fixtures/commerceDatabaseFixture.ts');
    const sourceSha256=Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(await readFile(new URL('../../'+file,import.meta.url))).digest('hex')])));
    const result={completed:failures===0,verifiedAt:new Date().toISOString(),postgres:await scalar(admin,'select version() as result'),passed:results.length,failed:failures,
        tests:results,sourceSha256,baseline:baselineEvidence,independentBackends:true,observedBlockingPids:true,
        limitations:['Native loopback-only synthetic public dependency schema; no hosted schema or PostgREST equivalence.',
            'No provider HTTP, live payment, game-engine authority, legal-move search, UI, deployment or environment changes.']};
    const output=join(tmpdir(),'qg-match-hint-postgres-results.json');await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log('Evidence '+output);
    assert.equal(failures,0,'Match-hint verification contains failed scenarios');
});
