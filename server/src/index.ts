import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import { GameEngine, Action, ActionPayload } from './game/GameEngine';
import { MatchmakingService } from './matchmaking/MatchmakingService';
import { SupabaseService } from './services/SupabaseService';
import { FirebaseAuthService } from './services/FirebaseAuthService';

const app = express();
app.use(cors());

// Phase 4: Health Check & Uptime ping target
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

const server = http.createServer(app);
const ALLOWED_ORIGINS = process.env.NODE_ENV === 'production' 
    ? ['https://q-gambit.com', 'https://www.q-gambit.com'] // Update with real domains
    : '*';

const io = new Server(server, {
  cors: { 
      origin: ALLOWED_ORIGINS, 
      methods: ['GET', 'POST'],
      credentials: true
  }
});

const matchmaking = new MatchmakingService(io);
const supabaseService = new SupabaseService();

// Token Bucket Rate Limiting Constants
const MAX_TOKENS = 15; // Max burst allowance of events
const REFILL_RATE = 5; // Tokens added per second
const SEVERE_VIOLATION_THRESHOLD = 50; // Dropped packet threshold before forced disconnect

// Daily DB Cleanup for old game records (older than 30 days)
supabaseService.cleanupOldRecords(30);
setInterval(() => {
    supabaseService.cleanupOldRecords(30);
}, 24 * 60 * 60 * 1000);

io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  
  if (!token) {
      return next(new Error('Authentication Error: No token provided'));
  }

  // Verify JWT via Firebase Admin
  const userId = await FirebaseAuthService.verifyToken(token);
  if (!userId) {
      return next(new Error('Authentication Error: Invalid token'));
  }

  socket.data.userId = userId;
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

  socket.on('join_queue', (data: { timeControl: number, userName?: string }) => {
    const timeControl = data?.timeControl || 600;
    const result = matchmaking.joinQueue(userId, timeControl, data?.userName);
    
    if (result.success && result.match) {
      const { match } = result;
      
      const hostSession = matchmaking.getPlayerSession(match.players.host);
      const joinerSession = matchmaking.getPlayerSession(match.players.joiner);

      const s1 = hostSession ? io.sockets.sockets.get(hostSession.socketId) : null;
      const s2 = joinerSession ? io.sockets.sockets.get(joinerSession.socketId) : null;
      
      if (s1) s1.join(match.matchId);
      if (s2) s2.join(match.matchId);

      io.to(match.matchId).emit('match_found', {
        matchId: match.matchId,
        hostId: match.players.host,
        joinerId: match.players.joiner,
        timeControl: match.timeControl
      });
    }
  });

  socket.on('cancel_queue', () => {
    matchmaking.leaveQueue(userId);
  });

  socket.on('connect_match', (data: { matchId: string, userName?: string, avatarUrl?: string }) => {
    const result = matchmaking.connectMatch(userId, data.matchId, data.userName, data.avatarUrl);
    
    socket.join(data.matchId);

    if (result.success && result.engine) {
      const publicState = result.engine.getPublicState(userId);
      socket.emit('match_start', publicState);
      socket.emit('sync_state', publicState);
    }
  });

  socket.on('emote', (data: { roomId?: string, matchId?: string, emote: string, player?: string }) => {
    const targetRoom = data.roomId || data.matchId;
    if (!targetRoom) return;
    
    // Broadcast emote to other players in the room
    socket.to(targetRoom).emit('emote', {
      player: data.player,
      emote: data.emote
    });
  });

  socket.on('player_action', async (data: { actionId: string, version: number, playerId?: string, action: ActionPayload }) => {
      if (data.playerId && data.playerId !== userId) {
          return socket.emit('action_error', { message: 'Unauthorized: playerId spoofing detected' });
      }

      let session = matchmaking.getPlayerSession(userId);
      let match = session?.currentMatchId ? matchmaking.getMatch(session.currentMatchId) : null;

      // Fallback search by matchId if session state dropped
      if (!match) {
          for (const m of (matchmaking as any).matches.values()) {
              if ((m.players.host === userId || m.players.joiner === userId) && m.state === 'IN_GAME') {
                  match = m;
                  if (session) {
                      session.currentMatchId = m.matchId;
                      session.state = 'IN_GAME';
                  }
                  break;
              }
          }
      }

      if (!match || !match.engine) return socket.emit('action_error', { message: 'No active match found' });

      const action: Action = {
          actionId: data.actionId,
          version: data.version,
          playerId: userId,
          action: data.action
      };

    const result = match.engine.processAction(action);
    if (result.success) {
      const room = io.sockets.adapter.rooms.get(match.matchId);
      if (room) {
        for (const sid of room) {
          const clientSocket = io.sockets.sockets.get(sid);
          if (clientSocket) {
             const uid = clientSocket.data.userId;
             clientSocket.emit('sync_state', match.engine.getPublicState(uid));
          }
        }
      }

      // Check if Game Finished
      const publicState = match.engine.getPublicState(userId);
      if (publicState.gameOver && match.state !== 'FINISHED') {
          match.state = 'FINISHED';
          const { host, joiner } = match.players;
          
          const hSession = matchmaking.getPlayerSession(host);
          const jSession = matchmaking.getPlayerSession(joiner);
          if (hSession) { hSession.state = 'IDLE'; hSession.currentMatchId = undefined; }
          if (jSession) { jSession.state = 'IDLE'; jSession.currentMatchId = undefined; }

          await supabaseService.recordMatchResult(
              match.matchId, 
              host, 
              joiner, 
              publicState.gameOver, 
              (match.engine as any).state?.history || []
          );
      }
    } else {
      socket.emit('action_error', { message: result.message });
    }
  });

  socket.on('request_sync', (data: { matchId: string }) => {
    const match = matchmaking.getMatch(data.matchId);
    if (!match || (match.players.host !== userId && match.players.joiner !== userId)) {
        return socket.emit('error', { message: 'Unauthorized match sync request' });
    }

    let session = matchmaking.getPlayerSession(userId);
    if (session) {
        session.currentMatchId = data.matchId;
        session.state = 'IN_GAME';
    }

    matchmaking.clearDisconnectTimer(userId);

    if (match.engine) {
      socket.join(data.matchId);
      socket.emit('sync_state', match.engine.getPublicState(userId));
    }
  });

  socket.on('ping', (data: { clientTime: number }) => {
      socket.emit('pong', { clientTime: data.clientTime, serverTime: Date.now() });
  });

  socket.on('disconnect', () => {
    console.log(`[-] User disconnected: ${userId}`);
    matchmaking.removeSocket(socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Q-GAMBIT Game Server listening on port ${PORT}`);
});
