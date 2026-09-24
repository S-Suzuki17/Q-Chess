import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { GameEngine } from '../game/GameEngine';
import { createInitialBoard } from '../game/quantumChess';
import { cpuProfileForRating, CpuProfile } from '../game/RankCpuSearch';

export const CPU_FALLBACK_MS = 60_000;
export type QueueMode = 'ranked' | 'random';

export type PlayerState = 'IDLE' | 'WAITING' | 'CONNECTING' | 'IN_GAME';
export type MatchState = 'MATCHED' | 'CONNECTING' | 'IN_GAME' | 'FINISHED' | 'CANCELLED' | 'WAITING_FOR_JOINER';

export interface PlayerSession {
    userId: string;
    socketId: string;
    state: PlayerState;
    userName?: string;
    currentMatchId?: string;
    timeControl?: number;
    mode?: QueueMode;
    queuedAt?: number;
    rating?: number;
}

export interface MatchSession {
    mode?: QueueMode;
    cpu?: {id:string;side:'host'|'joiner';profile:CpuProfile};
    settlement?: 'pending'|'saved';
    justStartedFlag?: boolean;
    appearances?:{host?:{avatar?:string;frame?:string;intro?:boolean;rating?:number|null};joiner?:{avatar?:string;frame?:string;intro?:boolean;rating?:number|null}};
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
    public onForfeit?: (match:MatchSession)=>void;
    private players = new Map<string, PlayerSession>(); // userId -> PlayerSession
    private matches = new Map<string, MatchSession>(); // matchId -> MatchSession
    private waitingQueue = new Set<string>(); // userIds
    private disconnectTimers = new Map<string, NodeJS.Timeout>(); // userId -> Timer
    private io: Server;

