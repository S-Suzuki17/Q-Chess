// QA ONLY. Install separately named, explicit-test RPCs in the disposable DB.
// Public release functions and live Stripe identities are never rewritten.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile,writeFile,realpath,statfs} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const devRoot=fileURLToPath(new URL('../../',import.meta.url));
const task=path.resolve(devRoot,'../..');
const release=path.join(task,'work/e2e-root-e77e298');
const evidence=JSON.parse(await readFile(path.join(task,'outputs/stripe-checkout-e2e-current.json'),'utf8'));
const report={run:evidence.run,sourceCommit:evidence.sourceCommit,billingMode:'test',completed:false,
  scope:'Real purchase projection and grant, followed by actual ranked admission Store and CPU Practice Service/search using QA-only explicit-test SQL variants in an isolated native PostgreSQL DB. Production SQL, live identities, hosted transport and gameplay UI are not altered or claimed verified.',
  checks:[],sourceFunctions:{}};
const output=path.join(task,'outputs/stripe-sandbox-consumption-'+evidence.run+'.json');
const save=()=>writeFile(output,JSON.stringify(report,null,2)+'\n');
const mark=async(name,data={})=>{report.checks.push({name,...data});await save();console.log(JSON.stringify({name,...data}));};
const digest=value=>createHash('sha256').update(value).digest('hex');
const require=createRequire(path.join(release,'server/package.json'));
const pgRequire=createRequire(path.join(devRoot,'scratch/stripe-postgres/package.json'));
const {Client,Pool}=pgRequire('pg');
const {createRankedAdmissionStore}=require('./dist/services/RankedAdmissionStore');
const {CpuPracticeService,hashPracticeState}=require('./dist/services/CpuPracticeService');
const {applyPracticeMove}=require('./dist/quantum-engine/practice');
const must=(condition,reason)=>{if(!condition)throw new Error(reason);};
async function requireDiskHeadroom(){const usage=await statfs(task);must(usage.bavail*usage.bsize>=300*1024*1024,'DISK_HEADROOM_REQUIRED');}
await requireDiskHeadroom();
must(evidence.sourceCommit==='e77e2980c24d593b2e742a43e291aa2117e2305a'&&evidence.livemode===false
  &&evidence.purchaseProjectionGrantVerified&&evidence.events.length>=1&&evidence.events.every(e=>e.signatureVerified&&e.receiptHashMatches),'PURCHASE_EVIDENCE_REQUIRED');
must(evidence.database.host==='127.0.0.1'&&Number.isInteger(evidence.database.port),'LOOPBACK_REQUIRED');
const cluster=await realpath(evidence.database.cluster),allowedRoot=await realpath(path.join(release,'scratch/stripe-postgres'));
must(cluster.startsWith(allowedRoot+path.sep),'OWN_CLUSTER_REQUIRED');
const database=evidence.database.name??'postgres';
must(database==='postgres'||/^qa_[a-z]{8}$/.test(database),'DATABASE_NAME_GUARD');
const connection={host:'127.0.0.1',port:evidence.database.port,user:'fixtureadmin',database};
const admin=new Client(connection),pool=new Pool({...connection,max:4});
const functions={spend_game_tickets:'text,uuid,text[]',admit_ranked_match:'uuid,text,text,integer,uuid,text,integer,integer',buy_cpu_hint:'uuid,text,uuid,integer,text,jsonb,jsonb'};
const publicAllowed=new Set(['ranked_admission_protocol_version','renew_ranked_server_lease','get_ranked_admission','ranked_account_busy',
  'cpu_practice_open','cpu_practice_read','cpu_practice_close','read_cpu_hint_receipt','cpu_practice_existing_hint']);
