import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID, createHmac, createHash } from 'node:crypto';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { connect, scalar, wallet, purchase, contended, HASH } from './commerce-postgres-support.mjs';
import { setupBaseline, pending, historical } from './fixtures/commerce-postgres-baseline.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(join(root, 'server/package.json')); require('tsx/cjs/api').register();
const { createStripeCancellationGuard, createStripeDeletionLinkSource, createStripeRetireSubscriptions } = require('./src/services/StripeCancellation.ts');
const { createStripeRetireCommerceCheckouts } = require('./src/services/StripeCommerceDeletion.ts');
const { createAccountDeletionStore, completeAccountDeletion } = require('./src/services/AccountDeletion.ts');
const { StripeCommerceEvidence } = require('./src/services/StripeCommerceEvidence.ts');
const { StripeCommerceFulfillment } = require('./src/services/StripeCommerceFulfillment.ts');
const { createStripeCommerceStore } = require('./src/services/StripeCommerceStore.ts');
const { createStripeMembershipStore } = require('./src/services/StripeMembershipStore.ts');
const { QG_STRIPE_API_VERSION } = require('./src/services/StripeApiVersion.ts');
const price = () => 'price_DeletionHints13';
const MIGRATION = '20261007141624_dormant_commerce_checkout_retirement.sql';
const forward = existsSync(join(root, 'supabase/migrations', MIGRATION)) ? 'supabase/migrations/' + MIGRATION
    : 'scratch/commerce-deletion-migration/supabase/migrations/' + MIGRATION;
const safeTables = new Set(['stripe_checkout_intents','stripe_memberships','stripe_commerce_checkout_intents',
    'stripe_one_time_purchases','account_deletion_jobs']);
const safeRpcs = new Set(['stripe_commerce_deletion_protocol_version','retire_stripe_commerce_account_checkouts',
    'retire_stripe_account_subscriptions','account_deletion_ready','begin_account_deletion','account_deletion_objects',
    'erase_account_data','finish_account_deletion','acquire_stripe_commerce_reconciliation','release_stripe_commerce_reconciliation']);
function sqlClient(c, authClient = c) {
    return {
        rpc(name, args = {}) {
            assert.ok(safeRpcs.has(name));
            const entries = Object.entries(args); assert.ok(entries.every(([key]) => /^p_[a-z_]+$/.test(key)));
            return { async abortSignal() {
                try {
                    const argsSql = entries.map(([key],i) => key + '=>$' + (i+1)).join(',');
                    const values = entries.map(([key,value]) => ['p_checkouts','p_subscriptions'].includes(key) ? JSON.stringify(value) : value);
                    const data = name === 'account_deletion_objects'
                        ? (await c.query('select * from public.' + name + '(' + argsSql + ')', values)).rows
                        : await scalar(c, 'select public.' + name + '(' + argsSql + ') as result', values);
                    return { data, error: null };
                } catch (error) { return { data: null, error }; }
            } };
        },
        from(table) {
            assert.ok(safeTables.has(table)); const filters = []; let limit = 1001, columns = '*';
            const run = async single => {
                try {
                    const where = filters.map(([key],i) => key + '=$' + (i+1)).join(' and ');
                    const values = filters.map(([,value]) => value);
                    const count = await scalar(c, 'select count(*)::integer as result from public.' + table + ' where ' + where, values);
                    const rows = (await c.query('select ' + columns + ' from public.' + table + ' where ' + where + ' limit ' + limit, values)).rows;
                    for (const row of rows) if (typeof row.amount_total === 'string') row.amount_total = Number(row.amount_total);
                    return { data: single ? rows[0] ?? null : rows, count, error: null };
                } catch (error) { return { data: null, count: null, error }; }
            };
            const query = { select(value) { assert.match(value,/^(?:\*|[a-z_]+(?:,[a-z_]+)*)$/); columns=value; return query; }, eq(key,value) {
                assert.ok(['user_id','ticket_hash','checkout_id','livemode'].includes(key)); filters.push([key,value]); return query;
            }, limit(value) { assert.ok(value === 1001); limit=value; return query; },
            abortSignal() { return run(false); }, maybeSingle() { return run(true); } };
            return query;
        },
        auth: { admin: { async deleteUser(id) { await authClient.query('delete from auth.users where id=$1', [id]); return { error: null }; } } },
    };
}
async function account(admin) {
    const user = randomUUID();
    await admin.query("insert into public.profiles(id,name) values($1,'Same display name')", [user]);
    await admin.query("insert into public.account_terms_consents(user_id,version) values($1,'2026-10-07.1')", [user]);
    await admin.query('insert into public.ticket_wallets(user_id) values($1)', [user]);
    return user;
}
async function register(c, user) {
    const checkout = 'cs_test_Deletion' + randomUUID().replaceAll('-', '');
    await c.query("select public.register_stripe_commerce_checkout_intent($1,$2,'hints_13',$3,1000,'usd',false,clock_timestamp()+interval '1 hour')",
        [user, checkout, price('hints_13')]);
    return { user, checkout, sku: 'hints_13', price: price('hints_13'), amount: 1000, live: false };
}
const begin = (c, user, hash = randomUUID().replaceAll('-','').repeat(2)) => scalar(c, 'select public.begin_account_deletion($1,$2,null) as result', [user,hash]).then(() => hash);
const row = (intent, terminalState = 'expired') => ({ checkoutId: intent.checkout, livemode: false, terminalState });
const retire = (c, user, rows) => scalar(c, 'select public.retire_stripe_commerce_account_checkouts($1,$2::jsonb) as result', [user,JSON.stringify(rows)]);
const fence = (c, intent) => scalar(c, 'select count(*)::integer as result from public.stripe_retired_commerce_checkouts where checkout_id=$1', [intent.checkout]);
const lease = (c, intent) => scalar(c, 'select public.acquire_stripe_commerce_reconciliation($1,false) as result', [intent.checkout]);


