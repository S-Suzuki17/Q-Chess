// Disposable loopback PostgreSQL + actual membership routers / SDK / Store.
// Credentials stay in Stripe CLI's OS store. Never print child stderr or raw events.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFile,spawn,spawnSync} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes,randomUUID,createHash,timingSafeEqual} from 'node:crypto';
import {mkdir,mkdtemp,writeFile,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import http from 'node:http';
import {once} from 'node:events';
import {setupStripeFixture,stripeMigrations} from './stripe-canonical-fixture.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const task=path.resolve(root,'../..');
const serverRequire=createRequire(path.join(root,'server/package.json'));
const pgRequire=createRequire(path.join(root,'scratch/stripe-postgres/package.json'));
const express=serverRequire('express');
const {Client}=pgRequire('pg');
const {StripeMembershipApi,verifyStripeWebhook}=serverRequire('./dist/services/StripeMembership');
const {createStripeMembershipStore}=serverRequire('./dist/services/StripeMembershipStore');
const {createStripeMembershipRouter,createStripeWebhookRouter}=serverRequire('./dist/services/StripeMembershipRoutes');
const {RankedAuth}=serverRequire('./dist/services/RankedAuth');
const {AccountWriteGate}=serverRequire('./dist/services/AccountDeletion');
const {createTicketSpendStore}=serverRequire('./dist/services/TicketSpendStore');
const {initdb,pg_ctl}=await import(new URL('../../scratch/stripe-postgres/node_modules/@embedded-postgres/windows-x64/dist/index.js',import.meta.url));
const cli=process.env.QG_QA_STRIPE_CLI??'C:/Users/souta/Documents/Codex/2026-09-09/blender-x20/tools/stripe-cli/node_modules/@stripe/cli-win32-x64/bin/stripe.exe';
const version='2026-08-26.dahlia',account='acct_1ULKIbQnCC46MW4g';
const execute=promisify(execFile),delay=ms=>new Promise(r=>setTimeout(r,ms));
const suffix=Array.from(randomBytes(8),b=>String.fromCharCode(97+b%26)).join('');
const run='qg_checkout_'+suffix,user='T4Checkout'+suffix;
const output=path.join(task,'outputs','stripe-checkout-e2e-current.json');
const control=path.join(task,'work','stripe-checkout-e2e-'+suffix+'.stop');
const report={run,user,startedAt:new Date().toISOString(),phase:'preparing',completed:false,
  scope:'Actual authenticated membership HTTP routes, SDK via CLI auth transport, raw signed events, actual Store and native PostgreSQL migrations. Loopback auth fixture and direct PostgreSQL RPC transport; not hosted Supabase/PostgREST or full gameplay.',
  consumptionLimitation:'Current game consumers only accept live paid tickets. Sandbox paid consumption cannot pass without a separately approved mode-aware implementation. No test-to-live rewriting is performed.',
  sourceCommit:'db7a391159c8ed5d654006af0c0a16f819868494',migrations:stripeMigrations,apiVersion:version,accountId:account,livemode:false,
  automaticTax:false,capSourceUnmodified:true,events:[],checks:[],resources:{},cleanup:[],controlFile:control};
let saveQueue=Promise.resolve();
const save=()=>{const snapshot=JSON.stringify(report,null,2)+'\n';saveQueue=saveQueue.then(async()=>{
  await mkdir(path.dirname(output),{recursive:true});
  await writeFile(path.join(path.dirname(output),'stripe-checkout-e2e-'+suffix+'.json'),snapshot);
  await writeFile(output,snapshot);
});return saveQueue;};
const mark=async(name,data={})=>{report.checks.push({name,at:new Date().toISOString(),...data});await save();console.log(JSON.stringify({name,...data}));};
const safeError=e=>({code:/^[A-Za-z0-9_]+$/.test(e.code??'')?e.code:null,reason:/^[A-Z_]+$/.test(e.message??'')?e.message:'HARNESS_OPERATION_FAILED'});
const must=(value,reason)=>{if(!value)throw new Error(reason);};
const id=v=>typeof v==='string'?v:v?.id;
let cluster,pgRunning=false,admin,service,appServer,proxy,listener,secret,token,api,product,price,checkoutId,subscriptionId,customerId,stopping=false;
let queue=Promise.resolve(),lastSigned;
const env={...process.env,PATH:path.dirname(pg_ctl)+';'+path.join(path.dirname(path.dirname(pg_ctl)),'lib')+';'+process.env.PATH};
function command(exe,args){const r=spawnSync(exe,args,{windowsHide:true,stdio:'ignore',env,timeout:30000});must(!r.error&&r.status===0,'POSTGRES_COMMAND_FAILED');}
async function listen(server){server.listen(0,'127.0.0.1');await once(server,'listening');return server.address().port;}
async function identity(){
  let result;try{result=await execute(cli,['whoami','--format','json'],{encoding:'utf8',windowsHide:true,timeout:15000});}catch{throw new Error('CLI_AUTH_REQUIRED');}
  let data;try{data=JSON.parse(result.stdout);}catch{throw new Error('CLI_IDENTITY_INVALID');}
  must(data.account_id===account&&data.mode==='test'&&data.expires_at*1000>Date.now()+60000,'SANDBOX_IDENTITY_OR_EXPIRY_GUARD');
  return {accountId:data.account_id,mode:data.mode,expiresAt:new Date(data.expires_at*1000).toISOString()};
}
function flatten(value,prefix,out){if(value!==null&&typeof value==='object')for(const [k,v]of Object.entries(value))flatten(v,prefix?`${prefix}[${k}]`:k,out);else if(value!==undefined)out.push('-d',`${prefix}=${value===null?'':String(value)}`);}
async function apiCall(method,endpoint,params={},options={}){
  must(/^\/v1\/[a-z_/A-Za-z0-9]+$/.test(endpoint)&&['get','post','delete'].includes(method),'API_PATH_GUARD');
  if(method!=='get')await identity();
  const args=[method,endpoint,'--confirm','--stripe-version',version];flatten(params,'',args);
  if(options.idempotencyKey)args.push('--idempotency',options.idempotencyKey);
  let result;try{result=await execute(cli,args,{encoding:'utf8',windowsHide:true,maxBuffer:2*1024*1024,timeout:25000});}catch{throw new Error('CLI_REQUEST_FAILED');}
  let data;try{data=JSON.parse(result.stdout);}catch{throw new Error('CLI_JSON_INVALID');}
  if(data.error){const e=new Error('STRIPE_API_ERROR');e.code=data.error.code??data.error.type;throw e;}
  must(data.livemode!==true&&!data.data?.some(x=>x.livemode===true),'LIVE_RESPONSE_GUARD');return data;
}
async function sdkFetch(url,init={}){
  const parsed=new URL(url);must(parsed.origin==='https://api.stripe.com','SDK_HOST_GUARD');
  const params=Object.fromEntries(parsed.searchParams);for(const [k,v]of new URLSearchParams(init.body??''))params[k]=v;
  return Response.json(await apiCall((init.method??'GET').toLowerCase(),parsed.pathname,params,{idempotencyKey:new Headers(init.headers).get('Idempotency-Key')}));
}
const allowed=new Set(['assert_stripe_billing_mode','stripe_checkout_preflight','close_expired_stripe_checkout_intent','register_stripe_checkout_intent','acquire_stripe_reconciliation','release_stripe_reconciliation','apply_stripe_canonical_membership_snapshot','apply_stripe_canonical_membership_reversal','stripe_member_status_with_schedule','claim_stripe_member_daily_grant_with_schedule','spend_game_tickets']);
const rpc=(name,args)=>({abortSignal:async()=>{
  must(allowed.has(name)&&Object.keys(args).every(k=>/^p_[a-z_]+$/.test(k)),'RPC_GUARD');const fields=Object.keys(args);
  try{const data=(await service.query(`select public.${name}(${fields.map((k,i)=>k+' => $'+(i+1)).join(',')}) as result`,fields.map(k=>args[k]))).rows[0].result;return {data,error:null};}
  catch(e){report.lastSqlFailure={name,code:e.code};await save();return {data:null,error:{code:e.code}};}
}});
const client={rpc};
const blocked=async target=>(await admin.query("select exists(select 1 from public.account_deletion_jobs where user_id=$1 and phase<>'completed') or exists(select 1 from public.account_restrictions where user_id=$1 and blocked) as blocked",[target])).rows[0].blocked;
const store=createStripeMembershipStore(client,async()=>null,blocked);
let base;
async function request(route,method='GET',authorized=true){const response=await fetch(base+route,{method,headers:{...(authorized?{Authorization:'Bearer '+token}:{}),...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:'{}'}:{})});return {status:response.status,body:await response.json()};}
async function forward(raw,signature){const response=await fetch(base+'/membership/stripe/webhook',{method:'POST',headers:{'Content-Type':'application/json','Stripe-Signature':signature},body:raw});return response.status;}
async function handleEvent(raw,signature){
  const event=verifyStripeWebhook(raw,{'stripe-signature':signature},secret);must(event.livemode===false,'LIVE_WEBHOOK_GUARD');
  const sub=api.eventSubscriptionId(event);if(!sub)return 202;
  const canonical=await apiCall('get','/v1/subscriptions/'+sub);
  if(canonical.metadata?.qgambit_user_id!==user)return 202;
  const record={id:event.id,type:event.type,receivedAt:new Date().toISOString(),payloadHash:event.payloadHash,signatureVerified:true,apiVersion:version,attempts:[]};
  report.events.push(record);subscriptionId=sub;customerId=id(canonical.customer);
  report.resources.subscriptionId=sub;report.resources.customerId=customerId;
  for(let attempt=0;attempt<3;attempt++){
    const status=await forward(raw,signature);record.attempts.push(status);await save();
    if(status===200){
      const receipt=(await admin.query('select event_id,payload_hash from public.stripe_webhook_receipts where event_id=$1',[event.id])).rows[0];
      record.receiptHashMatches=receipt?.payload_hash===event.payloadHash;
      // Keep the signature/body only in memory for the application's duplicate check.
      if(record.receiptHashMatches)lastSigned={raw,signature,event};
      await save();return status;
    }
    if(status!==503)return status;await delay(1500);
  }return 503;
}
async function wallet(){return (await admin.query('select ranked_tickets,hint_tickets,member_ranked_tickets,member_hint_tickets,test_member_ranked_tickets,test_member_hint_tickets,test_member_ticket_subscription_id from public.ticket_wallets where user_id=$1',[user])).rows[0];}
async function verifyPurchase(){
  const checkout=await apiCall('get','/v1/checkout/sessions/'+checkoutId);
  must(checkout.client_reference_id===user&&checkout.livemode===false&&checkout.status==='complete'&&checkout.payment_status==='paid'&&checkout.amount_total===299&&checkout.currency==='usd','CHECKOUT_PAYMENT_PROOF_FAILED');
  must(id(checkout.subscription)===subscriptionId&&id(checkout.customer)===customerId,'CHECKOUT_BINDING_FAILED');
  await mark('real_browser_checkout_paid',{checkoutId,subscriptionId,amountTotal:299,currency:'usd'});
  const state=await request('/membership/stripe/status');must(state.status===200&&state.body.active,'MEMBERSHIP_NOT_ACTIVE');await mark('authenticated_status_active',{result:state});
  const first=await request('/membership/stripe/daily-grant','POST');
  must(first.status===200&&first.body.claimed&&first.body.credited.ranked===3&&first.body.credited.hint===3,'DAILY_GRANT_FAILED');
  const second=await request('/membership/stripe/daily-grant','POST');must(second.status===200&&!second.body.claimed&&second.body.credited.ranked===0&&second.body.credited.hint===0,'DAILY_GRANT_DEDUPE_FAILED');
  await mark('same_day_daily_three_plus_three_once',{first:first.body,repeat:second.body,wallet:await wallet()});
  await queue;must(lastSigned,'SIGNED_RECEIPT_MISSING');
  const before=await wallet();const replay=await forward(lastSigned.raw,lastSigned.signature);must(replay===200,'SIGNED_REPLAY_FAILED');assert.deepEqual(await wallet(),before);
  const tampered=Buffer.concat([lastSigned.raw,Buffer.from(' ')]);must(await forward(tampered,lastSigned.signature)===400,'TAMPERED_SIGNATURE_ACCEPTED');
  await mark('signed_replay_idempotent_and_tampered_body_rejected',{eventId:lastSigned.event.id,replayStatus:replay,tamperedStatus:400});
  const spend=createTicketSpendStore(client,true);
  // Fixture starts with no free tickets and its three daily quota receipts exhausted.
  // Probe real consumer eligibility; do not fabricate a game/hint delivery or live entitlement.
  const ranked=await spend.spendRankedAtMatchStart(randomUUID(),[user]);
  const hint=await spend.spendCpuHintAfterDelivery(randomUUID(),user);
  must(ranked.insufficient&&hint.insufficient,'SANDBOX_CONSUMPTION_POLICY_CHANGED');assert.deepEqual(await wallet(),before);
  await mark('test_paid_tickets_rejected_by_current_live_only_consumer',{ranked,hint,wallet:await wallet(),consumptionCompleted:false});
  report.phase='purchase_projection_grant_verified_consumption_blocked';report.purchaseProjectionGrantVerified=true;report.completed=false;await save();
}
async function prepare(){
  cluster=await mkdtemp(path.join(root,'scratch/stripe-postgres/checkout-'));
  const probe=http.createServer();const port=await listen(probe);await new Promise(r=>probe.close(r));
  command(initdb,['-D',cluster,'--username=fixtureadmin','--auth=trust','--encoding=UTF8','--locale=C']);
  command(pg_ctl,['-D',cluster,'-l',path.join(cluster,'server.log'),'-o','-h 127.0.0.1 -p '+port,'-w','start']);pgRunning=true;
  admin=new Client({host:'127.0.0.1',port,user:'fixtureadmin',database:'postgres'});await admin.connect();await setupStripeFixture({exec:sql=>admin.query(sql)});
  service=new Client({host:'127.0.0.1',port,user:'fixtureadmin',database:'postgres'});await service.connect();await service.query('set role service_role');
  const password=randomBytes(32).toString('hex'),digest=createHash('sha256').update(password).digest();
  await admin.query('insert into public.profiles(id) values($1)',[user]);await admin.query("insert into public.account_terms_consents values($1,'2026-09-25.1')",[user]);
  await admin.query('insert into public.ticket_wallets(user_id) values($1)',[user]);
  for(let i=0;i<3;i++)await admin.query("insert into public.ticket_spend_receipts(event_kind,event_id,user_id,pool) values('ranked_match_start',$1,$2,'quota')",[randomUUID(),user]);
  const auth=new RankedAuth(async(target,value)=>target===user&&timingSafeEqual(createHash('sha256').update(value).digest(),digest));
  token=(await auth.issueLegacySession(user,password))?.token;must(token,'LOCAL_AUTH_FIXTURE_FAILED');
  report.database={engine:'native PostgreSQL 18',host:'127.0.0.1',port,cluster};
  await mark('isolated_database_and_auth_fixture_ready',{migrationCount:stripeMigrations.length});
  if(process.argv.includes('--prepare-only')){report.phase='prepare_verified';await save();return false;}
  report.identity=await identity();must((await apiCall('get','/v1/account')).id===account,'SANDBOX_ACCOUNT_GUARD');
  const metadata={qa_run:run,qa_owner:'codex_t4',qa_disposable:'true'};
  product=await apiCall('post','/v1/products',{name:'Q-Gambit disposable sandbox membership',metadata},{idempotencyKey:run+'_product'});report.resources.productId=product.id;await save();
  price=await apiCall('post','/v1/prices',{product:product.id,currency:'usd',unit_amount:299,recurring:{interval:'month'},tax_behavior:'inclusive',metadata},{idempotencyKey:run+'_price'});report.resources.priceId=price.id;await save();
  const app=express();app.disable('x-powered-by');let hooks,members;
  app.get('/qa/status',(_req,res)=>res.setHeader('Cache-Control','no-store').json(report));
  app.get('/qa/checkout',(_req,res)=>report.checkoutUrl?res.redirect(303,report.checkoutUrl):res.status(503).send('Checkout is not ready'));
  app.use((req,res,next)=>hooks?hooks(req,res,next):next());app.use((req,res,next)=>members?members(req,res,next):next());
  appServer=http.createServer(app);base='http://127.0.0.1:'+await listen(appServer);report.localStatusUrl=base+'/qa/status';report.localPurchaseUrl=base+'/qa/checkout';
  proxy=http.createServer(async(req,res)=>{try{
    if(req.method!=='POST'||req.url!=='/stripe'){res.writeHead(404).end();return;}
    let length=0;const chunks=[];for await(const chunk of req){length+=chunk.length;if(length>65536){res.writeHead(413).end();return;}chunks.push(chunk);}
    if(!secret||!api){res.writeHead(503).end();return;}
    const raw=Buffer.concat(chunks),signature=req.headers['stripe-signature'];
    const work=queue.then(()=>handleEvent(raw,signature));queue=work.catch(()=>{});
    res.writeHead(await work).end();
  }catch(e){report.lastWebhookError=safeError(e);await save();res.writeHead(400).end();}});
  const forwardPort=await listen(proxy);
  listener=spawn(cli,['listen','--latest','--skip-update','--events','checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed','--forward-to','http://127.0.0.1:'+forwardPort+'/stripe'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  const capture=chunk=>{const match=/whsec_[A-Za-z0-9_-]+/.exec(chunk.toString());if(match)secret=match[0];};listener.stdout.on('data',capture);listener.stderr.on('data',capture);
  for(let i=0;i<30&&!secret;i++)await delay(1000);must(secret,'CLI_LISTENER_NOT_READY');
  api=new StripeMembershipApi({mode:'test',secretKey:'sk_test_CLISEAM000000',webhookSecret:secret,priceId:price.id,successUrl:'https://q-gambit.com/',cancelUrl:'https://q-gambit.com/',automaticTaxEnabled:false},sdkFetch);
  hooks=createStripeWebhookRouter(api,store,secret,()=>true);members=createStripeMembershipRouter(auth,api,store,new AccountWriteGate(),()=>true);
  must((await request('/membership/stripe/checkout','POST',false)).status===401,'UNAUTHENTICATED_CHECKOUT_ACCEPTED');
  const result=await request('/membership/stripe/checkout','POST');must(result.status===200&&result.body.url?.startsWith('https://checkout.stripe.com/'),'APPLICATION_CHECKOUT_FAILED');
  const intent=(await admin.query('select checkout_id,price_id,livemode from public.stripe_checkout_intents where user_id=$1',[user])).rows[0];must(intent&&intent.price_id===price.id&&intent.livemode===false,'CHECKOUT_INTENT_MISSING');
  checkoutId=intent.checkout_id;report.resources.checkoutId=checkoutId;report.checkoutUrl=result.body.url;report.phase='awaiting_browser_purchase';
  await mark('authenticated_application_checkout_ready',{checkoutId,purchaseUrl:report.localPurchaseUrl,statusUrl:report.localStatusUrl});return true;
}
async function cleanup(){
  if(stopping)return;stopping=true;await queue;
  // Narrow ownership: only this run's exact checkout/profile and tagged product/price.
  try{
    if(checkoutId){const c=await apiCall('get','/v1/checkout/sessions/'+checkoutId);must(c.livemode===false&&c.client_reference_id===user,'CLEANUP_CHECKOUT_OWNERSHIP');
      if(c.status==='open'){await apiCall('post','/v1/checkout/sessions/'+checkoutId+'/expire');report.cleanup.push('own checkout expired');}
      if(id(c.subscription)){const s=await apiCall('get','/v1/subscriptions/'+id(c.subscription));must(s.livemode===false&&s.metadata?.qgambit_user_id===user,'CLEANUP_SUBSCRIPTION_OWNERSHIP');if(s.status!=='canceled')await apiCall('delete','/v1/subscriptions/'+s.id,{prorate:false,invoice_now:false});report.cleanup.push('own sandbox subscription canceled');}}
    if(price){const p=await apiCall('get','/v1/prices/'+price.id);must(p.livemode===false&&p.metadata?.qa_run===run,'CLEANUP_PRICE_OWNERSHIP');await apiCall('post','/v1/prices/'+price.id,{active:false});report.cleanup.push('own price archived');}
    if(product){const p=await apiCall('get','/v1/products/'+product.id);must(p.livemode===false&&p.metadata?.qa_run===run,'CLEANUP_PRODUCT_OWNERSHIP');await apiCall('post','/v1/products/'+product.id,{active:false});report.cleanup.push('own product archived');}
  }catch(e){report.cleanupError=safeError(e);}
  await queue;if(listener)listener.kill();if(proxy)await new Promise(r=>proxy.close(r));if(appServer)await new Promise(r=>appServer.close(r));
  await service?.end();await admin?.end();if(pgRunning)command(pg_ctl,['-D',cluster,'-w','stop','-m','immediate']);
  report.stoppedAt=new Date().toISOString();report.cleanup.push('local PostgreSQL and HTTP listeners stopped');await save();
}
try{
  const serve=await prepare();
  if(serve){let verified=false;const deadline=Date.now()+45*60*1000;
    while(Date.now()<deadline){
      try{await access(control);break;}catch{}
      if(!verified){const active=(await admin.query("select subscription_id from public.stripe_memberships where user_id=$1 and status='active'",[user])).rows[0];
        if(active){await queue;await verifyPurchase();verified=true;}}
      await delay(2000);
    }
  }
}catch(e){report.phase='failed';report.error=safeError(e);await save();console.error(JSON.stringify(report.error));process.exitCode=1;}
finally{await cleanup();}
