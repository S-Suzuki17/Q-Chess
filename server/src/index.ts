import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import { GameEngine, Action, ActionPayload } from './game/GameEngine';
import { MatchmakingService } from './matchmaking/MatchmakingService';
import { SupabaseService } from './services/SupabaseService';
import { RankedAuth, isRankedUserId } from './services/RankedAuth';
import { RankedRuntime } from './game/RankedRuntime';
import { createPrivateGameRecordRouter } from './services/PrivateGameRecordRoutes';
import { createProfileAvatarRouter } from './services/ProfileAvatarRoutes';
import { createAdRewardRouter } from './services/AdRewardRoutes';
import {createFoundersRewardRouter} from './services/FoundersRewardRoutes';
import {createPlayRewardVerifier} from './services/PlayRewardVerifier';
import type { MatchSession, QueueMode } from './matchmaking/MatchmakingService';
import { AccountWriteGate } from './services/AccountDeletion';
import { accountRequestGuard, createAccountDeletionRouter } from './services/AccountDeletionRoutes';
import { createAccountRecoveryRouter } from './services/AccountRecoveryRoutes';
import { createAccountProfileRouter } from './services/AccountProfileRoutes';
import { createAccountSecurityRouter } from './services/AccountSecurityRoutes';
import {createServiceOperations} from './services/ServiceOperations';
import {createAccountProgressRouter} from './services/AccountProgressRoutes';
import {createAccountTermsRouter} from './services/AccountTermsRoutes';
import {createSecurityAudit} from './services/SecurityAudit';

const app = express();
app.use(cors());
const supabaseService = new SupabaseService();
const audit=createSecurityAudit((event,outcome,id)=>supabaseService.recordSecurityEvent(event,outcome,id));
const rankedAuth = new RankedAuth((id,password)=>supabaseService.verifyLegacyPassword(id,password));
const accountGate = new AccountWriteGate();
const operations=createServiceOperations(supabaseService.serviceStatusLoader());
app.use(operations.loginGuard);
app.get('/service/status',async(_req,res)=>{
    res.setHeader('Cache-Control','no-store');
    try{res.json({...await operations.read(),serverTime:Date.now()});}
    catch{res.status(503).json({code:'SERVICE_UNAVAILABLE'});}
});
const deletionStore = supabaseService.accountDeletionStore();
app.use(createAccountDeletionRouter(rankedAuth,deletionStore,accountGate,
    id=>matchmaking.accountBusy(id)||runtime.isSavingAccount(id),
    id=>{
        runtime.forgetReceipts(matchmaking.forgetAccount(id));
        for(const socket of io.sockets.sockets.values())if(socket.data.userId===id)socket.disconnect(true);
    }));
app.use(createAccountRecoveryRouter(rankedAuth,supabaseService.accountRecoveryStore(),accountGate,
    id=>matchmaking.accountBusy(id)||runtime.isSavingAccount(id),
    id=>{ for(const socket of io.sockets.sockets.values())if(socket.data.userId===id)socket.disconnect(true); },
    process.env.ACCOUNT_RECOVERY_ENABLED==='true'));
app.use(createAccountSecurityRouter(rankedAuth,supabaseService.accountSecurityStore(),accountGate,
    id=>{for(const socket of io.sockets.sockets.values())if(socket.data.userId===id){socket.emit('session_replaced');socket.disconnect(true);}},audit));
app.use(accountRequestGuard(rankedAuth,deletionStore,accountGate));
app.use(createAccountTermsRouter(rankedAuth,supabaseService.accountTermsStore(),accountGate));
app.use(createAccountProgressRouter(rankedAuth,supabaseService.accountProgressStore(),accountGate));
app.use(createAccountProfileRouter(rankedAuth,supabaseService.accountProfileStore(),accountGate));
app.use(createPrivateGameRecordRouter(rankedAuth,supabaseService));
app.use(createProfileAvatarRouter(rankedAuth,supabaseService.profileAvatarStore(),accountGate));
app.use(createAdRewardRouter(rankedAuth,supabaseService.adRewardStore()));
app.use(createFoundersRewardRouter(rankedAuth,supabaseService.foundersStore(),createPlayRewardVerifier(),process.env.PLAY_REWARDS_ALLOW_TEST==='true'));
app.use(express.json({limit:'4kb'}));