    constructor(io: Server) {
        this.io = io;
        
        // Cleanup dead matches and idle players every 10 minutes
        setInterval(() => {
            const now = Date.now();
            // Cleanup matches
            for (const [matchId, match] of this.matches.entries()) {
                if ((match.state === 'FINISHED' || match.state === 'CANCELLED') && match.settlement!=='pending') {
                    if (now - match.createdAt > 60 * 60 * 1000) { // 1 hour old
                        this.matches.delete(matchId);
                    }
                }
            }
            // Cleanup disconnected players
            for (const [userId, session] of this.players.entries()) {
                if (session.state === 'IDLE' && !this.io.sockets.sockets.has(session.socketId)) {
                    this.players.delete(userId);
                }
            }
        }, 10 * 60 * 1000);
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

    private handleMatchDisconnect(userId: string, matchId: string) {
        const match = this.matches.get(matchId);
        if (!match || match.state === 'FINISHED' || match.state === 'CANCELLED') return;

        const isHost = match.players.host === userId;
        const opponentId = isHost ? match.players.joiner : match.players.host;
        
        if (isHost) match.connected.host = false;
        else match.connected.joiner = false;

        // Notify opponent
        const oppSession = this.players.get(opponentId);
        if (oppSession) {
            const oppSock = this.io.sockets.sockets.get(oppSession.socketId);
            if (oppSock) {
                oppSock.emit('opponent_disconnected',{gracePeriodSeconds:30});
            }
        }

        // Start disconnect timer (allow 30 seconds for reconnect)
        const timer = setTimeout(() => {
            const currentMatch = this.matches.get(matchId);
            if (currentMatch && currentMatch.state === 'IN_GAME') {
                currentMatch.engine?.forfeit(userId);
                this.io.to(matchId).emit('match_forfeited', { winner: isHost ? 'joiner' : 'host', reason: 'abandonment' });
                this.onForfeit?.(currentMatch);
            }
            this.disconnectTimers.delete(userId);
        }, 30000);

        this.clearDisconnectTimer(userId);
        this.disconnectTimers.set(userId, timer);
    }

    public joinQueue(userId: string, timeControl: number, userName?: string, mode:QueueMode='random', rating?:number): { success: boolean, match?: MatchSession } {
        const session = this.players.get(userId);
        if (!session || ![10,180,600].includes(timeControl) || !['ranked','random'].includes(mode)) return { success: false };
        if (mode==='ranked' && (!Number.isFinite(rating) || rating! < 0)) return {success:false};

        if (session.state === 'WAITING' || session.state === 'IN_GAME' || session.state === 'CONNECTING') {
            return { success: false };
        }

        session.state = 'WAITING';
        session.timeControl = timeControl;
        session.mode=mode;
        session.queuedAt=Date.now();
        session.rating=rating;
        if (userName) session.userName = userName;
        this.waitingQueue.add(userId);
        
        this.broadcastQueueStats();

        const result=this.tryMatch(timeControl,mode);
        return {success:true,match:result.match};
    }

    public leaveQueue(userId: string) {
        const session = this.players.get(userId);
        if (session && session.state === 'WAITING') {
            session.state = 'IDLE';
            this.waitingQueue.delete(userId);
            this.broadcastQueueStats();
        }
    }
    
    public broadcastQueueStats() {
        this.io.emit('queue_stats', this.getQueueStats());
    }

    private tryMatch(timeControl: number, mode:QueueMode='random'): { success: boolean, match?: MatchSession } {
        const candidates = Array.from(this.waitingQueue).filter(uid => this.players.get(uid)?.timeControl === timeControl && (this.players.get(uid)?.mode??'random')===mode);
        
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
                mode,
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
            if(mode==='ranked')match.appearances={host:{rating:hostSession.rating},joiner:{rating:joinerSession.rating}};

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
                    this.io.to(matchId).emit('match_cancelled', { matchId,reason: 'connection_timeout' });
                }
            }, 15000);

            return { success: true, match };
        }
        return { success: false };
    }

    /** Reserve private-room roles synchronously, before an async profile lookup. */
    public reserveMatch(userId: string, matchId: string, userName?: string): MatchSession | undefined {
        const session=this.players.get(userId);
        if(session?.state==='WAITING'||(session?.currentMatchId&&session.currentMatchId!==matchId))return undefined;
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

        if(match.state==='CANCELLED'||match.state==='FINISHED')return undefined;
        return match.players.host===userId||match.players.joiner===userId?match:undefined;
    }

    public connectMatch(userId: string, matchId: string, userName?: string, avatarUrl?: string, avatarFrame?:string,introVersion?:number,rating?:number|null): { success: boolean, match?: MatchSession, engine?: GameEngine, justStarted?: boolean } {
        let session = this.players.get(userId);
        const match = this.reserveMatch(userId,matchId,userName);
        if(!match)return {success:false};

        const isHost = match.players.host === userId;
        const isJoiner = match.players.joiner === userId;

        if (!isHost && !isJoiner) {
            console.log('[connectMatch] Participant check rejected');
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

        const role=isHost?'host':'joiner';
        const previous=match.appearances?.[role];
        (match.appearances??={})[role]={avatar:avatarUrl??previous?.avatar,frame:avatarFrame??previous?.frame,intro:introVersion===1||previous?.intro,rating:previous?.rating??rating};
        this.clearDisconnectTimer(userId);

        // Mark as connected
        if (isHost) match.connected.host = true;
        if (isJoiner) match.connected.joiner = true;

        // Transition to IN_GAME if both connected
        if ((match.state === 'CONNECTING' || match.state === 'WAITING_FOR_JOINER') && match.connected.host && match.connected.joiner) {
            match.state = 'IN_GAME';
            const initialBoard = createInitialBoard();
            match.engine = new GameEngine(matchId, match.players.host, match.players.joiner, initialBoard, match.timeControl, match.playerNames,4000,!!match.appearances?.host?.intro&&!!match.appearances?.joiner?.intro);
            match.engine.setMatchMetadata({mode:match.mode??'random',cpu:match.cpu?{side:match.cpu.side,rating:match.cpu.profile.rating,level:match.cpu.profile.level}:undefined});
            if(match.cpu)match.engine.acknowledgeIntro(match.cpu.id);
            // A lost readiness message must never leave a room paused forever.
            setTimeout(()=>{if(match?.state==='IN_GAME'&&match.engine?.completeIntro())this.io.to(matchId).emit('sync_state',match.engine.getPublicState(userId));},15000);
            match.justStartedFlag = true;
        }

        for(const role of ['host','joiner'] as const) {
            const appearance=match.appearances?.[role];
            if(appearance) {
                match.engine?.setPlayerAppearance(role,appearance.avatar,appearance.frame);
                match.engine?.setPlayerRating(role,appearance.rating);
            }
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

        return { success: true, match: updatedMatch, engine: updatedMatch.engine, justStarted: updatedMatch.justStartedFlag };
    }

    public clearDisconnectTimer(userId: string) {
        const timer = this.disconnectTimers.get(userId);
        if (timer) {
            clearTimeout(timer);
            this.disconnectTimers.delete(userId);
            console.log('[RECONNECT] Disconnect timer cleared');
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

    /** Synchronous reservation makes human matching, cancellation and fallback mutually exclusive. */
    public takeCpuFallbacks(now=Date.now()): MatchSession[] {
        const created:MatchSession[]=[];
        let cpuActive=[...this.matches.values()].filter(m=>m.cpu&&['CONNECTING','IN_GAME'].includes(m.state)).length;
        for(const id of [...this.waitingQueue]) {
            const session=this.players.get(id);
            if(!session||session.state!=='WAITING'||session.mode!=='ranked'||!Number.isFinite(session.rating)||now-(session.queuedAt??now)<CPU_FALLBACK_MS)continue;
            // Always prefer another queued human at the same time control.
            const human=this.tryMatch(session.timeControl!,'ranked').match;
            if(human){created.push(human);continue;}
            if(cpuActive>=4)continue;
            const matchId=uuidv4(),cpuId=`ai:${matchId}`;
            const side: 'host'|'joiner'=Math.random()<0.5?'host':'joiner';
            const humanSide=side==='host'?'joiner':'host';
            const profile=cpuProfileForRating(session.rating!,session.timeControl!);
            const match:MatchSession={matchId,mode:'ranked',state:'CONNECTING',timeControl:session.timeControl!,
                players:{host:side==='host'?cpuId:id,joiner:side==='joiner'?cpuId:id},
                playerNames:{[humanSide]:session.userName,[side]:`CPU · ${profile.rating}`},
                connected:{host:side==='host',joiner:side==='joiner'},createdAt:now,
                appearances:{[humanSide]:{rating:session.rating},[side]:{rating:profile.rating,intro:true}},
                cpu:{id:cpuId,side,profile}};
            this.waitingQueue.delete(id);session.state='CONNECTING';session.currentMatchId=matchId;
            this.matches.set(matchId,match);created.push(match);cpuActive++;
            setTimeout(()=>{if(match.state==='CONNECTING'){this.finishMatch(match,'CANCELLED');this.io.to(matchId).emit('match_cancelled',{matchId,reason:'connection_timeout'});}},15000);
        }
        if(created.length)this.broadcastQueueStats();
        return created;
    }

    public getMatches() { return [...this.matches.values()]; }

    public finishMatch(match:MatchSession,state:'FINISHED'|'CANCELLED'='FINISHED') {
        match.state=state;
        for(const id of Object.values(match.players)) {
            this.clearDisconnectTimer(id);
            const session=this.players.get(id);
            if(session?.currentMatchId===match.matchId){session.state='IDLE';session.currentMatchId=undefined;}
        }
    }
    
    public getPlayerSession(userId: string) {
        return this.players.get(userId);
    }

    public accountBusy(userId:string) {
        return [...this.matches.values()].some(match=>Object.values(match.players).includes(userId)
            && (['IN_GAME','CONNECTING'].includes(match.state)||match.settlement==='pending'));
    }
    /** Only called after accountBusy/persistence guards, never forfeits a live match. */
    public forgetAccount(userId:string):string[] {
        if(this.accountBusy(userId))throw new Error('Account has an active match');
        this.leaveQueue(userId);this.clearDisconnectTimer(userId);
        const removed:string[]=[];
        for(const [id,match] of this.matches)if(Object.values(match.players).includes(userId)){
            this.matches.delete(id);removed.push(id);
        }
        this.players.delete(userId);return removed;
    }
}
