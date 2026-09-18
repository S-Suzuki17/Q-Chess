import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import { GameEngine, Action, ActionPayload } from './game/GameEngine';
import { MatchmakingService } from './matchmaking/MatchmakingService';
import { SupabaseService } from './services/SupabaseService';
import { RankedAuth } from './services/RankedAuth';
import { RankedRuntime } from './game/RankedRuntime';
import { createPrivateGameRecordRouter } from './services/PrivateGameRecordRoutes';
import { createProfileAvatarRouter } from './services/ProfileAvatarRoutes';
import type { MatchSession, QueueMode } from './matchmaking/MatchmakingService';

const app = express();
app.use(cors());
const supabaseService = new SupabaseService();
const rankedAuth = new RankedAuth((id,password)=>supabaseService.verifyLegacyPassword(id,password));
app.use(createPrivateGameRecordRouter(rankedAuth,supabaseService));
app.use(createProfileAvatarRouter(rankedAuth,supabaseService.profileAvatarStore()));
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
    if(loginAttempts.size>=10000||count.count>=5||total.count>=100)return res.status(429).json({code:'TRY_LATER'});
    count.count++;total.count++;loginAttempts.set(key,count);loginAttempts.set(ip,total);
    const session=await rankedAuth.issueLegacySession(username,req.body?.password);
    if(!session)return res.status(401).json({code:'AUTH_FAILED'});
    return res.json(session);
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
    for(const match of matchmaking.takeCpuFallbacks())announceMatch(match);
    runtime.tick();
},250).unref();

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

  socket.data.userId = userId;
  socket.data.verified=!guest;
  next();
});

io.on('connection', (socket: Socket) => {
  const userId = socket.data.userId;
  console.log(`[+] User connected: ${userId} (Socket: ${socket.id})`);

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
      console.warn(`[RATE_LIMIT] Dropped '${eventName}' from user ${userId} (violations: ${rl.violations})`);
      
      socket.emit('action_error', { message: 'Too many requests. Please slow down.' });

      if (rl.violations > SEVERE_VIOLATION_THRESHOLD) {
        console.error(`[RATE_LIMIT] Force disconnecting abusive socket ${socket.id} (user: ${userId})`);
        socket.disconnect(true);
      }
      return;
    }
  });

  matchmaking.registerSocket(userId, socket.id);
  matchmaking.clearDisconnectTimer(userId);
  socket.emit('queue_stats', matchmaking.getQueueStats());

  // If reconnected while in an active game, join the room immediately and push state
  const existingSession = matchmaking.getPlayerSession(userId);
  if (existingSession && existingSession.currentMatchId && existingSession.state === 'IN_GAME') {
      const activeMatch = matchmaking.getMatch(existingSession.currentMatchId);
      if (activeMatch && activeMatch.engine && activeMatch.state === 'IN_GAME') {
          socket.join(existingSession.currentMatchId);
          console.log(`[RECONNECT] User ${userId} auto-rejoined room ${existingSession.currentMatchId}`);
          socket.emit('sync_state', activeMatch.engine.getPublicState(userId));
      }
  }

  let queueAttempt=0;
  socket.on('join_queue', async (data: { timeControl: number, userName?: string, mode?:QueueMode }) => {
    const attempt=++queueAttempt;
    const timeControl=data?.timeControl,mode=data?.mode??'random';
    const fail=(code:string)=>{if(attempt===queueAttempt&&socket.connected&&matchmaking.getPlayerSession(userId)?.socketId===socket.id)socket.emit('queue_error',{code,message:code});};
    if(![10,180,600].includes(timeControl)||!['random','ranked'].includes(mode))return fail('INVALID_QUEUE');
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
    if(matchmaking.getPlayerSession(userId)?.socketId!==socket.id)return;
    if(typeof data?.matchId!=='string'||!data.matchId||data.matchId.length>128)return;
    if(data.userName!==undefined&&typeof data.userName!=='string')return;
    if(data.userName)data.userName=data.userName.slice(0,80);
    const reserved=matchmaking.reserveMatch(userId,data.matchId,data.userName);
    if(!reserved)return;
    const role=reserved.players.host===userId?'host':'joiner';
    const openingRating=reserved.engine?.getPublicState(userId).playerRatings?.[role];
    const rating=openingRating!==undefined?openingRating:await supabaseService.getMatchRating(userId,reserved.timeControl);
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
    console.log(`[-] User disconnected: ${userId}`);
    matchmaking.removeSocket(socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Q-GAMBIT Game Server listening on port ${PORT}`);
});
