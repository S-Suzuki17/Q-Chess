import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { GameEngine } from '../game/GameEngine';
import { createInitialBoard } from '../game/quantumChess';

export type PlayerState = 'IDLE' | 'WAITING' | 'CONNECTING' | 'IN_GAME';
export type MatchState = 'MATCHED' | 'CONNECTING' | 'IN_GAME' | 'FINISHED' | 'CANCELLED';

export interface PlayerSession {
    userId: string;
    socketId: string;
    state: PlayerState;
    currentMatchId?: string;
    timeControl?: number;
}

export interface MatchSession {
    matchId: string;
    state: MatchState;
    timeControl: number;
    players: {
        host: string;
        joiner: string;
    };
    connected: {
        host: boolean;
        joiner: boolean;
    };
    engine?: GameEngine;
    createdAt: number;
}

export class MatchmakingService {
    private players = new Map<string, PlayerSession>(); // userId -> PlayerSession
    private matches = new Map<string, MatchSession>(); // matchId -> MatchSession
    private waitingQueue = new Set<string>(); // userIds
    private io: Server;

    constructor(io: Server) {
        this.io = io;
    }

    public registerSocket(userId: string, socketId: string) {
        let session = this.players.get(userId);
        if (!session) {
            session = { userId, socketId, state: 'IDLE' };
            this.players.set(userId, session);
        } else {
            session.socketId = socketId; // Update socket on reconnect
        }
    }

    public removeSocket(socketId: string) {
        for (const [userId, session] of this.players.entries()) {
            if (session.socketId === socketId) {
                if (session.state === 'WAITING') {
                    this.leaveQueue(userId);
                } else if (session.currentMatchId) {
                    this.handleMatchDisconnect(userId, session.currentMatchId);
                }
                break;
            }
        }
    }

    public joinQueue(userId: string, timeControl: number): { success: boolean, match?: MatchSession } {
        const session = this.players.get(userId);
        if (!session) return { success: false };

        if (session.state === 'WAITING' || session.state === 'IN_GAME' || session.state === 'CONNECTING') {
            return { success: false };
        }

        session.state = 'WAITING';
        session.timeControl = timeControl;
        this.waitingQueue.add(userId);

        return this.tryMatch(timeControl);
    }

    public leaveQueue(userId: string) {
        const session = this.players.get(userId);
        if (session && session.state === 'WAITING') {
            session.state = 'IDLE';
            this.waitingQueue.delete(userId);
        }
    }

    private tryMatch(timeControl: number): { success: boolean, match?: MatchSession } {
        const candidates = Array.from(this.waitingQueue).filter(uid => this.players.get(uid)?.timeControl === timeControl);
        
        if (candidates.length >= 2) {
            const hostId = candidates[0];
            const joinerId = candidates[1];
            
            this.waitingQueue.delete(hostId);
            this.waitingQueue.delete(joinerId);

            const matchId = uuidv4();
            const match: MatchSession = {
                matchId,
                state: 'CONNECTING',
                timeControl,
                players: { host: hostId, joiner: joinerId },
                connected: { host: false, joiner: false },
                createdAt: Date.now()
            };

            this.matches.set(matchId, match);

            const hostSession = this.players.get(hostId)!;
            const joinerSession = this.players.get(joinerId)!;

            hostSession.state = 'CONNECTING';
            hostSession.currentMatchId = matchId;
            joinerSession.state = 'CONNECTING';
            joinerSession.currentMatchId = matchId;

            // Connection Timeout (15 seconds)
            setTimeout(() => {
                const m = this.matches.get(matchId);
                if (m && m.state === 'CONNECTING') {
                    console.log(`[TIMEOUT] Match ${matchId} cancelled due to connection timeout.`);
                    m.state = 'CANCELLED';
                    const hSession = this.players.get(m.players.host);
                    const jSession = this.players.get(m.players.joiner);
                    if (hSession && hSession.currentMatchId === matchId) { hSession.state = 'IDLE'; hSession.currentMatchId = undefined; }
                    if (jSession && jSession.currentMatchId === matchId) { jSession.state = 'IDLE'; jSession.currentMatchId = undefined; }
                    this.io.to(matchId).emit('match_cancelled', { reason: 'connection_timeout' });
                }
            }, 15000);

            return { success: true, match };
        }
        return { success: false };
    }