// Phase 4: Health Check & Uptime ping target
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now(), rulesVersion: 'checkmate-v1' });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true
  }
});

const matchmaking = new MatchmakingService(io);
const runtime = new RankedRuntime(io,matchmaking,match=>supabaseService.settleRankedMatch(match),undefined,match=>supabaseService.recordUnratedMatch(match));
const loginAttempts=new Map<string,{count:number;until:number}>();
let pendingLegacyLogins=0;
app.post('/auth/ranked-session',async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    const now=Date.now();
    for(const [key,value] of loginAttempts)if(value.until<=now)loginAttempts.delete(key);
    // Do not trust arbitrary X-Forwarded-For headers. Shared proxies have a global ceiling as well.
    const ip=req.socket.remoteAddress??'unknown';
    const username=typeof req.body?.username==='string'?req.body.username:'';
    const key=`${ip}:${username.slice(0,256)}`;
    const count=loginAttempts.get(key)??{count:0,until:now+60000};
    const total=loginAttempts.get(ip)??{count:0,until:now+60000};
    if(loginAttempts.size>=10000||count.count>=5||total.count>=100){
        res.setHeader('Retry-After','60');return res.status(429).json({code:'TRY_LATER'});
    }
    count.count++;total.count++;loginAttempts.set(key,count);loginAttempts.set(ip,total);
    if(!isRankedUserId(username)||typeof req.body?.password!=='string'||!req.body.password.length
        ||Buffer.byteLength(req.body.password,'utf8')>1024)return res.status(401).json({code:'AUTH_FAILED'});
    // Bound expensive DB/password work across distinct IDs and connections.
    // Reject overload with retry guidance instead of an unbounded login queue.
    if(pendingLegacyLogins>=16){res.setHeader('Retry-After','2');return res.status(503).json({code:'TRY_LATER'});}
    pendingLegacyLogins++;
    try {
        // The durable check survives a server restart; the in-memory gate alone
        // cannot remember a partially completed account deletion.
        if(accountGate.blocked(username)||await deletionStore.blocked(username))return res.status(409).json({code:'ACCOUNT_BUSY'});
        const session=await rankedAuth.issueLegacySession(username,req.body.password);
        if(accountGate.blocked(username)||await deletionStore.blocked(username)){
            rankedAuth.revokeUserSessions(username);return res.status(409).json({code:'ACCOUNT_BUSY'});
        }
        if(!session){await audit('login','denied',username);return res.status(401).json({code:'AUTH_FAILED'});}
        await audit('login','success',username);
        return res.json(session);
    } catch {
        // No upstream error, submitted password or token reaches logs/clients.
        rankedAuth.revokeUserSessions(username);
        await audit('upstream_error','error');
        res.setHeader('Retry-After','5');return res.status(503).json({code:'UNAVAILABLE'});
    } finally {pendingLegacyLogins--;}
});
app.post('/auth/ranked-session/revoke',(req,res)=>{
    const token=req.headers.authorization?.replace(/^Bearer /,'');
    rankedAuth.revokeSession(token);
    for(const socket of io.sockets.sockets.values())if(token&&socket.handshake.auth.token===token)socket.disconnect(true);
    res.setHeader('Cache-Control','no-store');res.status(204).end();
});

function announceMatch(match:MatchSession) {
    for(const id of Object.values(match.players)) {
        const session=matchmaking.getPlayerSession(id);
        if(session)io.sockets.sockets.get(session.socketId)?.join(match.matchId);
    }
    io.to(match.matchId).emit('match_found',{matchId:match.matchId,hostId:match.players.host,joinerId:match.players.joiner,
        timeControl:match.timeControl,mode:match.mode??'random',cpu:match.cpu?{side:match.cpu.side,rating:match.cpu.profile.rating,level:match.cpu.profile.level}:undefined});
}
setInterval(()=>{
    // Refresh is single-flight and cached. Existing matches continue even if DB status is unavailable.
    void operations.read().catch(()=>{});
    if(operations.acceptingNewMatches())for(const match of matchmaking.takeCpuFallbacks())announceMatch(match);
    runtime.tick();
},250).unref();
let checkingRestrictions=false;
setInterval(()=>{
    if(checkingRestrictions)return;checkingRestrictions=true;
    void(async()=>{
        const ids=[...new Set<string>([...io.sockets.sockets.values()].filter(s=>s.data.verified).map(s=>s.data.userId))];
        for(let offset=0;offset<ids.length;offset+=200){
            const blocked=new Set(await supabaseService.restrictedAccounts(ids.slice(offset,offset+200)));
            for(const socket of io.sockets.sockets.values())if(blocked.has(socket.data.userId)){
                rankedAuth.revokeUserSessions(socket.data.userId);socket.emit('session_replaced');socket.disconnect(true);
            }
        }
    })().catch(()=>{/* A transient admin check failure must not forfeit existing games. */}).finally(()=>{checkingRestrictions=false;});
},15000).unref();

