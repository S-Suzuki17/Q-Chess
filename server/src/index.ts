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

// Phase 4: Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
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

  matchmaking.registerSocket(userId, socket.id);
  matchmaking.clearDisconnectTimer(userId);

  // If reconnected while in an active game, join the room immediately
  const existingSession = matchmaking.getPlayerSession(userId);
  if (existingSession && existingSession.currentMatchId && existingSession.state === 'IN_GAME') {
      socket.join(existingSession.currentMatchId);
      console.log(`[RECONNECT] User ${userId} rejoined room ${existingSession.currentMatchId}`);
  }

  socket.on('join_queue', (data: { timeControl: number }) => {
    const timeControl = data?.timeControl || 600;
    const result = matchmaking.joinQueue(userId, timeControl);
    
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

  socket.on('connect_match', (data: { matchId: string }) => {
    const result = matchmaking.connectMatch(userId, data.matchId);
    
    // Always join the room to receive sync_state broadcasts
    socket.join(data.matchId);

    if (result.success && result.engine) {
      // Send initial state to the user who connected
      socket.emit('match_start', result.engine.getPublicState(userId));
    }
  });

  socket.on('player_action', async (data: { actionId: string, version: number, playerId?: string, action: ActionPayload }) => {
      if (data.playerId && data.playerId !== userId) {
          return socket.emit('action_error', { message: 'Unauthorized: playerId spoofing detected' });
      }

      const session = matchmaking.getPlayerSession(userId);
      if (!session || !session.currentMatchId) return socket.emit('action_error', { message: 'No active match' });

      const match = matchmaking.getMatch(session.currentMatchId);
      if (!match || !match.engine) return socket.emit('action_error', { message: 'Match not initialized' });

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
    // Security check: ensure the user is actually in this match
    const session = matchmaking.getPlayerSession(userId);
    if (!session || session.currentMatchId !== data.matchId) {
        return socket.emit('error', { message: 'Unauthorized match sync request' });
    }

    const match = matchmaking.getMatch(data.matchId);
    if (match && match.engine) {
      socket.join(data.matchId);
      socket.emit('sync_state', match.engine.getPublicState(userId));
    }
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