let definitions;
async function functionDefinitions(){const result={};for(const [name,signature]of Object.entries(functions)){
  result[name]=(await admin.query('select pg_get_functiondef($1::regprocedure) as definition',['public.'+name+'('+signature+')'])).rows[0].definition;
}return result;}
async function wallet(){return (await admin.query('select ranked_tickets,hint_tickets,member_ranked_tickets,member_hint_tickets,test_member_ranked_tickets,test_member_hint_tickets,test_member_ticket_subscription_id from public.ticket_wallets where user_id=$1',[evidence.user])).rows[0];}
const modeFunctions=new Set(Object.keys(functions));
function modeClient(mode){return {rpc:(name,args)=>({abortSignal:async()=>{
  await requireDiskHeadroom();
  must(mode==='test','EXPLICIT_TEST_MODE_REQUIRED');must(modeFunctions.has(name)||publicAllowed.has(name),'SANDBOX_RPC_DENIED');
  const parameters=modeFunctions.has(name)?{p_billing_mode:mode,...args}:args;
  const fields=Object.keys(parameters);must(fields.every(k=>/^p_[a-z_]+$/.test(k)),'PARAMETER_GUARD');
  const client=await pool.connect();
  try{await client.query('set role service_role');const data=(await client.query(`select ${modeFunctions.has(name)?'qg_sandbox':'public'}.${name}(${fields.map((k,i)=>k+' => $'+(i+1)).join(',')}) as result`,fields.map(k=>parameters[k]))).rows[0].result;return {data,error:null};}
  catch(error){return {data:null,error:{code:error.code,message:/^[A-Z_]+$/.test(error.message)?error.message:'SANDBOX_RPC_FAILED'}};}
  finally{client.release();}
}})};}
function testDefinition(name,sql){
  // Derive from the installed release function, preserving transaction/receipt logic.
  // Only the new schema/signature, explicit mode guard, entitlement mode/price,
  // test wallet columns and the nested test-spend call may differ.
  const publicHash=digest(sql);sql=sql.replaceAll('\r\n','\n');
  const original='CREATE OR REPLACE FUNCTION public.'+name+'(';
  must(sql.startsWith(original)&&sql.includes('\nbegin\n'),'UNEXPECTED_RELEASE_FUNCTION');
  let result=sql.replace(original,'CREATE FUNCTION qg_sandbox.'+name+'(p_billing_mode text, ')
    .replace('\nbegin\n','\nbegin\n    perform qg_sandbox.assert_test_mode(p_billing_mode);\n');
  const expectedModeCount=name==='spend_game_tickets'?2:name==='admit_ranked_match'?1:0;
  must((result.match(/and i\.livemode\b/g)??[]).length===expectedModeCount,'MODE_TRANSFORM_GUARD');
  must((result.match(/'price_1ULM9fQWzwYDIuXWgs5Uj3yt'/g)??[]).length===expectedModeCount,'PRICE_TRANSFORM_GUARD');
  result=result.replace(/and i\.livemode\b/g,'and not i.livemode')
    .replaceAll("'price_1ULM9fQWzwYDIuXWgs5Uj3yt'",'(select price_id from qg_sandbox.fixture_identity where singleton)')
    .replace(/\bmember_ticket_subscription_id\b/g,'test_member_ticket_subscription_id')
    .replace(/\bmember_ranked_tickets\b/g,'test_member_ranked_tickets')
    .replace(/\bmember_hint_tickets\b/g,'test_member_hint_tickets');
  if(name==='buy_cpu_hint'){
    must(result.includes("public.spend_game_tickets('cpu_hint_delivered'"),'NESTED_SPEND_GUARD');
    result=result.replace("public.spend_game_tickets('cpu_hint_delivered'","qg_sandbox.spend_game_tickets(p_billing_mode,'cpu_hint_delivered'");
  }
  must(!result.includes('CREATE OR REPLACE')&&!/\bmember_(?:ranked|hint)_tickets\b/.test(result),'PUBLIC_WRITE_GUARD');
  report.sourceFunctions[name]={publicSha256:publicHash,sandboxSha256:digest(result)};return result;
}
async function denied(work,expected='42501'){try{await work();throw new Error('EXPECTED_DENIAL');}catch(e){assert.equal(e.code,expected);}}
async function transactional(work){await admin.query('begin');try{await work();}finally{await admin.query('rollback');}}
try{
  await admin.connect();
  const settings=(await admin.query("select current_setting('data_directory') as directory,current_setting('listen_addresses') as interfaces,current_user as role")).rows[0];
  must((await realpath(settings.directory))===cluster&&settings.interfaces==='127.0.0.1'&&settings.role==='fixtureadmin','NATIVE_CLUSTER_IDENTITY_GUARD');
  const identity=(await admin.query('select i.checkout_id,i.price_id,i.livemode,m.subscription_id,m.user_id,m.status from public.stripe_checkout_intents i join public.stripe_memberships m using(checkout_id) where m.user_id=$1',[evidence.user])).rows;
  must(identity.length===1&&identity[0].livemode===false&&identity[0].checkout_id===evidence.resources.checkoutId
    &&identity[0].subscription_id===evidence.resources.subscriptionId&&identity[0].status==='active','REAL_PROJECTION_GUARD');
  for(const event of evidence.events){const r=(await admin.query('select payload_hash from public.stripe_webhook_receipts where event_id=$1 and user_id=$2',[event.id,evidence.user])).rows[0];must(r?.payload_hash===event.payloadHash,'SIGNED_RECEIPT_GUARD');}
  definitions=await functionDefinitions();
  const generated=Object.fromEntries(Object.entries(definitions).map(([name,sql])=>[name,testDefinition(name,sql)]));
  // Installation is intentionally outside supabase/migrations and not used by server/index.
  await admin.query('begin');
  await admin.query(`create schema qg_sandbox;
    revoke all on schema qg_sandbox from public,anon,authenticated;
    grant usage on schema qg_sandbox to service_role;
    create table qg_sandbox.fixture_identity(singleton boolean primary key default true check(singleton),
      billing_mode text not null check(billing_mode='test'),run_id text not null,user_id text not null,
      subscription_id text not null,checkout_id text not null check(checkout_id like 'cs_test_%'),price_id text not null);
    alter table qg_sandbox.fixture_identity enable row level security;
    revoke all on qg_sandbox.fixture_identity from public,anon,authenticated,service_role;
    grant select on qg_sandbox.fixture_identity to service_role;`);
  await admin.query("insert into qg_sandbox.fixture_identity values(true,'test',$1,$2,$3,$4,$5)",[evidence.run,evidence.user,evidence.resources.subscriptionId,evidence.resources.checkoutId,evidence.resources.priceId]);
  await admin.query(`create function qg_sandbox.assert_test_mode(p_billing_mode text) returns void
    language plpgsql security invoker set search_path='' as $$
    begin
      if current_user<>'service_role' or p_billing_mode is distinct from 'test'
        or not exists(select 1 from qg_sandbox.fixture_identity where singleton and billing_mode=p_billing_mode)
        or exists(select 1 from public.stripe_billing_mode_pin)
        or exists(select 1 from public.stripe_checkout_intents where livemode)
        or (select count(*) from public.profiles)<>1
        or not exists(select 1 from public.profiles p join qg_sandbox.fixture_identity f on f.user_id=p.id)
      then raise exception 'ISOLATED_TEST_DATABASE_REQUIRED' using errcode='42501'; end if;
      if not exists(select 1 from public.stripe_checkout_intents i join qg_sandbox.fixture_identity f
        on i.checkout_id=f.checkout_id and i.user_id=f.user_id and i.price_id=f.price_id where not i.livemode)
      then raise exception 'TEST_CHECKOUT_BINDING_REQUIRED' using errcode='42501'; end if;
    end $$;`);
  for(const sql of Object.values(generated))await admin.query(sql);
  await admin.query('revoke all on all functions in schema qg_sandbox from public,anon,authenticated,service_role; grant execute on all functions in schema qg_sandbox to service_role');
  await admin.query('commit');
  const before=await wallet();assert.equal(before.test_member_ranked_tickets,3);assert.equal(before.test_member_hint_tickets,3);
  await mark('installed_explicit_test_rpcs_in_verified_disposable_cluster',{checkoutId:evidence.resources.checkoutId,subscriptionId:evidence.resources.subscriptionId,wallet:before});
  for(const mode of ['live',null])await transactional(async()=>{await admin.query('set local role service_role');await denied(()=>admin.query('select qg_sandbox.spend_game_tickets($1,$2,$3,$4)',[mode,'cpu_hint_delivered',randomUUID(),[evidence.user]]));});
  await transactional(async()=>{await admin.query('set local role anon');await denied(()=>admin.query("select qg_sandbox.assert_test_mode('test')"));});
  await transactional(async()=>{await admin.query('insert into public.stripe_billing_mode_pin values(true)');await admin.query('set local role service_role');await denied(()=>admin.query("select qg_sandbox.assert_test_mode('test')"));});
  assert.deepEqual(await wallet(),before);
  await mark('live_null_mode_anonymous_and_live_pinned_database_rejected',{walletUnchanged:true});
  for(const patch of ["status='paused'","refund_blocked_until=period_end","period_end=clock_timestamp()-interval '1 second'"]){
    await transactional(async()=>{await admin.query('update public.stripe_memberships set '+patch+' where user_id=$1',[evidence.user]);await admin.query('set local role service_role');
      const result=(await admin.query("select qg_sandbox.spend_game_tickets('test','cpu_hint_delivered',$1,$2) as result",[randomUUID(),[evidence.user]])).rows[0].result;assert.equal(result.insufficient,true);
    });
  }
  assert.deepEqual(await wallet(),before);await mark('paused_refunded_expired_test_entitlements_denied_in_rolled_back_fault_probes');
  const client=modeClient('test'),ranked=createRankedAdmissionStore(client,()=>true),owner=randomUUID(),matchId=randomUUID();
  assert.equal(await ranked.renew(owner),true);
  const match={matchId,players:{host:evidence.user,joiner:'ai:'+matchId},timeControl:180,cpu:{id:'ai:'+matchId,profile:{rating:1000,level:3}}};
  const admits=await Promise.all([ranked.admit(match,owner),ranked.admit(match,owner)]);
  assert.equal(admits.filter(a=>a.success&&!a.duplicate).length,1);assert.equal(admits.filter(a=>a.duplicate).length,1);
  const allocation=(await admin.query('select pool,subscription_id from public.ranked_match_allocations where match_id=$1 and user_id=$2',[matchId,evidence.user])).rows[0];
  assert.equal(allocation.pool,'paid');assert.equal(allocation.subscription_id,evidence.resources.subscriptionId);
  assert.equal((await wallet()).test_member_ranked_tickets,2);
  await mark('actual_ranked_admission_store_test_rpc_consumes_once_under_concurrency',{matchId,admissions:admits,allocation,billingMode:'test',wallet:await wallet()});
  const practice=new CpuPracticeService(client,true);let sessionId=randomUUID(),requestId=randomUUID();
  let session=await practice.open(evidence.user,sessionId,'white',3,180);assert.equal(session.revision,0);
  report.hintSearchPosition='initial_superposition';
  let hint;
  try{hint=await practice.requestHint(requestId,evidence.user,sessionId,0);}
  catch(error){
    assert.equal(error.message,'SEARCH_TIMEOUT');assert.equal((await wallet()).test_member_hint_tickets,3);
    assert.equal(await practice.receipt(evidence.user,sessionId,0,requestId),null);
    await mark('opening_worker_timeout_preserves_ticket_and_creates_no_receipt');
    await practice.close(evidence.user,sessionId);
    sessionId=randomUUID();requestId=randomUUID();session=await practice.open(evidence.user,sessionId,'white',3,180);
    // Same explicit server-only concrete-position fixture as T2's existing QA.
    // This changes only a dummy board, never billing identities or entitlement.
    const backRank=[8,2,4,16,32,4,2,8];
    const state={...session.state,pieces:session.state.pieces.map(piece=>({...piece,state:[1,6].includes(piece.origin.row)?1:backRank[piece.origin.col]}))};
    report.hintSearchPosition='server_only_concrete_position_fixture';
    await admin.query('update public.cpu_practice_sessions set state=$1,state_hash=$2 where session_id=$3',[state,hashPracticeState(state),sessionId]);
    session=await practice.read(evidence.user,sessionId);
    await mark('server_only_concrete_position_fixture_for_successful_search',{sessionId,stateHash:session.stateHash,origin:'existing T2 test-cpu-hint-sql fixture'});
    hint=await practice.requestHint(requestId,evidence.user,sessionId,0);
  }
  // The actual search worker generates a move; applying it proves it is legal.
  const next=applyPracticeMove(session.state,hint.move);assert.equal(next.ply,1);
  const retry=await practice.requestHint(requestId,evidence.user,sessionId,0);assert.deepEqual(retry,hint);
  const alias=await practice.requestHint(randomUUID(),evidence.user,sessionId,0);assert.equal(alias.receiptId,hint.receiptId);
  const receipt=(await admin.query('select request_id,pool,subscription_id from public.cpu_hint_receipts where request_id=$1',[hint.receiptId])).rows[0];
  assert.equal(receipt.subscription_id,evidence.resources.subscriptionId);assert.equal(receipt.pool,'paid');
  const after=await wallet();assert.equal(after.test_member_ranked_tickets,2);assert.equal(after.test_member_hint_tickets,2);
  for(const key of ['ranked_tickets','hint_tickets','member_ranked_tickets','member_hint_tickets'])assert.equal(after[key],0);
  await mark('actual_cpu_practice_service_search_legal_hint_durable_receipt_and_retry',{sessionId,receipt,billingMode:'test',hint:hint.hint,move:hint.move,wallet:after});
  // Preserve the actual purchase's clear 3+3 -> 2+2 evidence.
  const unchanged=await functionDefinitions();for(const name of Object.keys(definitions))assert.equal(unchanged[name],definitions[name]);
  assert.equal((await admin.query('select count(*)::integer as n from public.stripe_checkout_intents where livemode')).rows[0].n,0);
  await mark('production_functions_and_stripe_modes_unchanged',{publicFunctionHashesUnchanged:true,liveCheckoutIntents:0});
  await practice.close(evidence.user,sessionId);
  report.completed=true;report.completedAt=new Date().toISOString();report.finalWallet=after;
  report.limits=['QA-only SQL mode variants are not installed in production','Ranked Store/DB admission verified; browser gameplay, socket gateway, ranked settlement/recovery/refunds and hosted Supabase transport are outside this run','CPU Practice Service/search and durable hint receipt verified; browser hint delivery not exercised','If the opening search times out, successful hint search uses the explicitly recorded server-only concrete-position fixture; opening hint performance is not claimed to pass'];
  await save();
}catch(error){report.error={reason:/^[A-Z_]+$/.test(error.message??'')?error.message:'CONSUMPTION_CHECK_FAILED',code:error.code??null};await save();console.error(JSON.stringify(report.error));process.exitCode=1;}
finally{await pool.end();await admin.end();}
