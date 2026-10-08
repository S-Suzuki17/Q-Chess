// Real compiled adapter -> supabase-js -> loopback PostgREST -> native PG17.
// Synthetic accounts and payment evidence only; no provider or hosted requests.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { createHmac, randomBytes, randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import net from 'node:net';
import { createClient } from '@supabase/supabase-js';
import { connect, connection, account, scalar, HASH } from './commerce-postgres-support.mjs';
import { setupBaseline, applyPending, pending } from './fixtures/commerce-postgres-baseline.mjs';

test('commerce adapter through native PostgREST and pending SQL upgrade', { timeout: 180_000 }, async t => {
    const executable = process.env.QG_TEST_POSTGREST_BIN;
    assert.ok(executable && isAbsolute(executable), 'Set QG_TEST_POSTGREST_BIN to the verified local PostgREST executable');
    const version = spawnSync(executable, ['--version'], { encoding:'utf8', windowsHide:true, timeout:10_000 });
    assert.equal(version.status, 0); assert.match(version.stdout, /PostgREST/);
    const admin = await connect();
    let child, origin, api, service, store, currentTerms, user, intent, evidence, firstReceipt, overlayBefore, overlayAfter, logs = '';
    const results = [], paths = [], sourceSha256 = {};
    const sharedFlags = ['SHARED_MATCH_ENTITLEMENT_ENABLED','SHARED_MATCH_ADMISSION_ENABLED','SHARED_MATCH_ADMISSION_RECOVERY_ENABLED'];
    const savedFlags = new Map(sharedFlags.map(name => [name,process.env[name]]));
    const secret = randomBytes(32).toString('hex');
    const jwt = role => {
        const body = [{alg:'HS256',typ:'JWT'}, {role,exp:Math.floor(Date.now()/1000)+600}]
            .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
        return body + '.' + createHmac('sha256',secret).update(body).digest('base64url');
    };
    const serviceToken = jwt('service_role');
    const check = async (name, run) => {
        await run(); results.push(name); console.log('PASS ' + name);
    };
    const http = (pathname, {role='service_role',body,method,headers={}}={}) => fetch(origin+pathname, {
        method:method ?? (body === undefined ? 'GET' : 'POST'),
        headers:{Authorization:'Bearer '+(role==='service_role'?serviceToken:jwt(role)), 'Content-Type':'application/json',...headers},
        body:body === undefined ? undefined : JSON.stringify(body), signal:AbortSignal.timeout(5000),
    });
    const rpc = async (name, args) => {
        const result = await api.rpc(name,args).abortSignal(AbortSignal.timeout(5000));
        assert.equal(result.error,null, `${name}: ${JSON.stringify(result.error)}`); return result.data;
    };
    t.after(async () => {
        if(child && child.exitCode===null && child.signalCode===null) {
            const exited = once(child,'exit'); child.kill(); await exited;
        }
        await admin.end();
        for(const [name,value] of savedFlags) { if(value === undefined)delete process.env[name]; else process.env[name]=value; }
        for(const file of [...pending.map(name=>'supabase/migrations/'+name),
            'scripts/qa/commerce-postgrest.test.mjs','scripts/qa/commerce-postgres-support.mjs',
            'scripts/qa/fixtures/commerce-postgres-baseline.mjs','scripts/qa/fixtures/session-postgres-baseline.mjs',
            'scripts/qa/fixtures/hosted-release-overlay.sql',
            'server/src/services/fixtures/commerceDatabaseFixture.ts','server/src/services/StripeCommerceStore.ts',
            'server/src/services/AccountCurrentTerms.ts','server/dist/services/AccountCurrentTerms.js',
            'server/dist/services/StripeCommerceStore.js','server/dist/services/StripeMembershipStore.js',
            ...['SupabaseService','StripeCommerceReadiness','StripeCommerceDeletion','StripeCancellation','SharedMatchFeatureGates']
                .flatMap(name=>[`server/src/services/${name}.ts`,`server/dist/services/${name}.js`])]) {
            const data=await readFile(new URL('../../'+file,import.meta.url)).catch(()=>null);
            if(data)sourceSha256[file]=createHash('sha256').update(data).digest('hex');
        }
        await writeFile(join(tmpdir(),'commerce-postgrest-results.json'),JSON.stringify({
            completed:results.length===11, verifiedAt:new Date().toISOString(), tests:results, requests:paths,
            postgrestVersion:version.stdout.trim(), sourceSha256, nativePostgreSQL:true,
            actualCompiledAdapter:true, loopbackOnly:true, hostedProductionEquivalent:false,
            realStripeVerified:false, productionData:false,
            observedHostedCatalogOverlay:{before:overlayBefore,after:overlayAfter},
        },null,2)+'\n');
    });
    await check('public baseline starts with the new RPC unavailable', async () => {
        await setupBaseline(admin);
        // A Docker CI service may report bridge IPs inside PG even though this
        // driver can only use its published loopback port and synthetic DB.
        assert.equal(connection.host,'127.0.0.1');
        assert.equal(admin.connectionParameters.host,'127.0.0.1');
        assert.equal(admin.connectionParameters.database,'commerce_upgrade');
        await admin.query("set qg_fixture.allow_hosted_overlay='localhost_synthetic_only'; set qg_fixture.allow_container_transport='driver_loopback_verified'");
        await admin.query(await readFile(new URL('./fixtures/hosted-release-overlay.sql',import.meta.url),'utf8'));
        overlayBefore=await scalar(admin,'select qg_fixture.assert_stage(false) as result');
        await admin.query("create role qg_http_gateway login noinherit password 'qgambit-ephemeral-only'; grant anon,authenticated,service_role to qg_http_gateway");
        const listener=net.createServer(); listener.listen(0,'127.0.0.1'); await once(listener,'listening');
        const port=listener.address().port; await new Promise(done=>listener.close(done));
        origin='http://127.0.0.1:'+port;
        const env=Object.fromEntries(['SystemRoot','WINDIR','ComSpec','TEMP','TMP','PATH','PATHEXT']
            .filter(key=>process.env[key]).map(key=>[key,process.env[key]]));
        Object.assign(env,{PGRST_DB_URI:`postgresql://qg_http_gateway:qgambit-ephemeral-only@127.0.0.1:${connection.port}/commerce_upgrade?sslmode=disable&gssencmode=disable`,
            PGRST_SERVER_HOST:'127.0.0.1',PGRST_SERVER_PORT:String(port),PGRST_DB_SCHEMAS:'public',
            PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:secret,PGRST_DB_POOL:'3'});
        child=spawn(executable,['+RTS','-N2','-RTS'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
        let startError; child.once('error',error=>{startError=error;});
        for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{logs=(logs+data).slice(-4000);});
        const deadline=Date.now()+15_000; let ready=false;
        while(Date.now()<deadline) {
            if(startError)throw startError;
            ready=await http('/').then(r=>r.ok).catch(()=>false); if(ready)break; await delay(100);
        }
        assert.ok(ready,'PostgREST startup failed: '+logs);
        const missing=await http('/rpc/acquire_stripe_commerce_reconciliation',{body:{p_checkout_id:'cs_live_HTTPFixture01',p_livemode:true}});
        assert.equal(missing.status,404);
    });
    await check('explicit raw migrations become visible after schema-cache reload', async () => {
        await applyPending(admin);
        overlayAfter=await scalar(admin,'select qg_fixture.assert_stage(true) as result');
        await admin.query("notify pgrst, 'reload schema'");
        const deadline=Date.now()+10_000; let ready=false;
        while(Date.now()<deadline) {
            // Wait for the last forward migration, not an earlier catalog.
            ready=await http('/stripe_retired_commerce_checkouts?select=checkout_id&limit=0').then(r=>r.ok);
            if(ready)break; await delay(100);
        }
        assert.ok(ready,'Final Checkout retirement table not visible after schema reload');
        api=createClient(origin,serviceToken,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
            global:{fetch:(input,init)=>{
                const url=new URL(typeof input==='string'?input:input.url??String(input));
                assert.equal(url.origin,origin); assert.ok(url.pathname.startsWith('/rest/v1/'));
                url.pathname=url.pathname.slice('/rest/v1'.length); paths.push(url.pathname);
                return fetch(url,init);
            }}});
        const require=createRequire(import.meta.url);
        const {SupabaseService}=require('../../server/dist/services/SupabaseService.js');
        currentTerms=require('../../server/dist/services/AccountCurrentTerms.js');
        service=new SupabaseService(api);
        store=service.stripeCommerceStore();
    });
    await check('actual service sales prerequisites require the released shared flags and both final numeric HTTP protocols',async()=>{
        for(const name of sharedFlags)process.env[name]='true';
        for(const name of ['stripe_commerce_deletion_protocol_version','shared_match_admission_protocol_version'])
            assert.equal(await rpc(name,{}),1);
        const prerequisites=service.stripeCommercePrerequisites();
        assert.equal(prerequisites.enabled(),true);assert.equal(await prerequisites.check(),true);
        process.env.SHARED_MATCH_ADMISSION_ENABLED='false';
        const before=paths.length;
        assert.equal(prerequisites.enabled(),false);assert.equal(await prerequisites.check(),false);
        assert.equal(paths.length,before,'Paused admission must not query dependency protocols');
        process.env.SHARED_MATCH_ADMISSION_ENABLED='true';
        assert.equal(await prerequisites.check(),true);
    });
    await check('anonymous and authenticated browser roles cannot read or mutate the source ledger',async()=>{
        for(const role of ['anon','authenticated']) {
            const read=await http('/stripe_commerce_sources?select=id',{role});
            assert.ok([401,403].includes(read.status),`${role} ledger read: ${read.status} ${await read.text()}`);
            const mutate=await http('/rpc/acquire_stripe_commerce_reconciliation',
                {role,body:{p_checkout_id:'cs_live_HTTPFixture01',p_livemode:true}});
            assert.ok([401,403].includes(mutate.status),`${role} ledger RPC: ${mutate.status} ${await mutate.text()}`);
            const retired=await http('/stripe_retired_commerce_checkouts?select=checkout_id',{role});
            assert.ok([401,403].includes(retired.status),`${role} retirement read: ${retired.status}`);
            for(const [name,body] of [
                ['stripe_commerce_deletion_protocol_version',{}],
                ['retire_stripe_commerce_account_checkouts',{p_user_id:randomUUID(),p_checkouts:[]}],
            ]) {
                const result=await http('/rpc/'+name,{role,body});
                assert.ok([401,403].includes(result.status),`${role} ${name}: ${result.status}`);
            }
        }
    });
    await check('private schema cannot be selected through read or write HTTP profiles',async()=>{
        for(const role of ['anon','authenticated','service_role']) {
            for(const options of [
                {headers:{'Accept-Profile':'qg_private'}},
                {body:{},headers:{'Content-Profile':'qg_private'}},
            ]) {
                const response=await http('/rpc/acquire_stripe_commerce_reconciliation',{role,...options});
                assert.equal(response.status,406);
                assert.equal((await response.json()).code,'PGRST106');
            }
        }
    });
    await check('compiled current-terms adapter requires explicit acceptance of the new published version',async()=>{
        const oldUser=await account(admin,{oldTermsOnly:true});
        await admin.query("insert into public.account_terms_consents(user_id,version) values($1,'2026-10-03.1')",[oldUser]);
        const before=await currentTerms.readCurrentTerms(api,oldUser);
        assert.equal(before.currentVersion,'2026-10-07.1');
        assert.equal(before.effectiveDate,'2026-10-07');
        assert.equal(before.consent,null);
        assert.equal(await store.hasCurrentTerms(oldUser),false);
        const stale=await api.rpc('accept_current_account_terms',{p_user_id:oldUser,p_version:'2026-10-03.1'});
        assert.ok(stale.error,'Old-version acceptance must be rejected');
        assert.equal(await store.hasCurrentTerms(oldUser),false);
        await rpc('accept_current_account_terms',{p_user_id:oldUser,p_version:'2026-10-07.1'});
        assert.equal((await currentTerms.readCurrentTerms(api,oldUser)).consent.version,'2026-10-07.1');
        assert.equal(await store.hasCurrentTerms(oldUser),true);
        assert.equal(await scalar(admin,"select count(*)::integer as result from public.account_terms_consents where user_id=$1 and version='2026-10-03.1'",[oldUser]),1);
    });
    await check('compiled store registers consent and fulfills a known 13-hint source exactly once',async()=>{
        user=await account(admin);
        intent={checkoutId:'cs_live_HTTPFixture01',userId:user,sku:'hints_13',priceId:'price_HTTPHints13',amountTotal:1000,currency:'usd',livemode:true};
        await admin.query('insert into public.stripe_commerce_price_bindings values($1,$2,$3)',[intent.sku,intent.priceId,true]);
        await store.registerCheckoutIntent(intent,new Date(Date.now()+3600000).toISOString());
        assert.deepEqual(await store.checkoutIntent(intent.checkoutId,true),intent);
        assert.equal(await store.hasCurrentTerms(user),true);
        const lease=await store.acquireCommerceReconciliation(intent.checkoutId,true); assert.ok(lease.token);
        evidence={...intent,eventId:'evt_HTTPPurchase01',payloadHash:HASH,paymentStatus:'paid',token:lease.token,
            observedAt:new Date().toISOString(),paymentSource:{paymentIntentId:'pi_HTTPFixture01',chargeId:'ch_HTTPFixture01',
                customerId:null,amountRefunded:0,riskState:'clear',disputeId:null,disputeStatus:null}};
        assert.equal((await store.fulfillOneTime(evidence)).credited,13);
        assert.equal((await store.fulfillOneTime(evidence)).duplicate,true);
        const sources=await api.from('stripe_commerce_sources').select('available,quantity,state').eq('user_id',user);
        assert.equal(sources.error,null); assert.deepEqual(sources.data,[{available:13,quantity:13,state:'active'}]);
    });
    await check('HTTP hint receipts debit five units from that exact purchase',async()=>{
        for(let i=0;i<5;i++) {
            const session=await rpc('cpu_practice_open',{p_session_id:randomUUID(),p_user_id:user,p_player_side:'white',
                p_level:1,p_seconds:600,p_rules_version:'quantum-practice-v1',p_state_hash:HASH,
                p_state:{sideToMove:'white',ply:0,winner:null,pieces:Array.from({length:32},()=>({}))}});
            const receipt=await rpc('buy_cpu_hint_v2',{p_request_id:randomUUID(),p_user_id:user,p_session_id:session.sessionId,
                p_revision:session.revision,p_state_hash:session.stateHash,p_move:{pieceId:'w_1',target:{row:5,col:0}},
                p_hint:{fromRow:6,fromCol:0,toRow:5,toCol:0}});
            assert.ok(receipt.receiptId); firstReceipt??=receipt;
        }
        assert.equal(await scalar(admin,'select purchased_hint_tickets as result from public.ticket_wallets where user_id=$1',[user]),'8');
    });
    await check('full refund reclaims only the remaining eight and restoration cannot resurrect refunded stock',async()=>{
        const risk={...evidence,eventId:'evt_HTTPRefund01',subscriptionId:null,invoiceId:null,periodStart:null,periodEnd:null,
            paymentSource:{...evidence.paymentSource,amountRefunded:1000,riskState:'refunded'}};
        assert.equal((await store.applySourceRisk(risk)).recovered,8);
        assert.equal((await store.applySourceRisk(risk)).duplicate,true);
        assert.equal(await rpc('restore_cpu_hint_credit',{p_receipt_id:firstReceipt.receiptId,p_user_id:user,p_reason:'unrecoverable_delivery'}),0);
        assert.equal(await scalar(admin,'select purchased_hint_tickets as result from public.ticket_wallets where user_id=$1',[user]),'0');
    });
    await check('released HTTP reconciliation authority cannot be replayed',async()=>{
        await store.releaseCommerceReconciliation(intent.checkoutId,true,evidence.token);
        await assert.rejects(store.applySourceRisk({...evidence,eventId:'evt_HTTPStale01',subscriptionId:null,invoiceId:null,
            periodStart:null,periodEnd:null,paymentSource:{...evidence.paymentSource,amountRefunded:1000,riskState:'refunded'}}),
        /COMMERCE_STORE_UNAVAILABLE/);
        assert.ok(paths.includes('/rpc/fulfill_stripe_commerce_one_time'));
        assert.ok(paths.includes('/rpc/apply_stripe_commerce_source_risk'));
    });
    await check('compiled deletion factories read the complete pending intent, block premature erasure, and retain an anonymous HTTP retirement fence',async()=>{
        const retiringUser=await account(admin),ticketHash=randomBytes(32).toString('hex');
        const retiring={...intent,checkoutId:'cs_live_HTTPRetirement01',userId:retiringUser};
        await store.registerCheckoutIntent(retiring,new Date(Date.now()+3600000).toISOString());
        const links=await service.stripeDeletionLinks()(retiringUser);
        assert.deepEqual(links.commerce,[{...retiring,fulfilled:false}]);
        const deletion=service.accountDeletionStore();
        await deletion.begin(retiringUser,ticketHash,null);
        await assert.rejects(deletion.eraseData(ticketHash),/UNAVAILABLE/);
        // The provider terminal observation is synthetic here. Genuine Stripe
        // expiry and signed late replay are verified separately before release.
        await service.stripeRetireCommerceCheckouts()(retiringUser,[{
            checkoutId:retiring.checkoutId,livemode:true,terminalState:'expired',
        }]);
        await deletion.eraseData(ticketHash);await deletion.finish(ticketHash);
        const profile=await api.from('profiles').select('id').eq('id',retiringUser);
        assert.equal(profile.error,null);assert.deepEqual(profile.data,[]);
        const fence=await api.from('stripe_retired_commerce_checkouts').select('checkout_id,livemode,terminal_state')
            .eq('checkout_id',retiring.checkoutId);
        assert.equal(fence.error,null);assert.deepEqual(fence.data,[{
            checkout_id:retiring.checkoutId,livemode:true,terminal_state:'expired',
        }]);
        assert.deepEqual(await store.acquireCommerceReconciliation(retiring.checkoutId,true),{retired:true,token:null});
        assert.ok(paths.includes('/rpc/retire_stripe_commerce_account_checkouts'));
    });
});
