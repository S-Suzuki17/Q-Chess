import http from 'node:http';
import { AuthApiError } from '@supabase/supabase-js';
import { io, type Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const h=vi.hoisted(()=>({io:null as any,mm:null as any,auth:null as any,sessions:new Map<string,any>(),verify:vi.fn(),outage:false,
    live:null as any, getUser:vi.fn(),rpc:vi.fn(),oauth:null as any,blocked:vi.fn(),issue:vi.fn(),record:vi.fn(),settle:vi.fn(),
    rating:vi.fn(async()=>1000), entitlementRead:vi.fn(async()=>{throw Error('Pending entitlement schema unavailable');})}));
vi.mock('./RankedSessionRuntime',()=>({createRankedSessionAuthority:()=>h.auth}));
vi.mock('socket.io',async original=>{const actual=await original<any>();return{...actual,Server:class extends actual.Server{constructor(...args:any[]){super(...args);h.io=this;}}};});
vi.mock('../matchmaking/MatchmakingService',async original=>{const actual=await original<any>();return{...actual,MatchmakingService:class extends actual.MatchmakingService{constructor(...args:any[]){super(...args);h.mm=this;}}};});
vi.mock('./LegacySocketAuthority',async original=>{const actual=await original<any>();return{...actual,LegacySocketAuthority:class extends actual.LegacySocketAuthority{constructor(...args:any[]){super(...args);h.live=this;}}};});
vi.mock('./SupabaseService',async original=>{const actual=await original<any>();h.oauth=new actual.SupabaseService({auth:{getUser:h.getUser},rpc:h.rpc});return{SupabaseService:class{
    constructor(){return new Proxy(this,{get:(_target,key)=>({
        verifyUser:(token:string)=>h.oauth.verifyUser(token),rankedReady:async()=>true,getMatchRating:h.rating,sharedMatchEntitlement:h.entitlementRead,
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
    const ready=new Promise<void>((resolve,reject)=>{
        const timer=setTimeout(()=>reject(Error('Loopback connect timed out')),4000);
        client.once('connect',()=>{clearTimeout(timer);resolve();});
        client.once('connect_error',error=>{clearTimeout(timer);reject(Error('Loopback connect: '+error.message+' / '+String((error as any).data?.code??(error as any).description?.error?.code??(error as any).description?.code??'unknown')));});
    });client.connect();await ready;return{client,token};
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
    left.client.emit('connect_match',{matchId,...(mode==='private'?{privateRoom:{intent:'create',timeControl:600}}:{})});await until(()=>h.mm.getMatch(matchId)?.connected.host===true);
    const start=event(left.client,'match_start');right.client.emit('connect_match',{matchId,...(mode==='private'?{privateRoom:{intent:'join'}}:{})});const state=await start;
    return{left,right,matchId,state,match:h.mm.getMatch(matchId)};
}
beforeAll(async()=>{
    vi.stubEnv('RANKED_TICKET_ADMISSION_ENABLED','false');vi.stubEnv('SHARED_MATCH_ADMISSION_ENABLED','false');
    h.verify.mockImplementation(async(token:string,expected?:string)=>{if(h.outage)throw Error('unavailable');const proof=h.sessions.get(token);return proof&&proof.expiresAt>Date.now()&&(!expected||expected===proof.userId)?proof:null;});
    h.auth={verifySession:h.verify,issueLegacySession:h.issue,revokeSession:async(token:string)=>h.sessions.delete(token),revokeUserSessions:async()=>0,
        inspectLiveSessions:async(bindings:any[])=>{if(h.outage)throw Error('private-provider-error');return bindings.map(b=>h.sessions.get(b.token)?.expiresAt>Date.now()?'valid':'expired');}};
    const listen=http.Server.prototype.listen;vi.spyOn(http.Server.prototype,'listen').mockImplementation(function(this:http.Server,...args:any[]){return listen.call(this,0,'127.0.0.1',args.at(-1));} as any);
    const interval=globalThis.setInterval,timeout=globalThis.setTimeout;
    vi.spyOn(globalThis,'setInterval').mockImplementation(((...args:any[])=>{const timer=interval(...args as Parameters<typeof setInterval>);timers.push(timer);return timer;}) as typeof setInterval);
    vi.spyOn(globalThis,'setTimeout').mockImplementation(((...args:any[])=>{const timer=timeout(...args as Parameters<typeof setTimeout>);timers.push(timer);return timer;}) as typeof setTimeout);
    vi.spyOn(console,'log').mockImplementation(()=>{});vi.stubGlobal('fetch',()=>{throw Error('Provider traffic forbidden');});
    await import('../index');server=h.io.httpServer;if(!server.listening)await new Promise<void>(resolve=>server.once('listening',resolve));endpoint='http://127.0.0.1:'+(server.address() as any).port;
});
beforeEach(()=>{
    h.rating.mockReset().mockResolvedValue(1000);
    h.verify.mockReset().mockImplementation(async(token:string,expected?:string)=>{if(h.outage)throw Error('unavailable');const proof=h.sessions.get(token);return proof&&proof.expiresAt>Date.now()&&(!expected||expected===proof.userId)?proof:null;});
    h.getUser.mockReset().mockResolvedValue({data:{user:null},error:new AuthApiError('denied',401,'bad_jwt')});
    h.rpc.mockReset().mockResolvedValue({data:true,error:null});h.blocked.mockReset().mockResolvedValue(false);
    h.issue.mockReset().mockResolvedValue(null);h.record.mockReset().mockResolvedValue(undefined);h.settle.mockReset().mockResolvedValue(null);
});
afterEach(()=>{h.outage=false;for(const match of h.mm.getMatches())if(match.state!=='FINISHED')h.mm.finishMatch(match,'CANCELLED');for(const client of clients)client.disconnect();vi.unstubAllEnvs();});
afterAll(async()=>{h.outage=false;for(const client of clients)client.disconnect();if(h.io)await new Promise<void>(resolve=>h.io.close(resolve));server?.closeAllConnections();for(const timer of timers){clearTimeout(timer);clearInterval(timer);}vi.restoreAllMocks();vi.unstubAllGlobals();});

describe('private rooms through the production gateway and real engine on loopback',()=>{
    it.each([10,180,600])('keeps creator %s seconds through two clients, actual moves and reconnect',async seconds=>{
        const clockMs=(seconds===10?30:seconds)*1000;
        const host=await connect('GUEST-private-host-'+seconds),joiner=await connect('GUEST-private-joiner-'+seconds),matchId='CLOCK'+seconds;
        let accepted=event(host.client,'private_room_ready');
        host.client.emit('connect_match',{matchId,privateRoom:{intent:'create',timeControl:seconds},introVersion:1});
        expect(await accepted).toEqual({matchId,timeControl:seconds});
        accepted=event(host.client,'private_room_ready');
        host.client.emit('connect_match',{matchId,privateRoom:{intent:'create',timeControl:seconds===600?10:600},introVersion:1});
        expect((await accepted).timeControl).toBe(seconds);
        const start=event(host.client,'match_start'),second=event(joiner.client,'match_start');
        joiner.client.emit('connect_match',{matchId,privateRoom:{intent:'join',timeControl:999},introVersion:1});
        const [state,peer]=await Promise.all([start,second]);expect(state.board).toEqual(peer.board);
        expect(state.clock).toMatchObject({white:clockMs,black:clockMs,timeControl:clockMs});
        expect(state.introPending).toBe(true);
        const ready=event(host.client,'sync_state',s=>s.introPending===false);
        host.client.emit('intro_ready',{matchId});joiner.client.emit('intro_ready',{matchId});
        const now=await ready;await delay(Math.max(0,now.startsAt-Date.now())+30);
        const moved=event(joiner.client,'sync_state',s=>s.version===1);
        host.client.emit('player_action',{actionId:'white-'+seconds,version:0,action:{type:'MOVE',payload:{pieceId:state.board[8],toX:0,toY:2}}});
        const first=await moved;expect(first.moveCount).toBe(1);
        const absent=event(host.client,'opponent_disconnected');joiner.client.disconnect();expect((await absent).gracePeriodSeconds).toBe(30);
        const restored=await connect('GUEST-private-joiner-'+seconds);
        const rejoined=event(host.client,'opponent_reconnected'),snapshot=event(restored.client,'sync_state',s=>s.version===1);
        restored.client.emit('connect_match',{matchId,privateRoom:{intent:'reconnect',timeControl:999},introVersion:1});
        await rejoined;expect((await snapshot).clock.timeControl).toBe(clockMs);
        const reply=event(host.client,'sync_state',s=>s.version===2);
        restored.client.emit('player_action',{actionId:'black-'+seconds,version:1,action:{type:'MOVE',payload:{pieceId:state.board[48],toX:0,toY:5}}});
        expect((await reply).moveCount).toBe(2);
        host.client.emit('cancel_match_admission',{matchId});await delay(30);expect(h.mm.getMatch(matchId).state).toBe('IN_GAME');
        const ended=event(host.client,'sync_state',s=>!!s.gameOver);
        restored.client.emit('player_action',{actionId:'end-'+seconds,version:2,action:{type:'RESIGN',payload:{}}});
        expect(await ended).toMatchObject({gameOver:'WHITE',gameOverReason:'resignation'});
    });

    it('unknown join/reconnect and malformed creation leave sessions, rooms and queue untouched',async()=>{
        const {client}=await connect('GUEST-private-invalid'),before={...h.mm.getPlayerSession('GUEST-private-invalid')};
        const count=h.mm.getMatches().length;
        for(const [matchId,privateRoom,code] of [
            ['MISSING1',{intent:'join'},'ROOM_NOT_FOUND'],['MISSING2',{intent:'reconnect'},'ROOM_NOT_FOUND'],
            ['MISSING3',undefined,'UPDATE_REQUIRED'],['INVALID',{intent:'create',timeControl:999},'INVALID_ROOM'],
            ['INVALID2',{intent:'other'},'INVALID_ROOM'],['INVALID3',null,'INVALID_ROOM'],
        ] as const){
            const denied=event(client,'queue_error');client.emit('connect_match',{matchId,privateRoom});
            expect(await denied).toMatchObject({matchId,code});expect(h.mm.getMatch(matchId)).toBeUndefined();
            expect(h.mm.getPlayerSession('GUEST-private-invalid')).toEqual(before);expect(h.mm.getMatches()).toHaveLength(count);
        }
        const joined=event(client,'queue_joined');client.emit('join_queue',{mode:'random',timeControl:180});await joined;
    });

    it('only one competing joiner reserves the room, and creator retry cannot steal an existing code',async()=>{
        const host=await connect('GUEST-race-host'),a=await connect('GUEST-race-a'),b=await connect('GUEST-race-b'),matchId='RACE01';
        const accepted=event(host.client,'private_room_ready');host.client.emit('connect_match',{matchId,privateRoom:{intent:'create',timeControl:180}});await accepted;
        const blocked=event(b.client,'queue_error');b.client.emit('connect_match',{matchId,privateRoom:{intent:'create',timeControl:600}});expect((await blocked).code).toBe('ROOM_EXISTS');
        let release!:(rating:number)=>void;
        h.rating.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
        a.client.emit('connect_match',{matchId,privateRoom:{intent:'join'}});await until(()=>h.mm.getMatch(matchId).players.joiner==='GUEST-race-a');
        const full=event(b.client,'queue_error');b.client.emit('connect_match',{matchId,privateRoom:{intent:'join'}});
        expect((await full).code).toBe('ROOM_FULL');expect(h.mm.getPlayerSession('GUEST-race-b').state).toBe('IDLE');
        const start=event(host.client,'match_start');release(1000);expect((await start).players.joiner).toBe('GUEST-race-a');
    });

    it('keeps legacy join/reconnect for known private rooms and queue participants without create authority',async()=>{
        const host=await connect('GUEST-compat-host'),joiner=await connect('GUEST-compat-joiner'),matchId='COMPAT01';
        const accepted=event(host.client,'private_room_ready');host.client.emit('connect_match',{matchId,privateRoom:{intent:'create',timeControl:180},introVersion:1});await accepted;
        const started=event(host.client,'match_start');joiner.client.emit('connect_match',{matchId,introVersion:1});
        const state=await started;expect(state.clock.timeControl).toBe(180000);expect(state.players.joiner).toBe('GUEST-compat-joiner');
        const absence=event(host.client,'opponent_disconnected');joiner.client.disconnect();await absence;
        const replacement=await connect('GUEST-compat-joiner'),resumed=event(host.client,'opponent_reconnected');
        replacement.client.emit('connect_match',{matchId,introVersion:1});await resumed;
        expect(h.mm.getMatch(matchId).timeControl).toBe(180);expect(h.mm.awaitingReconnect('GUEST-compat-joiner',matchId)).toBe(false);
        for(const mode of ['ranked','random']){
            const a=await connect('compat-'+mode+'-a'),b=await connect('compat-'+mode+'-b');
            const queued=event(a.client,'queue_joined');a.client.emit('join_queue',{mode,timeControl:600});await queued;
            const found=event(a.client,'match_found');b.client.emit('join_queue',{mode,timeControl:600});const room=await found;
            const start=event(a.client,'match_start');a.client.emit('connect_match',{matchId:room.matchId,introVersion:1});b.client.emit('connect_match',{matchId:room.matchId,introVersion:1});
            expect(await start).toMatchObject({matchId:room.matchId,mode,clock:{timeControl:600000}});
        }
    });

    it('Home cancels a waiting host then allows a new queue, and stale exits cannot cancel a new room',async()=>{
        const {client}=await connect('GUEST-home'),matchId='HOME01';
        const accepted=event(client,'private_room_ready');client.emit('connect_match',{matchId,privateRoom:{intent:'create',timeControl:10}});await accepted;
        const cancelled=event(client,'match_cancelled');client.emit('cancel_match_admission',{matchId});await cancelled;
        expect(h.mm.getPlayerSession('GUEST-home')).toMatchObject({state:'IDLE',currentMatchId:undefined});
        const queued=event(client,'queue_joined');client.emit('join_queue',{mode:'random',timeControl:600});await queued;
        client.emit('cancel_queue');await until(()=>h.mm.getPlayerSession('GUEST-home').state==='IDLE');
        const next=event(client,'private_room_ready');client.emit('connect_match',{matchId:'HOME02',privateRoom:{intent:'create',timeControl:180}});await next;
        client.emit('cancel_match_admission',{matchId});await delay(30);
        expect(h.mm.getMatch('HOME02').state).toBe('WAITING_FOR_JOINER');
        expect(h.mm.getPlayerSession('GUEST-home').currentMatchId).toBe('HOME02');
    });

    it('Home before authentication returns prevents late room creation',async()=>{
        const {client,token}=await connect('private-early-cancel');
        let release!:(proof:any)=>void;
        h.verify.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
        client.emit('connect_match',{matchId:'EARLY01',privateRoom:{intent:'create',timeControl:180}});
        await until(()=>!!release);client.emit('cancel_match_admission',{matchId:'EARLY01'});await delay(30);
        release(h.sessions.get(token));await delay(50);
        expect(h.mm.getMatch('EARLY01')).toBeUndefined();expect(h.mm.getPlayerSession('private-early-cancel').state).toBe('IDLE');
    });

    it('Home during a slow profile lookup releases reservations and a late response cannot resurrect them',async()=>{
        const {client}=await connect('GUEST-slow-home');let release!:(rating:number)=>void;
        h.rating.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
        client.emit('connect_match',{matchId:'SLOW01',privateRoom:{intent:'create',timeControl:180}});
        await until(()=>!!release&&h.mm.getMatch('SLOW01')?.state==='WAITING_FOR_JOINER');
        client.emit('cancel_match_admission',{matchId:'SLOW01'});await until(()=>h.mm.getPlayerSession('GUEST-slow-home').state==='IDLE');
        const queued=event(client,'queue_joined');client.emit('join_queue',{mode:'random',timeControl:600});await queued;
        release(1000);await delay(50);
        expect(h.mm.getMatch('SLOW01').state).toBe('CANCELLED');expect(h.mm.getMatch('SLOW01').engine).toBeUndefined();
        expect(h.mm.getPlayerSession('GUEST-slow-home').state).toBe('WAITING');
    });

    it('a profile failure releases the private reservation with a scoped error',async()=>{
        const {client}=await connect('GUEST-profile-failure');h.rating.mockRejectedValueOnce(Error('fixture-only private provider failure'));
        const failed=event(client,'queue_error');client.emit('connect_match',{matchId:'FAIL01',privateRoom:{intent:'create',timeControl:180}});
        expect(await failed).toEqual({matchId:'FAIL01',code:'RATING_UNAVAILABLE'});
        expect(h.mm.getMatch('FAIL01').state).toBe('CANCELLED');expect(h.mm.getPlayerSession('GUEST-profile-failure').state).toBe('IDLE');
    });

    it('a disconnected waiting host expires after the real 30-second grace, then can queue again',async()=>{
        const {client}=await connect('GUEST-grace-host'),matchId='GRACE01';
        const accepted=event(client,'private_room_ready');client.emit('connect_match',{matchId,privateRoom:{intent:'create',timeControl:180}});await accepted;
        client.disconnect();await delay(30_150);
        expect(h.mm.getMatch(matchId).state).toBe('CANCELLED');expect(h.mm.getPlayerSession('GUEST-grace-host').state).toBe('IDLE');
        const restored=await connect('GUEST-grace-host'),queued=event(restored.client,'queue_joined');restored.client.emit('join_queue',{mode:'random',timeControl:180});await queued;
    },35_000);
});

it.each(['rating', 'authentication'] as const)('keeps a connected private host when the joining client fails during %s', async failure => {
    const host = await connect('GUEST-preserved-host-' + failure), joiner = await connect('preserved-joiner-' + failure);
    const next = await connect('GUEST-preserved-next-' + failure), matchId = 'PRESERVE-' + failure;
    const ready = event(host.client, 'private_room_ready');
    host.client.emit('connect_match', { matchId, privateRoom: { intent: 'create', timeControl: 180 }, introVersion: 1 }); await ready;
    const hostCancellations: unknown[] = []; host.client.on('match_cancelled', value => hostCancellations.push(value));
    if (failure === 'rating') h.rating.mockRejectedValueOnce(Error('synthetic rating outage'));
    else h.verify.mockResolvedValueOnce(h.sessions.get(joiner.token)).mockRejectedValueOnce(Error('synthetic auth outage after reservation'));
    const failed = event(joiner.client, 'queue_error');
    joiner.client.emit('connect_match', { matchId, privateRoom: { intent: 'join' }, introVersion: 1 });
    expect(await failed).toEqual({ matchId, code: failure === 'rating' ? 'RATING_UNAVAILABLE' : 'AUTH_UNAVAILABLE' });
    const room = h.mm.getMatch(matchId);
    expect(room).toMatchObject({ state: 'WAITING_FOR_JOINER', players: { host: 'GUEST-preserved-host-' + failure, joiner: '' }, connected: { host: true, joiner: false }, timeControl: 180 });
    expect(h.mm.getPlayerSession('preserved-joiner-' + failure).currentMatchId).toBeUndefined();
    const failedServerSocket = h.io.sockets.sockets.get(h.mm.getPlayerSession('preserved-joiner-' + failure).socketId);
    expect(failedServerSocket.rooms.has(matchId)).toBe(false);
    const queued = event(joiner.client, 'queue_joined'); joiner.client.emit('join_queue', { mode: 'random', timeControl: 600 }); await queued;
    const start = event(host.client, 'match_start');
    next.client.emit('connect_match', { matchId, privateRoom: { intent: 'join' }, introVersion: 1 });
    expect(await start).toMatchObject({ players: { joiner: 'GUEST-preserved-next-' + failure }, clock: { timeControl: 180000 } });
    expect(hostCancellations).toEqual([]);
});