const riskEvidence=(intent,token)=>({eventId:'evt_DeletionRisk'+randomUUID().replaceAll('-',''),payloadHash:HASH,observedAt:new Date().toISOString(),
    checkoutId:intent.checkout,userId:intent.user,sku:intent.sku,priceId:intent.price,amountTotal:intent.amount,currency:'usd',livemode:false,
    subscriptionId:null,invoiceId:null,periodStart:null,periodEnd:null,token,paymentSource:{paymentIntentId:'pi_'+intent.checkout.replaceAll('_',''),
    chargeId:'ch_'+intent.checkout.replaceAll('_',''),customerId:null,amountRefunded:0,riskState:'disputed',disputeId:'dp_DeletionRisk123',disputeStatus:'needs_response'}});
const riskBalance=(c,intent)=>scalar(c,"select jsonb_build_object('quantity',quantity,'available',available,'held',held,'consumed',consumed,'revoked',revoked,'state',state) as result from public.stripe_commerce_sources where checkout_id=$1",[intent.checkout]);
const applyRisk=(c,evidence)=>scalar(c,'select public.apply_stripe_commerce_source_risk($1::jsonb) as result',[JSON.stringify(evidence)]);

test('native PostgreSQL one-time Checkout retirement and account erasure', { timeout: 180_000 }, async t => {
    const clients = [], results = []; let failures = 0, a, b;
    const open = async role => { const c=await connect(role);clients.push(c);return c; };
    const admin=await open();t.after(async()=>{await Promise.allSettled(clients.map(c=>c.end()));});
    const check=(name,operation)=>t.test(name,{timeout:20_000},async()=>{try{await operation();results.push(name);}catch(e){failures++;throw e;}});
    await check('unchanged combined baseline then one explicit staged forward migration, without fabrication',async()=>{
        await setupBaseline(admin);
        assert.deepEqual((await readdir(join(root,'supabase/migrations'))).filter(x=>x.endsWith('.sql')&&x>=pending[0]).sort(),pending);
        for(const file of pending.filter(x=>x!==MIGRATION))await admin.query(await readFile(join(root,'supabase/migrations',file),'utf8'));
        a=await open('service_role');b=await open('service_role');await admin.query("insert into public.stripe_commerce_price_bindings values('hints_13','price_DeletionHints13',false)");
        const user=await account(admin);await register(a,user);
        await admin.query(await readFile(join(root,forward),'utf8'));
        assert.equal(await scalar(a,'select public.stripe_commerce_deletion_protocol_version() as result'),1);
        assert.equal(await scalar(a,'select count(*)::integer as result from public.stripe_retired_commerce_checkouts'),0);
        assert.equal(await scalar(a,'select count(*)::integer as result from public.stripe_commerce_consumed_checkouts'),0);
    });
    await check('real guard, deletion RPCs, new UID and delayed signed paid event preserve anonymous retirement',async()=>{
        const user=await account(admin),intent=await register(a,user),client=sqlClient(a,admin);
        const store=createAccountDeletionStore(client,async()=>null),hash=randomUUID().replaceAll('-','').repeat(2);
        await admin.query("insert into auth.users(id,email) values($1,'synthetic-deletion@example.invalid')",[user]);
        await store.begin(user,hash,user);
        let state='open';const calls=[];
        const request=async(input,init)=>{
            const path=new URL(String(input)).pathname;calls.push({path,method:init?.method??'GET'});
            if(path.endsWith('/line_items'))return Response.json({data:[{quantity:1,price:{id:intent.price,livemode:false,
                type:'one_time',recurring:null,unit_amount:1000,currency:'usd',tax_behavior:'inclusive'}}],has_more:false});
            if(path.endsWith('/expire'))state='expired';
            return Response.json({id:intent.checkout,livemode:false,client_reference_id:user,mode:'payment',subscription:null,
                customer:null,metadata:{qgambit_sku:'hints_13'},amount_total:1000,currency:'usd',status:state,payment_status:'unpaid',payment_intent:null});
        };
        const guard=createStripeCancellationGuard(createStripeDeletionLinkSource(client,true),{test:'sk_test_NativeDeletion123'},request,
            createStripeRetireSubscriptions(client),{releaseEnabled:true,retire:createStripeRetireCommerceCheckouts(client)});
        assert.equal(await completeAccountDeletion(store,hash,async()=>{},guard),'completed');
        assert.equal(calls.filter(c=>c.path.endsWith('/expire')).length,1);assert.equal(state,'expired');
        assert.equal(await scalar(admin,'select count(*)::integer as result from auth.users where id=$1',[user]),0);
        assert.equal(await wallet(a,user),undefined);assert.equal(await fence(a,intent),1);
        assert.equal(await scalar(a,'select count(*)::integer as result from public.stripe_commerce_consumed_checkouts where checkout_id=$1',[intent.checkout]),0);
        const fresh=await account(admin),before=await wallet(a,fresh);assert.notEqual(fresh,user);
        assert.deepEqual(await lease(a,intent),{retired:true,token:null});
        assert.equal((await purchase(a,intent)).retired,true);
        const evidence=new StripeCommerceEvidence({secretKey:'sk_test_NativeDeletion123',livemode:false,automaticTaxEnabled:false},
            async()=>{throw Error('A retired signed event must not read the provider');});
        const fulfillment=new StripeCommerceFulfillment(evidence,createStripeCommerceStore(client,createStripeMembershipStore(client,async()=>null,async()=>false)),
            'whsec_native_deletion_synthetic');
        const now=Math.floor(Date.now()/1000),payload=Buffer.from(JSON.stringify({id:'evt_NativeDeletion'+randomUUID().replaceAll('-',''),
            type:'checkout.session.completed',api_version:QG_STRIPE_API_VERSION,created:now,livemode:false,
            data:{object:{id:intent.checkout,mode:'payment',metadata:{qgambit_sku:'hints_13'}}}}));
        const sig=createHmac('sha256','whsec_native_deletion_synthetic').update(now+'.').update(payload).digest('hex');
        assert.deepEqual(await fulfillment.fulfillWebhook(payload,{'stripe-signature':'t='+now+',v1='+sig}),
            {applied:false,duplicate:false,credited:0,retired:true});
        assert.deepEqual(await wallet(a,fresh),before);
        await assert.rejects(a.query("select public.register_stripe_commerce_checkout_intent($1,$2,'hints_13',$3,1000,'usd',false,clock_timestamp()+interval '1 hour')",
            [fresh,intent.checkout,intent.price]),{code:'23505'});
        const keys=Object.keys((await a.query('select * from public.stripe_retired_commerce_checkouts where checkout_id=$1',[intent.checkout])).rows[0]).sort();
        assert.deepEqual(keys,['checkout_id','livemode','retired_at','terminal_state']);
    });
    await check('data-deleted retries finish Auth removal without re-reading vanished legacy billing',async()=>{
        const user=await account(admin),intent=await register(a,user),client=sqlClient(a,admin);
        await admin.query("insert into auth.users(id,email) values($1,'synthetic-retry@example.invalid')",[user]);
        const store=createAccountDeletionStore(client,async()=>null),hash=randomUUID().replaceAll('-','').repeat(2);
        await store.begin(user,hash,user);await retire(a,user,[row(intent)]);await store.eraseData(hash);
        assert.equal((await store.job(hash)).phase,'data_deleted');
        const guard=createStripeCancellationGuard(createStripeDeletionLinkSource(client,true),{},
            async()=>{throw Error('No provider reads for an erased inventory');},createStripeRetireSubscriptions(client),
            {releaseEnabled:true,retire:createStripeRetireCommerceCheckouts(client)});
        assert.equal(await completeAccountDeletion(store,hash,async()=>{},guard),'completed');
        assert.equal(await scalar(admin,'select count(*)::integer as result from auth.users where id=$1',[user]),0);
        assert.deepEqual(await store.job(hash),{ticket_hash:hash,user_id:null,auth_user_id:null,phase:'completed'});
        assert.equal(await completeAccountDeletion(store,hash,async()=>{throw Error('Completed retry called barrier');},guard),'completed');
        assert.equal(await fence(a,intent),1);
    });
    await check('a verified Auth signup with no profile completes empty-inventory deletion',async()=>{
        const user=randomUUID(),client=sqlClient(a,admin),store=createAccountDeletionStore(client,async()=>null);
        await admin.query("insert into auth.users(id,email) values($1,'synthetic-auth-only@example.invalid')",[user]);
        const hash=randomUUID().replaceAll('-','').repeat(2);await store.begin(user,hash,user);
        const guard=createStripeCancellationGuard(createStripeDeletionLinkSource(client,true),{},
            async()=>{throw Error('No provider reads for an Auth-only signup');},createStripeRetireSubscriptions(client),
            {releaseEnabled:true,retire:createStripeRetireCommerceCheckouts(client)});
        assert.equal(await completeAccountDeletion(store,hash,async()=>{},guard),'completed');
        assert.equal(await scalar(admin,'select count(*)::integer as result from auth.users where id=$1',[user]),0);
        await assert.rejects(retire(a,randomUUID(),[]),/Deletion intent required/);
    });
    await check('erasure without a terminal fence fails closed and preserves the unpaid binding',async()=>{
        const user=await account(admin),intent=await register(a,user),hash=await begin(a,user);
        await assert.rejects(a.query('select public.erase_account_data($1)',[hash]),/COMMERCE_DELETION_RETIREMENT_REQUIRED/);
        assert.equal(await scalar(a,'select count(*)::integer as result from public.stripe_commerce_checkout_intents where checkout_id=$1',[intent.checkout]),1);
    });
    await check('retirement requires a pending deletion and the complete unique account inventory',async()=>{
        const user=await account(admin),one=await register(a,user),two=await register(a,user);
        await assert.rejects(retire(a,user,[row(one),row(two)]),/Deletion intent required/);await begin(a,user);
        await assert.rejects(retire(a,user,[row(one)]),/Incomplete commerce deletion inventory/);
        await assert.rejects(retire(a,user,[row(one),row(one)]),/Invalid retired Checkout/);
        assert.equal(await fence(a,one),0);assert.equal(await fence(a,two),0);
        await retire(a,user,[row(one),row(two)]);assert.equal(await fence(a,two),1);
    });
    await check('foreign ownership, opposite mode and nonterminal evidence never produce a fence',async()=>{
        const user=await account(admin),other=await account(admin),intent=await register(a,user);await begin(a,user);
        for(const entry of [{...row(intent),livemode:true},{...row(intent),terminalState:'processing'},
            {...row(intent),checkoutId:'cs_test_ForeignDeletion123'}])await assert.rejects(retire(a,user,[entry]));
        await begin(a,other);await assert.rejects(retire(a,other,[row(intent)]));assert.equal(await fence(a,intent),0);
    });
    await check('SQL refuses to mark a paid but unfulfilled purchase as settled',async()=>{
        const user=await account(admin),intent=await register(a,user);await begin(a,user);
        await assert.rejects(retire(a,user,[row(intent,'completed_paid')]),/COMMERCE_DELETION_SETTLEMENT_REQUIRED/);
        assert.equal(await fence(a,intent),0);
    });
    await check('a verified existing paid purchase retires without crediting again',async()=>{
        const user=await account(admin),intent=await register(a,user);await purchase(a,intent);await begin(a,user);
        await assert.rejects(retire(a,user,[row(intent)]),/COMMERCE_DELETION_SETTLEMENT_REQUIRED/);
        await retire(a,user,[row(intent,'completed_paid')]);assert.equal((await wallet(a,user)).test_purchased_hint_tickets,13);
        assert.equal((await purchase(a,intent)).retired,true);
    });
    await check('retirement commits before a waiting raw fulfillment can use the old binding',async()=>{
        const user=await account(admin),intent=await register(a,user);await begin(a,user);
        const result=await contended(admin,a,b,c=>retire(c,user,[row(intent)]),c=>purchase(c,intent));
        assert.equal(result[1].retired,true);assert.equal((await wallet(a,user)).test_purchased_hint_tickets,0);
    });
    await check('retirement rollback leaves no fence and the pending account cannot grant',async()=>{
        const user=await account(admin),intent=await register(a,user);await begin(a,user);
        const result=await contended(admin,a,b,c=>retire(c,user,[row(intent)]),
            c=>purchase(c,intent).catch(e=>({code:e.code})),{rollback:true});
        assert.deepEqual(result[1],{code:'42501'});assert.equal(await fence(a,intent),0);
    });
    await check('concurrent duplicate retirement observes a real profile lock and stores one row',async()=>{
        const user=await account(admin),intent=await register(a,user);await begin(a,user);
        await contended(admin,a,b,c=>retire(c,user,[row(intent)]),c=>retire(c,user,[row(intent)]));assert.equal(await fence(a,intent),1);
    });
    await check('begin deletion serializes and rejects a competing new Checkout registration',async()=>{
        const user=await account(admin),hash=randomUUID().replaceAll('-','').repeat(2);
        const result=await contended(admin,a,b,c=>begin(c,user,hash),c=>register(c,user).catch(e=>({code:e.code})));
        assert.deepEqual(result[1],{code:'42501'});
    });
    await check('purchase committed before deletion remains a real paid source that can be retired',async()=>{
        const user=await account(admin),intent=await register(a,user);
        const result=await contended(admin,a,b,c=>purchase(c,intent),c=>begin(c,user));
        assert.equal(result[0].credited,13);await retire(a,user,[row(intent,'completed_paid')]);
        assert.equal(await fence(a,intent),1);assert.equal((await wallet(a,user)).test_purchased_hint_tickets,13);
    });
    await check('deletion rollback lets the competing Checkout registration finish',async()=>{
        const user=await account(admin),hash=randomUUID().replaceAll('-','').repeat(2);
        const result=await contended(admin,a,b,c=>begin(c,user,hash),c=>register(c,user),{rollback:true});
        assert.equal(result[1].user,user);assert.equal(await fence(a,result[1]),0);
        assert.equal(await scalar(a,'select count(*)::integer as result from public.account_deletion_jobs where user_id=$1',[user]),0);
    });
    await check('retirement serializes before a waiting source-risk update without moving the balance',async()=>{
        const user=await account(admin),intent=await register(a,user);await purchase(a,intent);
        const token=(await lease(a,intent)).token;await begin(a,user);
        const result=await contended(admin,a,b,c=>retire(c,user,[row(intent,'completed_paid')]),
            c=>applyRisk(c,riskEvidence(intent,token)));
        assert.equal(result[1].retired,true);assert.equal((await wallet(a,user)).test_purchased_hint_tickets,13);
        assert.equal(await scalar(a,'select count(*)::integer as result from public.stripe_commerce_source_risk_receipts where source_key=$1',[intent.checkout]),0);
    });
    await check('source-risk update committed before retirement preserves its exact held allocation',async()=>{
        const user=await account(admin),intent=await register(a,user);await purchase(a,intent);
        const token=(await lease(a,intent)).token;await begin(a,user);
        const result=await contended(admin,a,b,c=>applyRisk(c,riskEvidence(intent,token)),
            c=>retire(c,user,[row(intent,'completed_paid')]));
        assert.equal(result[0].held,13);assert.equal(await fence(a,intent),1);
        assert.equal((await wallet(a,user)).test_purchased_hint_tickets,0);
        const balance=await scalar(a,"select jsonb_build_object('available',available,'held',held,'revoked',revoked,'state',state) as result from public.stripe_commerce_sources where checkout_id=$1",[intent.checkout]);
        assert.deepEqual(balance,{available:0,held:13,revoked:0,state:'held'});
    });
    // The du_ routing ID was observed in owned sandbox run qg_risk_xwsuudxm.
    // These transactions are synthetic native SQL regressions, not a provider replay.
    await check('observed provider du_ dispute ID holds then releases only its source after won',async()=>{
        const user=await account(admin),intent=await register(a,user);await purchase(a,intent);
        const token=(await lease(a,intent)).token,evidence=riskEvidence(intent,token);
        evidence.paymentSource.disputeId='du_1UO7j8QnCC46MW4g1TsBUUqm';
        assert.equal((await applyRisk(a,evidence)).held,13);
        assert.equal((await wallet(a,user)).test_purchased_hint_tickets,0);
        assert.deepEqual(await riskBalance(a,intent),{quantity:13,available:0,held:13,consumed:0,revoked:0,state:'held'});
        const won={...evidence,eventId:'evt_DeletionDuWon'+randomUUID().replaceAll('-',''),
            paymentSource:{...evidence.paymentSource,riskState:'clear',disputeStatus:'won'}};
        assert.equal((await applyRisk(a,won)).released,13);
        assert.equal((await wallet(a,user)).test_purchased_hint_tickets,13);
        const after={quantity:13,available:13,held:0,consumed:0,revoked:0,state:'active'};
        assert.deepEqual(await riskBalance(a,intent),after);
        const replay=await applyRisk(a,won);assert.equal(replay.duplicate,true);assert.equal(replay.released,0);
        assert.deepEqual(await riskBalance(a,intent),after);
    });
    await check('observed provider du_ dispute ID holds then revokes unused source units after lost',async()=>{
        const user=await account(admin),intent=await register(a,user);await purchase(a,intent);
        const token=(await lease(a,intent)).token,evidence=riskEvidence(intent,token);
        evidence.paymentSource.disputeId='du_1UO7j8QnCC46MW4g1TsBUUqm';
        assert.equal((await applyRisk(a,evidence)).held,13);
        const lost={...evidence,eventId:'evt_DeletionDuLost'+randomUUID().replaceAll('-',''),
            paymentSource:{...evidence.paymentSource,riskState:'dispute_lost',disputeStatus:'lost'}};
        assert.equal((await applyRisk(a,lost)).recovered,13);
        const after={quantity:13,available:0,held:0,consumed:0,revoked:13,state:'revoked'};
        assert.deepEqual(await riskBalance(a,intent),after);assert.equal((await wallet(a,user)).test_purchased_hint_tickets,0);
        const laterClear={...lost,eventId:'evt_DeletionDuLaterClear'+randomUUID().replaceAll('-',''),
            paymentSource:{...evidence.paymentSource,riskState:'clear',disputeStatus:'won'}};
        assert.equal((await applyRisk(a,laterClear)).released,0);
        assert.deepEqual(await riskBalance(a,intent),after);assert.equal((await wallet(a,user)).test_purchased_hint_tickets,0);
    });
    await check('an invalid dispute prefix is rejected without changing the held ledger or receipts',async()=>{
        const user=await account(admin),intent=await register(a,user);await purchase(a,intent);
        const token=(await lease(a,intent)).token,evidence=riskEvidence(intent,token);
        evidence.paymentSource.disputeId='du_1UO7j8QnCC46MW4g1TsBUUqm';await applyRisk(a,evidence);
        const snapshot=async()=>({wallet:await wallet(a,user),balance:await riskBalance(a,intent),
            risks:(await a.query('select * from public.stripe_commerce_source_risks where checkout_id=$1',[intent.checkout])).rows,
            receipts:(await a.query('select * from public.stripe_commerce_source_risk_receipts where source_key=$1 order by event_id',[intent.checkout])).rows});
        const before=await snapshot();
        for(const id of ['zz_1UO7j8QnCC46MW4g1TsBUUqm','du_','du_Invalid-ID']){
            const malformed={...evidence,eventId:'evt_DeletionInvalidPrefix'+randomUUID().replaceAll('-',''),
                paymentSource:{...evidence.paymentSource,disputeId:id,riskState:'dispute_lost',disputeStatus:'lost'}};
            await assert.rejects(applyRisk(a,malformed),{code:'22023'});assert.deepEqual(await snapshot(),before);
        }
    });
    await check('an already acquired stale token cannot restore grant after retirement and erasure',async()=>{
        const user=await account(admin),intent=await register(a,user),token=(await lease(a,intent)).token;assert.ok(token);
        const hash=await begin(a,user);await retire(a,user,[row(intent)]);await a.query('select public.erase_account_data($1)',[hash]);
        const result=await scalar(a,'select public.fulfill_stripe_commerce_one_time($1::jsonb) as result',
            [JSON.stringify({checkoutId:intent.checkout,livemode:false,token})]);
        assert.equal(result.retired,true);assert.equal(await wallet(a,user),undefined);
        assert.deepEqual(await lease(a,intent),{retired:true,token:null});
    });
    await check('anonymous and authenticated roles cannot inspect or create retirement evidence',async()=>{
        for(const role of ['anon','authenticated']){
            const c=await open(role);
            await assert.rejects(c.query('select public.stripe_commerce_deletion_protocol_version()'),{code:'42501'});
            await assert.rejects(c.query("select public.retire_stripe_commerce_account_checkouts('Alice','[]')"),{code:'42501'});
            await assert.rejects(c.query('select * from public.stripe_retired_commerce_checkouts'),{code:'42501'});
            await assert.rejects(c.query("insert into public.stripe_retired_commerce_checkouts values('cs_test_ForbiddenInsert',false,'expired',clock_timestamp())"),{code:'42501'});
        }
    });
    await check('the retirement fence is immutable and service-only with invoker functions and empty search path',async()=>{
        const grants=(await admin.query("select has_table_privilege('service_role','public.stripe_retired_commerce_checkouts','SELECT') as read,has_table_privilege('service_role','public.stripe_retired_commerce_checkouts','INSERT') as append,has_table_privilege('service_role','public.stripe_retired_commerce_checkouts','UPDATE,DELETE,TRUNCATE') as alter")).rows[0];
        assert.deepEqual(grants,{read:true,append:true,alter:false});
        const rel=(await admin.query("select relrowsecurity,relforcerowsecurity from pg_class where oid='public.stripe_retired_commerce_checkouts'::regclass")).rows[0];
        assert.deepEqual(rel,{relrowsecurity:true,relforcerowsecurity:true});
        const routines=(await admin.query("select proname,prosecdef,proconfig from pg_proc where oid in('public.stripe_commerce_deletion_protocol_version()'::regprocedure,'public.retire_stripe_commerce_account_checkouts(text,jsonb)'::regprocedure,'public.guard_unretired_commerce_account_erasure()'::regprocedure)")).rows;
        assert.equal(routines.length,3);
        for(const routine of routines){assert.equal(routine.prosecdef,false);assert.deepEqual(routine.proconfig,['search_path=""']);}
    });
    const files=[forward,'scripts/qa/commerce-deletion-postgres.test.mjs','scripts/qa/commerce-deletion-native.mjs',
        'scripts/qa/commerce-postgres-support.mjs','scripts/qa/fixtures/commerce-postgres-baseline.mjs','scripts/qa/fixtures/session-postgres-baseline.mjs',
        'server/src/services/fixtures/commerceDatabaseFixture.ts','server/src/services/StripeCancellation.ts','server/src/services/StripeCommerceDeletion.ts',
        'server/src/services/AccountDeletion.ts','server/src/services/StripeCommerceFulfillment.ts','server/src/services/StripeCommerceEvidence.ts',
        'server/src/services/StripeCommerceStore.ts','server/src/services/StripeClient.ts','server/src/services/StripeApiVersion.ts',
        ...[...new Set([...historical,...pending])].map(name=>'supabase/migrations/'+name)];
    const sourceSha256=Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(await readFile(join(root,file))).digest('hex')])));
    const result={createdAt:new Date().toISOString(),status:failures?'FAIL':'PASS',postgres:await scalar(admin,"select version() as result"),
        scenarios:results.length,failures,results,sourceSha256,limitations:['Synthetic Stripe transport/signature and Auth deletion adapter; no provider or hosted API.','Native independent backends verify actual lock waits; isolated public combined schema is not a full hosted schema mirror.']};
    const output=join(tmpdir(),'qg-commerce-deletion-postgres-results.json');await writeFile(output,JSON.stringify(result,null,2));console.log('Evidence '+output);
});
