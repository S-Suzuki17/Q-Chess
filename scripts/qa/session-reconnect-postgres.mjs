import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { account, PASSWORD, scalar, connectSession } from './session-postgres-support.mjs';
import { nativeSessionRpc } from './session-runtime-rpc.mjs';
const require=createRequire(import.meta.url);
const {MatchmakingService}=require('../../server/dist/matchmaking/MatchmakingService.js');
const {RankedAdmissionCoordinator}=require('../../server/dist/services/RankedAdmissionCoordinator.js');
const {createRankedAdmissionStore}=require('../../server/dist/services/RankedAdmissionStore.js');
const {DurableRankedAuth}=require('../../server/dist/services/DurableRankedAuth.js');
const allowed=new Set(['ranked_admission_protocol_version','renew_ranked_server_lease','admit_ranked_match',
    'void_ranked_admission','recover_expired_ranked_admissions','get_ranked_admission','ranked_account_busy']);
// Parameterized native bridge; actual compiled store and raw repository SQL.
function clientRpc(client,after=()=>{}){return{rpc(name,parameters){
    assert.ok(allowed.has(name));const keys=Object.keys(parameters);assert.ok(keys.every(k=>/^p_[a-z_]+$/.test(k)));
    return{async abortSignal(signal){
        assert.equal(signal.aborted,false);
        const data=await scalar(client,`select public.${name}(${keys.map((k,i)=>k+' => $'+(i+1)).join(',')}) as result`,keys.map(k=>parameters[k]));
        await after(name,data);return{data,error:null};
    }};
}};}
const inertIo=()=>({emit(){},to(){return{emit(){}};},sockets:{sockets:new Map()}});
function matchmaking(io){
    // Housekeeping intervals must not keep this disposable test process alive.
    const interval=globalThis.setInterval;
    globalThis.setInterval=(...args)=>interval(...args).unref();
    try{return new MatchmakingService(io,true);}finally{globalThis.setInterval=interval;}
}
async function until(predicate){const end=performance.now()+4000;while(!await predicate()){assert.ok(performance.now()<end,'Native reconnect state deadline');await delay(10);}}
export const RECONNECT_CHECKS=3;
export async function runReconnectPostgresChecks({check,admin,a,b,open}){
    async function fixture(after){
        const users=[await account(admin,'Rejoin'+randomUUID()),await account(admin,'Rejoin'+randomUUID())];
        for(const user of users){
            await a.query("select public.accept_current_account_terms($1,'2026-10-07.1')",[user]);
            // The legacy ranked-ticket RPC still requires its original consent.
            await a.query("insert into public.account_terms_consents(user_id,version) values($1,'2026-09-25.1')",[user]);
            await admin.query('insert into public.ticket_wallets(user_id,ranked_tickets) values($1,4)',[user]);
            for(let i=0;i<3;i++)await admin.query("insert into public.ticket_spend_receipts(event_kind,event_id,user_id,pool) values('ranked_match_start',$1,$2,'quota')",[randomUUID(),user]);
        }
        const io=inertIo(),mm=matchmaking(io),store=createRankedAdmissionStore(clientRpc(a,after),()=>true),notices=[];
        const coordinator=new RankedAdmissionCoordinator(mm,store,()=>{},value=>notices.push(value));
        for(const user of users)mm.registerSocket(user,user);
        mm.joinQueue(users[0],600,undefined,'ranked',1000);const match=mm.joinQueue(users[1],600,undefined,'ranked',1000).match;
        for(const user of users)mm.connectMatch(user,match.matchId);
        await coordinator.begin(match);assert.equal(match.state,'IN_GAME',JSON.stringify(notices));
        for(const user of users)assert.equal(await scalar(admin,'select ranked_tickets::integer as result from public.ticket_wallets where user_id=$1',[user]),3);
        return{users,mm,match,store,coordinator,notices};
    }
    async function refunded(f){
        assert.equal(await scalar(admin,'select state as result from public.ranked_match_admissions where match_id=$1',[f.match.matchId]),'voided');
        assert.equal(await scalar(admin,'select count(*)::integer as result from public.ranked_ticket_refunds where source_match_id=$1 and spent_by is null',[f.match.matchId]),2);
        assert.equal(await scalar(admin,'select count(*)::integer as result from public.ranked_match_settlements where match_id=$1',[f.match.matchId]),0);
        assert.equal(await scalar(admin,'select count(*)::integer as result from public.game_records where id=$1',[f.match.matchId]),0);
        for(const user of f.users)assert.equal(await scalar(admin,'select rating_10m as result from public.profiles where id=$1',[user]),1000);
    }
    await check('reconnect: actual auth backend loss cancels the compiled paid match and refunds once even with a full wallet',async()=>{
        const f=await fixture(),authConnection=await open('service_role'),auth=new DurableRankedAuth(nativeSessionRpc(authConnection));
        const proof=await auth.issueLegacySession(f.users[0],PASSWORD);assert.ok(proof);
        await admin.query('update public.ticket_wallets set ranked_tickets=20 where user_id=any($1)',[f.users]);
        await admin.query('select pg_terminate_backend($1)',[authConnection.fixturePid]);
        await until(()=>!!authConnection.fixtureDisconnect);
        f.mm.removeSocket(f.users[0],()=>auth.verifySession(proof.token,f.users[0]));
        await until(()=>f.match.state==='CANCELLED');await refunded(f);
        assert.equal(f.match.engine.getPublicState(f.users[0]).gameOver,null);
        await f.store.void(f.match.matchId,f.coordinator.ownerId,'duplicate');await refunded(f);
        for(const user of f.users)assert.equal(await scalar(admin,'select ranked_tickets::integer as result from public.ticket_wallets where user_id=$1',[user]),20);
        assert.ok(await new DurableRankedAuth(nativeSessionRpc(b)).verifySession(proof.token,f.users[0]));
    });
    await check('reconnect: committed cancellation with lost acknowledgement freezes play and replays exactly one refund',async()=>{
        let lose=true;const f=await fixture(name=>{if(name==='void_ranked_admission'&&lose){lose=false;throw Error('Synthetic lost acknowledgement');}});
        f.mm.authenticationUnavailable(f.users[0]);assert.equal(f.match.state,'IN_GAME','Connected games survive authority outage');
        f.mm.removeSocket(f.users[0],async()=>{throw Error('Synthetic auth outage');});
        await until(async()=>await scalar(admin,'select state as result from public.ranked_match_admissions where match_id=$1',[f.match.matchId])==='voided');
        assert.equal(f.match.state,'VOIDING');assert.equal(f.match.engine.forfeit(f.users[0]),false);await refunded(f);
        await delay(1050);await f.coordinator.cancel(f.match,'authentication_unavailable');assert.equal(f.match.state,'CANCELLED');await refunded(f);
    });
    await check('reconnect: a fresh process recovers an expired owner and replays durable refunds without rebuilding the game',async()=>{
        const f=await fixture();
        // Deterministic DB lease-expiry injection, not a claim of waiting 20 seconds.
        await admin.query("update public.ranked_server_leases set expires_at=clock_timestamp()-interval '1 second' where owner_id=$1",[f.coordinator.ownerId]);
        const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'recover',f.match.matchId,f.users[0]],{env:process.env,stdio:['ignore','pipe','pipe'],windowsHide:true});
        let output='',errors='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>errors+=chunk);
        const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
        assert.equal(code,0,errors);assert.deepEqual(JSON.parse(output),{state:'voided',busy:false,matches:0});await refunded(f);
        assert.equal(await f.coordinator.renew(),false);assert.equal(f.match.engine.forfeit(f.users[0]),false);
        await until(()=>f.match.state==='CANCELLED');await refunded(f);
    });
}
if(process.argv[2]==='recover'){
    const client=await connectSession('service_role');
    try{
        const mm=matchmaking(inertIo()),store=createRankedAdmissionStore(clientRpc(client),()=>true);
        const coordinator=new RankedAdmissionCoordinator(mm,store,()=>{},()=>{});
        const busy=await coordinator.accountBusy(process.argv[4]);
        const result=await coordinator.reconnect(process.argv[3],process.argv[4]);
        process.stdout.write(JSON.stringify({state:result?.state,busy,matches:mm.getMatches().length}));
    }finally{await client.end();}
}