    public connectMatch(userId: string, matchId: string): { success: boolean, match?: MatchSession, engine?: GameEngine } {
        let session = this.players.get(userId);
        const match = this.matches.get(matchId);

        if (!match) {
            console.log(`[connectMatch] Match ${matchId} not found`);
            return { success: false };
        }

        const isHost = match.players.host === userId;
        const isJoiner = match.players.joiner === userId;

        if (!isHost && !isJoiner) {
            console.log(`[connectMatch] User ${userId} is not part of match ${matchId}`);
            return { success: false };
        }

        if (match.state === 'CANCELLED' || match.state === 'FINISHED') {
            console.log(`[connectMatch] Match ${matchId} is ${match.state}`);
            return { success: false };
        }

        // Restore / initialize session
        if (!session) {
            session = { userId, socketId: '', state: 'IN_GAME', currentMatchId: matchId };
            this.players.set(userId, session);
        } else {
            session.state = 'IN_GAME';
            session.currentMatchId = matchId;
        }

        // Clear any disconnect timer
        this.clearDisconnectTimer(userId);

        // Mark as connected
        if (isHost) match.connected.host = true;
        if (isJoiner) match.connected.joiner = true;

        // Transition to IN_GAME if both connected
        if (match.state === 'CONNECTING' && match.connected.host && match.connected.joiner) {
            match.state = 'IN_GAME';
            const initialBoard = createInitialBoard();
            match.engine = new GameEngine(matchId, match.players.host, match.players.joiner, initialBoard, match.timeControl);
        }

        // If reconnected to an ongoing match, broadcast to opponent
        if (match.state === 'IN_GAME') {
            this.io.to(matchId).emit('opponent_reconnected', { userId, timestamp: Date.now() });
        }

        return { success: true, match, engine: match.engine };
    }

    private disconnectTimers = new Map<string, NodeJS.Timeout>(); // userId -> Timer

    private handleMatchDisconnect(userId: string, matchId: string) {
        const match = this.matches.get(matchId);
        if (!match) return;

        if (match.players.host === userId) match.connected.host = false;
        if (match.players.joiner === userId) match.connected.joiner = false;

        if (match.state === 'CONNECTING') {
            match.state = 'CANCELLED';
            const hSession = this.players.get(match.players.host);
            const jSession = this.players.get(match.players.joiner);
            if (hSession && hSession.currentMatchId === matchId) { hSession.state = 'IDLE'; hSession.currentMatchId = undefined; }
            if (jSession && jSession.currentMatchId === matchId) { jSession.state = 'IDLE'; jSession.currentMatchId = undefined; }
            this.io.to(matchId).emit('match_cancelled', { reason: 'opponent_disconnected' });
        } else if (match.state === 'IN_GAME') {
            console.log(`[DISCONNECT] User ${userId} disconnected from match ${matchId}. Starting 120s grace period.`);
            this.io.to(matchId).emit('opponent_disconnected', { userId, timestamp: Date.now(), gracePeriodSeconds: 120 });
            
            this.clearDisconnectTimer(userId);

            const timer = setTimeout(() => {
                const m = this.matches.get(matchId);
                if (m && m.state === 'IN_GAME') {
                    console.log(`[TIMEOUT] User ${userId} failed to reconnect to match ${matchId}. Forfeiting.`);
                    m.state = 'FINISHED';
                    const hSession = this.players.get(m.players.host);
                    const jSession = this.players.get(m.players.joiner);
                    if (hSession && hSession.currentMatchId === matchId) { hSession.state = 'IDLE'; hSession.currentMatchId = undefined; }
                    if (jSession && jSession.currentMatchId === matchId) { jSession.state = 'IDLE'; jSession.currentMatchId = undefined; }
                    
                    if (m.engine) {
                        m.engine.processAction({
                            actionId: `forfeit_${userId}_${Date.now()}`,
                            version: m.engine.getPublicState(userId).version,
                            playerId: userId,
                            action: { type: 'RESIGN', payload: {} }
                        });
                        
                        const hSock = hSession ? this.io.sockets.sockets.get(hSession.socketId) : null;
                        const jSock = jSession ? this.io.sockets.sockets.get(jSession.socketId) : null;
                        if (hSock) hSock.emit('sync_state', m.engine.getPublicState(m.players.host));
                        if (jSock) jSock.emit('sync_state', m.engine.getPublicState(m.players.joiner));
                    }
                    this.io.to(matchId).emit('match_forfeited', { loserId: userId });
                }
                this.disconnectTimers.delete(userId);
            }, 120000); // 120 seconds

            this.disconnectTimers.set(userId, timer);
        }
    }

    public clearDisconnectTimer(userId: string) {
        const timer = this.disconnectTimers.get(userId);
        if (timer) {
            clearTimeout(timer);
            this.disconnectTimers.delete(userId);
            console.log(`[RECONNECT] Cleared disconnect timer for ${userId}`);
        }
    }

    public getMatch(matchId: string) {
        return this.matches.get(matchId);
    }
    
    public getPlayerSession(userId: string) {
        return this.players.get(userId);
    }
}
