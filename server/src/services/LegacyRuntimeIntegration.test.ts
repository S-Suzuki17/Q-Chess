import http from 'node:http';
import { AuthApiError } from '@supabase/supabase-js';
import { io, type Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const h=vi.hoisted(()=>({io:null as any,mm:null as any,auth:null as any,sessions:new Map<string,any>(),verify:vi.fn(),outage:false,
    live:null as any, getUser:vi.fn(),rpc:vi.fn(),oauth:null as any,blocked:vi.fn(),issue:vi.fn(),record:vi.fn(),settle:vi.fn(),
    entitlementRead:vi.fn(async()=>{throw Error('Pending entitlement schema unavailable');})}));
vi.mock('./RankedSessionRuntime',()=>({createRankedSessionAuthority:()=>h.auth}));
vi.mock('socket.io',async original=>{const actual=await original<any>();return{...actual,Server:class extends actual.Server{constructor(...args:any[]){super(...args);h.io=this;}}};});
vi.mock('../matchmaking/MatchmakingService',async original=>{const actual=await original<any>();return{...actual,MatchmakingService:class extends actual.MatchmakingService{constructor(...args:any[]){super(...args);h.mm=this;}}};});
vi.mock('./LegacySocketAuthority',async original=>{const actual=await original<any>();return{...actual,LegacySocketAuthority:class extends actual.LegacySocketAuthority{constructor(...args:any[]){super(...args);h.live=this;}}};});
vi.mock('./SupabaseService',async original=>{const actual=await original<any>();h.oauth=new actual.SupabaseService({auth:{getUser:h.getUser},rpc:h.rpc});return{SupabaseService:class{
    constructor(){return new Proxy(this,{get:(_target,key)=>({
        verifyUser:(token:string)=>h.oauth.verifyUser(token),rankedReady:async()=>true,getMatchRating:async()=>1000,sharedMatchEntitlement:h.entitlementRead,
        recordUnratedMatch:h.record,settleRankedMatch:h.settle,recordSecurityEvent:async()=>{},restrictedAccounts:async()=>[],
        accountDeletionStore:()=>({blocked:h.blocked,verifyUser:(token:string)=>h.oauth.verifyUser(token)}),accountSecurityStore:()=>({restricted:async()=>false,verifyUser:(token:string)=>h.oauth.verifyUser(token)}),
        accountProfileStore:()=>({verifyUser:(token:string)=>h.oauth.verifyUser(token),blocked:h.blocked,profile:async(id:string)=>({id}),friends:async()=>[]}),
        serviceStatusLoader:()=>async()=>({maintenance:false,minimumAndroidBuild:0,minimumProtocol:0,announcement:{},revision:''}),
    } as any)[key]??(()=>({}))});}
}};});
vi.mock('./PlayRewardVerifier',()=>({createPlayRewardVerifier:()=>()=>{throw Error('Provider traffic forbidden');}}));
const clients:Socket[]=[],timers:ReturnType<typeof setTimeout>[]=[];let server:http.Server,endpoint='';
function event(socket:Socket,name:string,accept:(value:any)=>boolean=()=>true,timeout=4000){return new Promise<any>((resolve,reject)=>{const timer=setTimeout(()=>{socket.off(name,handler);reject(Error('Timed out: '+name));},timeout);const handler=(value:any)=>{if(!accept(value))return;clearTimeout(timer);socket.off(name,handler);resolve(value);};socket.on(name,handler);});}
async function until(check:()=>boolean){const end=performance.now()+4000;while(!check()){if(performance.now()>=end)throw Error('State not reached');await new Promise(resolve=>setTimeout(resolve,10));}}
async function connect(id:string,token='ranked_'+Buffer.from(id.padEnd(32,'x')).toString('base64url').slice(0,43)){
    if(!id.startsWith('GUEST-'))h.sessions.set(token,{userId:id,expiresAt:Date.now()+60000,serverNow:Date.now(),fence:{incarnation:'8f030a96-5736-4b29-a6f8-ed588775f738',generation:'0'}});
    else token=id;
    const client=io(endpoint,{auth:{token},transports:['websocket'],reconnection:false,autoConnect:false});clients.push(client);
    const ready=event(client,'connect');client.connect();await ready;return{client,token};
}
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
function request(path:string,token:string,method='GET',body?:unknown){return new Promise<{status:number;body:any}>((resolve,reject)=>{
    const req=http.request(endpoint+path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'}},res=>{
        let data='';res.setEncoding('utf8');res.on('data',part=>data+=part);res.on('end',()=>{try{resolve({status:res.statusCode!,body:data?JSON.parse(data):null});}catch(error){reject(error);}});
    });req.on('error',reject);req.setTimeout(7000,()=>req.destroy(Error('HTTP fixture timeout')));req.end(body===undefined?undefined:JSON.stringify(body));
});}
function rawClient(token:string,userId?:string){const client=io(endpoint,{auth:{token,userId},transports:['websocket'],reconnection:false,autoConnect:false});clients.push(client);return client;}
async function game(label:string,mode='private'){
    const left=await connect(label+'-left'),right=await connect(label+'-right');let matchId=label+'-room';
    if(mode!=='private'){
        const joined=event(left.client,'queue_joined');left.client.emit('join_queue',{mode,timeControl:600});await joined;
        const found=event(left.client,'match_found');right.client.emit('join_queue',{mode,timeControl:600});matchId=(await found).matchId;
    }
    left.client.emit('connect_match',{matchId});await until(()=>h.mm.getMatch(matchId)?.connected.host===true);
    const start=event(left.client,'match_start');right.client.emit('connect_match',{matchId});const state=await start;
    return{left,right,matchId,state,match:h.mm.getMatch(matchId)};
}
beforeAll(async()=>{
    h.verify.mockImplementation(async(token:string,expected?:string)=>{if(h.outage)throw Error('unavailable');const proof=h.sessions.get(token);return proof&&proof.expiresAt>Date.now()&&(!expected||expected===proof.userId)?proof:null;});
    h.auth={verifySession:h.verify,issueLegacySession:h.issue,revokeSession:async(token:string)=>h.sessions.delete(token),revokeUserSessions:async()=>0,
        inspectLiveSessions:async(bindings:any[])=>{if(h.outage)throw Error('private-provider-error');return bindings.map(b=>h.sessions.get(b.token)?.expiresAt>Date.now()?'valid':'expired');}};
    const listen=http.Server.prototype.listen;vi.spyOn(http.Server.prototype,'listen').mockImplementation(function(this:http.Server,...args:any[]){server=this;return listen.call(this,0,'127.0.0.1',args.at(-1));} as any);
    const interval=globalThis.setInterval,timeout=globalThis.setTimeout;
    vi.spyOn(globalThis,'setInterval').mockImplementation(((...args:any[])=>{const timer=interval(...args as Parameters<typeof setInterval>);timers.push(timer);return timer;}) as typeof setInterval);
    vi.spyOn(globalThis,'setTimeout').mockImplementation(((...args:any[])=>{const timer=timeout(...args as Parameters<typeof setTimeout>);timers.push(timer);return timer;}) as typeof setTimeout);
    vi.spyOn(console,'log').mockImplementation(()=>{});vi.stubGlobal('fetch',()=>{throw Error('Provider traffic forbidden');});
    await import('../index');if(!server.listening)await new Promise<void>(resolve=>server.once('listening',resolve));endpoint='http://127.0.0.1:'+(server.address() as any).port;
});
beforeEach(()=>{
    h.verify.mockReset().mockImplementation(async(token:string,expected?:string)=>{if(h.outage)throw Error('unavailable');const proof=h.sessions.get(token);return proof&&proof.expiresAt>Date.now()&&(!expected||expected===proof.userId)?proof:null;});
    h.getUser.mockReset().mockResolvedValue({data:{user:null},error:new AuthApiError('denied',401,'bad_jwt')});
    h.rpc.mockReset().mockResolvedValue({data:true,error:null});h.blocked.mockReset().mockResolvedValue(false);
    h.issue.mockReset().mockResolvedValue(null);h.record.mockReset().mockResolvedValue(undefined);h.settle.mockReset().mockResolvedValue(null);
});
afterEach(()=>{h.outage=false;for(const match of h.mm.getMatches())if(match.state!=='FINISHED')h.mm.finishMatch(match,'CANCELLED');for(const client of clients)client.disconnect();vi.unstubAllEnvs();});
afterAll(async()=>{h.outage=false;for(const client of clients)client.disconnect();if(h.io)await new Promise<void>(resolve=>h.io.close(resolve));server?.closeAllConnections();for(const timer of timers){clearTimeout(timer);clearInterval(timer);}vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('actual server admission entrypoints on loopback sockets',()=>{
    const oauthToken=`a.${Buffer.from(JSON.stringify({sub:'OAuth-verified',session_id:'00000000-0000-4000-8000-000000000001'})).toString('base64url')}.c`;
    it.each(['429','503','transport','rpc','malformed'])('classifies %s through real SupabaseService, mounted HTTP and Socket.IO',async failure=>{
        h.getUser.mockResolvedValue({data:{user:{id:'OAuth-verified'}},error:null});
        if(failure==='429'||failure==='503')h.getUser.mockResolvedValue({data:{user:null},error:new AuthApiError('secret-upstream-detail',Number(failure),'unexpected_failure')});
        if(failure==='transport')h.getUser.mockRejectedValue(Error('secret-upstream-detail'));
        if(failure==='rpc')h.rpc.mockResolvedValue({data:null,error:{message:'secret-upstream-detail'}});
        if(failure==='malformed')h.getUser.mockResolvedValue({data:{user:null},error:null});
        expect(await request('/account/friends',oauthToken)).toEqual({status:503,body:{code:'UNAVAILABLE'}});
        const client=rawClient(oauthToken),denied=event(client,'connect_error');client.connect();
        const error=await denied;expect(error.data).toEqual({code:'AUTH_UNAVAILABLE'});expect(error.message).not.toContain('secret-upstream-detail');
        h.getUser.mockResolvedValue({data:{user:{id:'OAuth-verified'}},error:null});h.rpc.mockResolvedValue({data:true,error:null});
        expect(await request('/account/friends',oauthToken)).toEqual({status:200,body:{userId:'OAuth-verified',friends:[]}});
        const ready=event(client,'connect');client.connect();await ready;expect(client.connected).toBe(true);
    });
    it.each(['bad_jwt','session_not_found','session_expired','user_banned','revoked','deleted'])('keeps positive %s denials distinct at HTTP and socket boundaries',async reason=>{
        h.getUser.mockResolvedValue({data:{user:{id:'OAuth-verified'}},error:null});
        if(['bad_jwt','session_not_found','session_expired','user_banned'].includes(reason))h.getUser.mockResolvedValue({data:{user:null},error:new AuthApiError('private-detail',401,reason)});
        if(reason==='revoked')h.rpc.mockResolvedValue({data:false,error:null});
        if(reason==='deleted')h.blocked.mockResolvedValue(true);
        const response=await request('/account/friends',oauthToken);
        expect(response).toEqual(reason==='deleted'?{status:423,body:{code:'ACCOUNT_DELETING'}}:{status:401,body:{code:'AUTH_REQUIRED'}});
        const client=rawClient(oauthToken),denied=event(client,'connect_error');client.connect();expect((await denied).data).toEqual({code:'AUTH_REQUIRED'});
    });
    it('returns retryable HTTP legacy login/status errors without leaking upstream details',async()=>{
        const {token}=await connect('Http-status');h.outage=true;
        expect(await request('/auth/ranked-session/status',token)).toEqual({status:503,body:{code:'UNAVAILABLE'}});
        h.outage=false;expect((await request('/auth/ranked-session/status',token)).status).toBe(200);
        h.sessions.delete(token);expect(await request('/auth/ranked-session/status',token)).toEqual({status:401,body:{code:'AUTH_REQUIRED'}});
        h.issue.mockRejectedValueOnce(Error('private-password'));
        expect(await request('/auth/ranked-session','','POST',{username:'Http-login',password:'synthetic-password'})).toEqual({status:503,body:{code:'UNAVAILABLE'}});
    });
    it.each(['random','ranked','private'])('cancels disconnected %s games on known infrastructure failure without history or Elo',async mode=>{
        const f=await game('Infra-'+mode,mode),cancelled=event(f.right.client,'match_cancelled');h.outage=true;f.left.client.disconnect();
        expect(await cancelled).toMatchObject({matchId:f.matchId,reason:'authentication_unavailable'});
        expect(f.match.state).toBe('CANCELLED');expect(f.match.engine.getPublicState('Infra-'+mode+'-left').gameOver).toBeNull();
        expect(h.record).not.toHaveBeenCalled();expect(h.settle).not.toHaveBeenCalled();
    });
    it('cancels a correct-proof reconnection failing at real elapsed 29 seconds',async()=>{
        const f=await game('Late-outage'),noticed=event(f.right.client,'opponent_disconnected');f.left.client.disconnect();const absence=await noticed;
        expect(absence.gracePeriodSeconds).toBe(30);await delay(29000);
        const cancelled=event(f.right.client,'match_cancelled');h.outage=true;
        const returning=rawClient(f.left.token),denied=event(returning,'connect_error');returning.connect();
        expect((await denied).data).toEqual({code:'AUTH_UNAVAILABLE'});expect((await cancelled).reason).toBe('authentication_unavailable');
        expect(f.match.state).toBe('CANCELLED');expect(h.record).not.toHaveBeenCalled();expect(h.settle).not.toHaveBeenCalled();
    },40000);
    it('cannot void another game using only a forged handshake userId during an unrelated outage',async()=>{
        const f=await game('No-spoof'),noticed=event(f.right.client,'opponent_disconnected');f.left.client.disconnect();await noticed;
        h.getUser.mockRejectedValue(Error('unrelated-provider-outage'));
        const attacker=rawClient(oauthToken,'No-spoof-left'),denied=event(attacker,'connect_error');attacker.connect();
        expect((await denied).data).toEqual({code:'AUTH_UNAVAILABLE'});expect(f.match.state).toBe('IN_GAME');
        expect(h.mm.awaitingReconnect('No-spoof-left',f.matchId)).toBe(true);
    });
    it('wires live poll outage to queue rejection while preserving two connected players',async()=>{
        const f=await game('Poll-playing'),queued=await connect('Poll-queued'),joined=event(queued.client,'queue_joined');
        queued.client.emit('join_queue',{mode:'random',timeControl:600});await joined;
        const denied=event(queued.client,'queue_error');h.outage=true;await h.live.poll();
        expect((await denied).code).toBe('AUTH_UNAVAILABLE');expect(h.mm.getPlayerSession('Poll-queued').state).toBe('IDLE');
        expect(f.match.state).toBe('IN_GAME');expect(f.left.client.connected&&f.right.client.connected).toBe(true);
    });
    it.each(['unavailable','healthy'])('defers clock decisions during pending disconnect health, then honors %s result',async outcome=>{
        const f=await game('Pending-'+outcome);let release!:(value:any)=>void,reject!:(error:Error)=>void;
        h.verify.mockImplementationOnce(()=>new Promise((yes,no)=>{release=yes;reject=no;}));
        const noticed=event(f.right.client,'opponent_disconnected');f.left.client.disconnect();await noticed;
        f.match.engine.state.clock.white=1;f.match.engine.state.startsAt=0;f.match.engine.state.clock.lastMoveAt=Date.now();
        await delay(350);expect(f.match.engine.getPublicState('Pending-'+outcome+'-left').gameOver).toBeNull();
        if(outcome==='unavailable'){
            const cancelled=event(f.right.client,'match_cancelled');reject(Error('provider stopped'));await cancelled;
            expect(f.match.state).toBe('CANCELLED');expect(h.record).not.toHaveBeenCalled();
        }else{
            const ended=event(f.right.client,'sync_state',s=>!!s.gameOver);release(h.sessions.get(f.left.token));
            expect((await ended).gameOverReason).toBe('timeout');await until(()=>h.record.mock.calls.length===1);
        }
    });
    it('does not resurrect an unknown queue UUID into a private game after restart',async()=>{
        const {client}=await connect('Unknown-after-restart'),matchId='b1c2d3e4-1234-4000-8000-abcdef123456';
        for(const name of ['connect_match','request_sync']){
            const cancelled=event(client,'match_cancelled');client.emit(name,{matchId});expect(await cancelled).toEqual({matchId,reason:'match_not_found'});
            expect(h.mm.getMatch(matchId)).toBeUndefined();
        }
    });
    it('voids both connected players after actual server event-loop suspension before deciding a clock loss',async()=>{
        const f=await game('Server-suspension'),cancelled=event(f.right.client,'match_cancelled',()=>true,9000);
        f.match.engine.state.clock.white=1000;f.match.engine.state.startsAt=0;f.match.engine.state.clock.lastMoveAt=Date.now();
        // Sleep only this isolated test/server process, without burning CPU.
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,5200);
        expect((await cancelled).reason).toBe('server_unavailable');expect(f.match.state).toBe('CANCELLED');
        expect(f.match.engine.getPublicState('Server-suspension-left').gameOver).toBeNull();
        expect(h.record).not.toHaveBeenCalled();expect(h.settle).not.toHaveBeenCalled();
    },12000);
    it('settles an ordinary disconnect once after real 30 seconds despite a handshake and snapshot',async()=>{
        const f=await game('Ordinary-absence'),noticed=event(f.right.client,'opponent_disconnected');f.left.client.disconnect();const absence=await noticed;
        const restored=await connect('Ordinary-absence-left',f.left.token),synced=event(restored.client,'sync_state');
        restored.client.emit('request_sync',{matchId:f.matchId});await synced;
        expect(h.mm.awaitingReconnect('Ordinary-absence-left',f.matchId)).toBe(true);
        await delay(Math.max(0,absence.deadline-Date.now()-1500));
        expect(f.match.state).toBe('IN_GAME');
        const ended=event(f.right.client,'sync_state',s=>!!s.gameOver);expect((await ended).gameOverReason).toBe('abandonment');
        expect(Date.now()).toBeGreaterThanOrEqual(absence.deadline);await until(()=>h.record.mock.calls.length===1);
        restored.client.disconnect();await delay(50);expect(h.record).toHaveBeenCalledOnce();expect(h.settle).not.toHaveBeenCalled();
    },40000);
    it('explicit logout revokes the proof and disconnects the owned socket without treating it as infrastructure failure',async()=>{
        const f=await game('Logout'),revoked=event(f.left.client,'session_revoked'),noticed=event(f.right.client,'opponent_disconnected');
        expect((await request('/auth/ranked-session/revoke',f.left.token,'POST')).status).toBe(204);
        expect(await revoked).toEqual({reason:'revoked'});expect((await noticed).gracePeriodSeconds).toBe(30);
        expect(f.match.state).toBe('IN_GAME');expect(h.sessions.has(f.left.token)).toBe(false);
        const stale=rawClient(f.left.token),denied=event(stale,'connect_error');stale.connect();expect((await denied).data).toEqual({code:'AUTH_REQUIRED'});
        h.verify.mockRejectedValueOnce(Error('later outage'));
        const retryDenied=event(stale,'connect_error');stale.connect();expect((await retryDenied).data).toEqual({code:'AUTH_UNAVAILABLE'});
        expect(f.match.state).toBe('IN_GAME');
    });
    it.each(['false','TRUE'])('does not query entitlement schema without exact true environment request: %s',async value=>{
        vi.stubEnv('SHARED_MATCH_ENTITLEMENT_ENABLED',value);
        const id='Entitlement-gate-'+value,{client}=await connect(id);
        for(let request=0;request<2;request++){
            const reply=event(client,'shared_entitlement');client.emit('request_shared_entitlement',{});
            expect(await reply).toEqual({userId:id,entitlement:null,sharedAdmissionEnabled:false});
        }
        expect(h.entitlementRead).not.toHaveBeenCalled();client.disconnect();
    });
    it('does not advertise shared rules when the enabled entitlement authority is unavailable',async()=>{
        vi.stubEnv('SHARED_MATCH_ENTITLEMENT_ENABLED','true');
        const id='Entitlement-authority-unavailable',{client}=await connect(id);
        const reply=event(client,'shared_entitlement');client.emit('request_shared_entitlement',{});
        expect(await reply).toEqual({userId:id,entitlement:null,sharedAdmissionEnabled:null});
        expect(h.entitlementRead).toHaveBeenCalledWith(id);client.disconnect();
    });
    it('mounts the Crown endpoint with its independent release gate closed',async()=>{
        const {client,token}=await connect('Crown-route-mount');
        const reply=await new Promise<{status:number;body:any}>((resolve,reject)=>{
            const request=http.request(endpoint+'/crown/first-attempt',{method:'POST',headers:{
                'content-type':'application/json',authorization:'Bearer '+token,
            }},response=>{
                let body='';response.setEncoding('utf8');response.on('data',chunk=>body+=chunk);
                response.on('end',()=>{try{resolve({status:response.statusCode!,body:JSON.parse(body)});}catch(error){reject(error);}});
            });
            request.on('error',reject);request.setTimeout(4000,()=>request.destroy(Error('Crown mount timeout')));
            request.end(JSON.stringify({stageId:1}));
        });
        expect(reply).toEqual({status:503,body:{code:'FEATURE_DISABLED'}});client.disconnect();
    });

    it.each(['random','ranked','private'])('rejects expired registered proof for new %s admission',async mode=>{
        const {client,token}=await connect('Expired-'+mode);h.sessions.get(token).expiresAt=Date.now()-1;
        const denied=event(client,'queue_error');client.emit(mode==='private'?'connect_match':'join_queue',mode==='private'?{matchId:'room-'+mode}:{mode,timeControl:600});
        expect((await denied).code).toBe('AUTH_REQUIRED');expect(h.mm.getPlayerSession('Expired-'+mode).state).toBe('IDLE');client.disconnect();
    });
    it('preserves guest random/private access while rejecting ranked',async()=>{
        const {client}=await connect('GUEST-admission');let result=event(client,'queue_error');client.emit('join_queue',{mode:'ranked',timeControl:600});expect((await result).code).toBe('AUTH_REQUIRED');
        result=event(client,'queue_joined');client.emit('join_queue',{mode:'random',timeControl:600});await result;expect(h.mm.getPlayerSession('GUEST-admission').state).toBe('WAITING');
        client.emit('cancel_queue');client.emit('connect_match',{matchId:'guest-private-room'});await until(()=>h.mm.getMatch('guest-private-room')?.connected.host===true);expect(h.mm.getMatch('guest-private-room').players.host).toBe('GUEST-admission');client.disconnect();
    });
    it('fails new admission closed on outage while an existing game remains playable after expiry',async()=>{
        const left=await connect('Playing-left'),right=await connect('Playing-right');const matchId='active-preserved-room';
        left.client.emit('connect_match',{matchId});await until(()=>h.mm.getMatch(matchId)?.connected.host===true);
        const start=event(left.client,'match_start');right.client.emit('connect_match',{matchId});const state=await start;
        h.sessions.get(left.token).expiresAt=Date.now()-1;h.outage=true;
        expect(h.mm.getMatch(matchId).state).toBe('IN_GAME');expect(left.client.connected).toBe(true);
        const end=event(right.client,'sync_state',state=>!!state.gameOver);left.client.emit('player_action',{actionId:'preserved-resignation',version:state.version,action:{type:'RESIGN',payload:{}}});
        expect((await end).gameOverReason).toBe('resignation');
        h.outage=false;left.client.disconnect();right.client.disconnect();
    });
    it('rejects an outage for every registered new admission',async()=>{
        const {client}=await connect('Outage-new');h.outage=true;
        const denied=event(client,'queue_error');client.emit('join_queue',{mode:'random',timeControl:600});expect((await denied).code).toBe('AUTH_UNAVAILABLE');
        h.outage=false;client.disconnect();
    });
    it('requires renewed authentication and actual rejoin, never a handshake or snapshot, to clear an absence', async()=>{
        const left=await connect('Resume-left'),right=await connect('Resume-right'),matchId='resume-auth-room';
        left.client.emit('connect_match',{matchId});await until(()=>h.mm.getMatch(matchId)?.connected.host===true);
        const start=event(left.client,'match_start');right.client.emit('connect_match',{matchId});const state=await start;
        const noticed=event(right.client,'opponent_disconnected');left.client.disconnect();const absence=await noticed;
        expect(absence.gracePeriodSeconds).toBe(30);
        const restored=await connect('Resume-left',left.token);
        let resumes=0;right.client.on('opponent_reconnected',()=>resumes++);
        const synced=event(restored.client,'sync_state');restored.client.emit('request_sync',{matchId});await synced;
        expect(h.mm.awaitingReconnect('Resume-left',matchId)).toBe(true);expect(resumes).toBe(0);
        const replayed=event(right.client,'opponent_disconnected');right.client.emit('request_sync',{matchId});
        expect((await replayed).deadline).toBe(absence.deadline);
        h.sessions.get(left.token).expiresAt=Date.now()-1;
        const denied=event(restored.client,'queue_error');restored.client.emit('connect_match',{matchId});
        expect((await denied).code).toBe('AUTH_REQUIRED');expect(resumes).toBe(0);
        const blocked=event(restored.client,'action_error');
        restored.client.emit('player_action',{actionId:'before-reauth',version:state.version,action:{type:'RESIGN',payload:{}}});
        expect((await blocked).code).toBe('RECONNECT_REQUIRED');expect(h.mm.awaitingReconnect('Resume-left',matchId)).toBe(true);
        h.sessions.get(left.token).expiresAt=Date.now()+60000;
        const resumed=event(right.client,'opponent_reconnected');restored.client.emit('connect_match',{matchId});await resumed;
        expect(h.mm.awaitingReconnect('Resume-left',matchId)).toBe(false);expect(resumes).toBe(1);
        const ended=event(right.client,'sync_state',s=>!!s.gameOver);
        restored.client.emit('player_action',{actionId:'after-reauth',version:state.version,action:{type:'RESIGN',payload:{}}});
        expect((await ended).gameOverReason).toBe('resignation');restored.client.disconnect();right.client.disconnect();
    });
    it.each(['valid','unavailable'])('keeps replacement distinct from revocation and ignores delayed old %s queue work',async outcome=>{
        const old=await connect('Replacing-user');let release!:(proof:any)=>void,reject!:(error:Error)=>void,entered!:()=>void;const checking=new Promise<void>(resolve=>entered=resolve);
        h.verify.mockImplementationOnce(()=>{entered();return new Promise((yes,no)=>{release=yes;reject=no;});});
        old.client.emit('join_queue',{mode:'random',timeControl:600});await checking;
        const replaced=event(old.client,'session_replaced');const current=await connect('Replacing-user',old.token);await replaced;
        if(outcome==='valid')release(h.sessions.get(old.token));else reject(Error('delayed old outage'));
        await new Promise(resolve=>setImmediate(resolve));
        expect(h.mm.getPlayerSession('Replacing-user').socketId).toBe(current.client.id);expect(h.mm.getPlayerSession('Replacing-user').state).toBe('IDLE');expect(h.sessions.has(old.token)).toBe(true);current.client.disconnect();
    });
});
