import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { GameEngine } from '../game/GameEngine';
import { createInitialBoard } from '../game/quantumChess';

export type PlayerState = 'IDLE' | 'WAITING' | 'CONNECTING' | 'IN_GAME';
export type MatchState = 'MATCHED' | 'CONNECTING' | 'IN_GAME' | 'FINISHED' | 'CANCELLED' | 'WAITING_FOR_JOINER';

export interface PlayerSession {
    userId: string;
    socketId: string;
    state: PlayerState;
    userName?: string;
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
    playerNames: {
        host?: string;
        joiner?: string;
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

    public registerSocket(userId: string, socketId: string, userName?: string) {
        let session = this.players.get(userId);
        if (!session) {
            session = { userId, socketId, state: 'IDLE', userName };
            this.players.set(userId, session);
        } else {
            session.socketId = socketId; // Update socket on reconnect
            if (userName) session.userName = userName;
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

    public joinQueue(userId: string, timeControl: number, userName?: string): { success: boolean, match?: MatchSession } {
        const session = this.players.get(userId);
        if (!session) return { success: false };

        if (session.state === 'WAITING' || session.state === 'IN_GAME' || session.state === 'CONNECTING') {
            return { success: false };
        }

        session.state = 'WAITING';
        session.timeControl = timeControl;
        if (userName) session.userName = userName;
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

            const hostSession = this.players.get(hostId)!;
            const joinerSession = this.players.get(joinerId)!;

            const matchId = uuidv4();
            const match: MatchSession = {
                matchId,
                state: 'CONNECTING',
                timeControl,
                players: { host: hostId, joiner: joinerId },
                playerNames: {
                    host: hostSession?.userName,
                    joiner: joinerSession?.userName
                },
                connected: { host: false, joiner: false },
                createdAt: Date.now()
            };

            this.matches.set(matchId, match);

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

        public connectMatch(userId: string, matchId: string, userName?: string, avatarUrl?: string): { success: boolean, match?: MatchSession, engine?: GameEngine } {
        let session = this.players.get(userId);
        let match = this.matches.get(matchId);

        if (!match) {
            // Create ad-hoc private match
            match = {
                matchId,
                state: 'WAITING_FOR_JOINER',
                timeControl: 600, // 10m default for private rooms if not specified
                players: { host: userId, joiner: '' },
                playerNames: { host: userName },
                connected: { host: false, joiner: false },
                createdAt: Date.now()
            };
            this.matches.set(matchId, match);
        } else if (match.state === 'WAITING_FOR_JOINER' && match.players.host !== userId) {
            // Join existing private match
            match.players.joiner = userId;
            match.playerNames.joiner = userName;
            match.state = 'CONNECTING';
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
            session = { userId, socketId: '', state: 'IN_GAME', currentMatchId: matchId, userName };
            this.players.set(userId, session);
        } else {
            session.state = 'IN_GAME';
            session.currentMatchId = matchId;
            if (userName) session.userName = userName;
        }

        // Store player name in match
        if (userName) {
            if (isHost) match.playerNames.host = userName;
            if (isJoiner) match.playerNames.joiner = userName;
            if (match.engine) {
                match.engine.setPlayerName(isHost ? 'host' : 'joiner', userName);
            }
        }

        this.clearDisconnectTimer(userId);

        // Mark as connected
        if (isHost) match.connected.host = true;
        if (isJoiner) match.connected.joiner = true;

        // Transition to IN_GAME if both connected
        if ((match.state === 'CONNECTING' || match.state === 'WAITING_FOR_JOINER') && match.connected.host && match.connected.joiner) {
            match.state = 'IN_GAME';
            const initialBoard = createInitialBoard();
            match.engine = new GameEngine(matchId, match.players.host, match.players.joiner, initialBoard, match.timeControl, match.playerNames);
        }

        // If reconnected to an ongoing match, broadcast to opponent
        const updatedMatch = this.matches.get(matchId);
        if (!updatedMatch) return { success: false };

        if (updatedMatch.state === 'IN_GAME' && updatedMatch.engine) {
            const opponentId = isHost ? updatedMatch.players.joiner : updatedMatch.players.host;
            const oppSession = this.players.get(opponentId);
            if (oppSession) {
                const oppSock = this.io.sockets.sockets.get(oppSession.socketId);
                if (oppSock) {
                    oppSock.emit('opponent_reconnected');
                    oppSock.emit('sync_state', updatedMatch.engine.getPublicState(opponentId));
                }
            }
        }

        return { success: true, match: updatedMatch, engine: updatedMatch.engine };
    }

    public clearDisconnectTimer(userId: string) {
        const timer = this.disconnectTimers.get(userId);
        if (timer) {
            clearTimeout(timer);
            this.disconnectTimers.delete(userId);
            console.log(`[RECONNECT] Cleared disconnect timer for ${userId}`);
        }
    }


    public getQueueStats(): Record<number, number> {
        const stats: Record<number, number> = {};
        for (const userId of this.waitingQueue) {
            const session = this.players.get(userId);
            if (session && session.timeControl) {
                stats[session.timeControl] = (stats[session.timeControl] || 0) + 1;
            }
        }
        return stats;
    }

    public getMatch(matchId: string) {
        return this.matches.get(matchId);
    }
    
    public getPlayerSession(userId: string) {
        return this.players.get(userId);
    }
}