// Token Bucket Rate Limiting Constants
const MAX_TOKENS = 15; // Max burst allowance of events
const REFILL_RATE = 5; // Tokens added per second
const SEVERE_VIOLATION_THRESHOLD = 50; // Dropped packet threshold before forced disconnect

// Replay retention is handled transactionally in the database. Never delete
// old match rows here: lifetime statistics and settlement receipts need them.

io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  
  if (!token) {
      return next(new Error('Authentication Error: No token provided'));
  }

  if(typeof token!=='string'||token.length>8192)return next(new Error('Authentication Error'));
  const proof=rankedAuth.verifySession(token);
  const guest=/^GUEST-[A-Za-z0-9_-]{1,120}$/.test(token);
  const userId=proof?.userId??(guest?token:await supabaseService.verifyUser(token));
  if (!userId) {
      return next(new Error('Authentication Error: Invalid token'));
  }
  try {
      if(accountGate.blocked(userId)||(!guest&&(await deletionStore.blocked(userId)||await supabaseService.accountSecurityStore().restricted(userId))))return next(new Error('Authentication Error: Account unavailable'));
  } catch { return next(new Error('Authentication Error: Account check unavailable')); }

  socket.data.userId = userId;
  socket.data.verified=!guest;
  next();
});

io.on('connection', (socket: Socket) => {
  const userId = socket.data.userId;
  console.log('[socket] connected');

  // Initialize Rate Limiter State for this socket
  socket.data.rateLimit = {
    tokens: MAX_TOKENS,
    lastRefill: Date.now(),
    violations: 0
  };

  // Socket middleware for incoming event rate-limiting
  socket.use((packet, next) => {
    const eventName = packet[0];
    if(['join_queue','connect_match','intro_ready','emote','piece_selection','player_action','request_sync','ping'].includes(eventName)
        &&(!packet[1]||typeof packet[1]!=='object'||Array.isArray(packet[1])))return;
    const now = Date.now();
    const rl = socket.data.rateLimit;

    // Refill tokens based on elapsed time
    const timePassed = (now - rl.lastRefill) / 1000;
    const tokensToAdd = timePassed * REFILL_RATE;
    if (tokensToAdd > 0) {
      rl.tokens = Math.min(MAX_TOKENS, rl.tokens + tokensToAdd);
      rl.lastRefill = now;
    }

    if (rl.tokens >= 1) {
      rl.tokens -= 1;
      rl.violations = Math.max(0, rl.violations - 1);
      next();
    } else {
      rl.violations += 1;
      console.warn('[RATE_LIMIT] Packet dropped');
      
      socket.emit('action_error', { message: 'Too many requests. Please slow down.' });

      if (rl.violations > SEVERE_VIOLATION_THRESHOLD) {
        console.error('[RATE_LIMIT] Socket disconnected');
        socket.disconnect(true);
      }
      return;
    }
  });

  const previousSocketId = matchmaking.getPlayerSession(userId)?.socketId;
  matchmaking.registerSocket(userId, socket.id);
  // Replace the session before disconnecting: an old socket must not forfeit the
  // new device's active match or cancel its queue.
  if(previousSocketId&&previousSocketId!==socket.id){
      const previous=io.sockets.sockets.get(previousSocketId);
      previous?.emit('session_replaced');previous?.disconnect(true);
  }
  matchmaking.clearDisconnectTimer(userId);
  socket.emit('queue_stats', matchmaking.getQueueStats());

  // If reconnected while in an active game, join the room immediately and push state
  const existingSession = matchmaking.getPlayerSession(userId);
  if (existingSession && existingSession.currentMatchId && existingSession.state === 'IN_GAME') {
      const activeMatch = matchmaking.getMatch(existingSession.currentMatchId);
      if (activeMatch && activeMatch.engine && activeMatch.state === 'IN_GAME') {
          socket.join(existingSession.currentMatchId);
          console.log('[RECONNECT] Active match restored');
          socket.emit('sync_state', activeMatch.engine.getPublicState(userId));
      }
  }

  let queueAttempt=0;
  socket.on('join_queue', async (data: { timeControl: number, userName?: string, mode?:QueueMode }) => {
    if(accountGate.blocked(userId))return;
    const attempt=++queueAttempt;
    const timeControl=data?.timeControl,mode=data?.mode??'random';
    const fail=(code:string)=>{if(attempt===queueAttempt&&socket.connected&&matchmaking.getPlayerSession(userId)?.socketId===socket.id)socket.emit('queue_error',{code,message:code});};
    if(![10,180,600].includes(timeControl)||!['random','ranked'].includes(mode))return fail('INVALID_QUEUE');
    const unavailable=await operations.admission(socket.handshake.auth.client);
    if(unavailable)return fail(unavailable);
    let rating:number|null=null;
    if(mode==='ranked') {
        const token=socket.handshake.auth.token;
        const identity=rankedAuth.verifySession(token)?.userId??(socket.data.verified?await supabaseService.verifyUser(token):null);
        if(identity!==userId)return fail('AUTH_REQUIRED');
        if(!await supabaseService.rankedReady())return fail('RANKED_UNAVAILABLE');
        rating=await supabaseService.getMatchRating(userId,timeControl);
        if(rating===null)return fail('RATING_UNAVAILABLE');
    }
    if(attempt!==queueAttempt||!socket.connected||matchmaking.getPlayerSession(userId)?.socketId!==socket.id)return;
    const name=typeof data?.userName==='string'?data.userName.slice(0,80):undefined;
    const result=matchmaking.joinQueue(userId,timeControl,name,mode,rating??undefined);
    if(!result.success)return fail('QUEUE_BUSY');
    socket.emit('queue_joined',{mode,timeControl,cpuFallbackAt:mode==='ranked'?Date.now()+60000:null});
    if(result.match)announceMatch(result.match);
  });

  socket.on('cancel_queue', () => {
    if(matchmaking.getPlayerSession(userId)?.socketId!==socket.id)return;
    queueAttempt++;
    matchmaking.leaveQueue(userId);
  });

  socket.on('connect_match', async (data: { matchId: string, userName?: string, avatarUrl?: string, avatarFrame?:string,introVersion?:number }) => {
    if(accountGate.blocked(userId))return;
    if(matchmaking.getPlayerSession(userId)?.socketId!==socket.id)return;
    if(typeof data?.matchId!=='string'||!data.matchId||data.matchId.length>128)return;
    if(data.userName!==undefined&&typeof data.userName!=='string')return;
    // Reconnection to a started game remains possible during maintenance.
    if(matchmaking.getMatch(data.matchId)?.state!=='IN_GAME'){
        const unavailable=await operations.admission(socket.handshake.auth.client);
        if(unavailable){socket.emit('queue_error',{code:unavailable,message:unavailable});return;}
        if(!socket.connected||matchmaking.getPlayerSession(userId)?.socketId!==socket.id)return;
    }
    if(data.userName)data.userName=data.userName.slice(0,80);
    const reserved=matchmaking.reserveMatch(userId,data.matchId,data.userName);
    if(!reserved)return;
    const role=reserved.players.host===userId?'host':'joiner';
    const openingRating=reserved.engine?.getPublicState(userId).playerRatings?.[role];
    const rating=openingRating!==undefined?openingRating:await supabaseService.getMatchRating(userId,reserved.timeControl);
    if(data.avatarFrame==='avatar-frame-founders'){
      try{if(!await supabaseService.foundersStore().owned(userId))data.avatarFrame='standard';}
      catch{data.avatarFrame='standard';}
    }
    if(!socket.connected||matchmaking.getPlayerSession(userId)?.socketId!==socket.id)return;
    const result = matchmaking.connectMatch(userId, data.matchId, data.userName, data.avatarUrl, data.avatarFrame,data.introVersion,rating);
    
    if(!result.success)return;
    socket.join(data.matchId);

    if (result.success && result.engine) {
      if (result.justStarted) {
          const room = io.sockets.adapter.rooms.get(data.matchId);
          if (room) {
              for (const sid of room) {
                  const clientSocket = io.sockets.sockets.get(sid);
                  if (clientSocket) {
                      const uid = clientSocket.data.userId;
                      const pState = result.engine.getPublicState(uid);
                      clientSocket.emit('match_start', pState);
                      clientSocket.emit('sync_state', pState);
                  }
              }
          }
          if (result.match) result.match.justStartedFlag = false;
      } else {
          const publicState = result.engine.getPublicState(userId);
          socket.emit('match_start', publicState);
          socket.emit('sync_state', publicState);
      }
    }
  });

  socket.on('intro_ready',(data:{matchId:string})=>{
    if(typeof data?.matchId!=='string')return;
    const match=matchmaking.getMatch(data.matchId);
    if(match?.engine?.acknowledgeIntro(userId))io.to(data.matchId).emit('sync_state',match.engine.getPublicState(userId));
  });

  socket.on('emote', (data: { roomId?: string, matchId?: string, emote: string, player?: string }) => {
    if(!data)return;
    const targetRoom = data.roomId || data.matchId;
    if (!targetRoom || !socket.rooms.has(targetRoom)||!['hello','well_played','wow','thinking','resign'].includes(data.emote)) return;
    const match=matchmaking.getMatch(targetRoom);
    if(!match||![match.players.host,match.players.joiner].includes(userId))return;
    
    // Broadcast emote to other players in the room
    socket.to(targetRoom).emit('emote', {
      player: match.players.host===userId?'white':'black',
      emote: data.emote
    });
  });

  socket.on('piece_selection', (data: { matchId: string, pieceId: string | null }) => {
    if (!data?.matchId||!socket.rooms.has(data.matchId)) return;
    if(data.pieceId!==null&&(typeof data.pieceId!=='string'||data.pieceId.length>128))return;
    socket.to(data.matchId).emit('opponent_selection', { pieceId: data.pieceId });
  });

  socket.on('player_action', async (data: { actionId: string, version: number, playerId?: string, action: ActionPayload }) => {
      if(matchmaking.getPlayerSession(userId)?.socketId!==socket.id)return;
      if(typeof data?.actionId!=='string'||data.actionId.length>128||!Number.isInteger(data.version)||!['MOVE','RESIGN'].includes(data.action?.type)||!data.action?.payload)return;
      if (data.playerId && data.playerId !== userId) {
          return socket.emit('action_error', { message: 'Unauthorized: playerId spoofing detected' });
      }

      let session = matchmaking.getPlayerSession(userId);
      let match = session?.currentMatchId ? matchmaking.getMatch(session.currentMatchId) : null;

      if (!match || !match.engine || match.state!=='IN_GAME') return socket.emit('action_error', { message: 'No active match found' });

      const action: Action = {
          actionId: data.actionId,
          version: data.version,
          playerId: userId,
          action: data.action
      };

    const result = match.engine.processAction(action);
    if (!result.success)socket.emit('action_error', { message: result.message });
    // A failed move can still have triggered timeout: terminal handling must run either way.
    runtime.afterAction(match);
  });

  socket.on('request_sync', (data: { matchId: string }) => {
    if(typeof data?.matchId!=='string')return;
    if(matchmaking.getPlayerSession(userId)?.socketId!==socket.id)return;
    const match = matchmaking.getMatch(data.matchId);
    if (!match || (match.players.host !== userId && match.players.joiner !== userId)) {
        return socket.emit('error', { message: 'Unauthorized match sync request' });
    }

    let session = matchmaking.getPlayerSession(userId);
    if (session && match.state==='IN_GAME') {
        if(session.currentMatchId&&session.currentMatchId!==data.matchId)return;
        session.currentMatchId = data.matchId;
        session.state = 'IN_GAME';
    }

    matchmaking.clearDisconnectTimer(userId);

    if (match.engine) {
      socket.join(data.matchId);
      socket.emit('sync_state', match.engine.getPublicState(userId));
      runtime.replaySettlement(match,userId,(event,payload)=>socket.emit(event,payload));
    }
  });

  socket.on('ping', (data: { clientTime: number }) => {
      if(!Number.isFinite(data?.clientTime))return;
      socket.emit('pong', { clientTime: data.clientTime, serverTime: Date.now() });
  });

  socket.on('disconnect', () => {
    queueAttempt++;
    console.log('[socket] disconnected');
    matchmaking.removeSocket(socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Q-GAMBIT Game Server listening on port ${PORT}`);
});
