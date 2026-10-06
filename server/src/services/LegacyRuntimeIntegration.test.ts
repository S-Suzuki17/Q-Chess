import http from 'node:http';
import { io, type Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
const h=vi.hoisted(()=>({io:null as any,mm:null as any,auth:null as any,sessions:new Map<string,any>(),verify:vi.fn(),outage:false}));
vi.mock('./RankedSessionRuntime',()=>({createRankedSessionAuthority:()=>h.auth}));
vi.mock('socket.io',async original=>{const actual=await original<any>();return{...actual,Server:class extends actual.Server{constructor(...args:any[]){super(...args);h.io=this;}}};});
vi.mock('../matchmaking/MatchmakingService',async original=>{const actual=await original<any>();return{...actual,MatchmakingService:class extends actual.MatchmakingService{constructor(...args:any[]){super(...args);h.mm=this;}}};});
vi.mock('./SupabaseService',()=>({SupabaseService:class{
    constructor(){return new Proxy(this,{get:(_target,key)=>({
        verifyUser:async()=>null,rankedReady:async()=>true,getMatchRating:async()=>1000,
        recordUnratedMatch:async()=>{},settleRankedMatch:async()=>null,recordSecurityEvent:async()=>{},restrictedAccounts:async()=>[],
        accountDeletionStore:()=>({blocked:async()=>false}),accountSecurityStore:()=>({restricted:async()=>false}),
        serviceStatusLoader:()=>async()=>({maintenance:false,minimumAndroidBuild:0,minimumProtocol:0,announcement:{},revision:''}),
    } as any)[key]??(()=>({}))});}
}}));
vi.mock('./PlayRewardVerifier',()=>({createPlayRewardVerifier:()=>()=>{throw Error('Provider traffic forbidden');}}));
const clients:Socket[]=[],timers:ReturnType<typeof setTimeout>[]=[];let server:http.Server,endpoint='';
function event(socket:Socket,name:string,accept:(value:any)=>boolean=()=>true){return new Promise<any>((resolve,reject)=>{const timer=setTimeout(()=>{socket.off(name,handler);reject(Error('Timed out: '+name));},4000);const handler=(value:any)=>{if(!accept(value))return;clearTimeout(timer);socket.off(name,handler);resolve(value);};socket.on(name,handler);});}
async function until(check:()=>boolean){const end=performance.now()+4000;while(!check()){if(performance.now()>=end)throw Error('State not reached');await new Promise(resolve=>setTimeout(resolve,10));}}
async function connect(id:string,token='ranked_'+Buffer.from(id.padEnd(32,'x')).toString('base64url').slice(0,43)){
    if(!id.startsWith('GUEST-'))h.sessions.set(token,{userId:id,expiresAt:Date.now()+60000,serverNow:Date.now(),fence:{incarnation:'8f030a96-5736-4b29-a6f8-ed588775f738',generation:'0'}});
    else token=id;
    const client=io(endpoint,{auth:{token},transports:['websocket'],reconnection:false,autoConnect:false});clients.push(client);
    const ready=event(client,'connect');client.connect();await ready;return{client,token};
}
beforeAll(async()=>{
    h.verify.mockImplementation(async(token:string,expected?:string)=>{if(h.outage)throw Error('unavailable');const proof=h.sessions.get(token);return proof&&proof.expiresAt>Date.now()&&(!expected||expected===proof.userId)?proof:null;});
    h.auth={verifySession:h.verify,issueLegacySession:async()=>null,revokeSession:async(token:string)=>h.sessions.delete(token),revokeUserSessions:async()=>0};
    const listen=http.Server.prototype.listen;vi.spyOn(http.Server.prototype,'listen').mockImplementation(function(this:http.Server,...args:any[]){server=this;return listen.call(this,0,'127.0.0.1',args.at(-1));} as any);
    const interval=globalThis.setInterval,timeout=globalThis.setTimeout;
    vi.spyOn(globalThis,'setInterval').mockImplementation(((...args:any[])=>{const timer=interval(...args as Parameters<typeof setInterval>);timers.push(timer);return timer;}) as typeof setInterval);
    vi.spyOn(globalThis,'setTimeout').mockImplementation(((...args:any[])=>{const timer=timeout(...args as Parameters<typeof setTimeout>);timers.push(timer);return timer;}) as typeof setTimeout);
    vi.spyOn(console,'log').mockImplementation(()=>{});vi.stubGlobal('fetch',()=>{throw Error('Provider traffic forbidden');});
    await import('../index');if(!server.listening)await new Promise<void>(resolve=>server.once('listening',resolve));endpoint='http://127.0.0.1:'+(server.address() as any).port;
});
afterEach(()=>{h.outage=false;});
afterAll(async()=>{h.outage=false;for(const client of clients)client.disconnect();if(h.io)await new Promise<void>(resolve=>h.io.close(resolve));server?.closeAllConnections();for(const timer of timers){clearTimeout(timer);clearInterval(timer);}vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('actual server admission entrypoints on loopback sockets',()=>{
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
    it('keeps socket replacement distinct from token revocation and drops delayed old queue work',async()=>{
        const old=await connect('Replacing-user');let release!:(proof:any)=>void,entered!:()=>void;const checking=new Promise<void>(resolve=>entered=resolve);
        h.verify.mockImplementationOnce(()=>{entered();return new Promise(resolve=>release=resolve);});
        old.client.emit('join_queue',{mode:'random',timeControl:600});await checking;
        const replaced=event(old.client,'session_replaced');const current=await connect('Replacing-user',old.token);await replaced;
        release(h.sessions.get(old.token));await new Promise(resolve=>setImmediate(resolve));
        expect(h.mm.getPlayerSession('Replacing-user').socketId).toBe(current.client.id);expect(h.mm.getPlayerSession('Replacing-user').state).toBe('IDLE');expect(h.sessions.has(old.token)).toBe(true);current.client.disconnect();
    });
});
