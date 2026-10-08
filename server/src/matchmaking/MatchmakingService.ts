import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { GameEngine } from '../game/GameEngine';
import { createInitialBoard } from '../game/quantumChess';
import { cpuProfileForRating, CpuProfile } from '../game/RankCpuSearch';

export const CPU_FALLBACK_MS = 10_000;
export const DISCONNECT_GRACE_MS = 30_000;
export type QueueMode = 'ranked' | 'random';

export type PlayerState = 'IDLE' | 'WAITING' | 'CONNECTING' | 'ADMITTING' | 'IN_GAME';
export type MatchState = 'MATCHED' | 'CONNECTING' | 'ADMITTING' | 'VOIDING' | 'IN_GAME' | 'FINISHED' | 'CANCELLED' | 'WAITING_FOR_JOINER';

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
    admissionProtocol?: 'shared_v1';
    admissionConsents?: Record<string,string>;
    awaitingChoices?: string[];
    admission?: { state: 'pending'|'active'|'voiding'|'settled'|'voided'|'rejected'; ownerId: string; reason?: string };
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
    public canAdmitPlayer?: (userId: string) => boolean;
    public onForfeit?: (match:MatchSession)=>void;
    public onAdmissionCancel?: (match:MatchSession,reason:string)=>void;
    public serverResponsive?: () => boolean;
    private players = new Map<string, PlayerSession>(); // userId -> PlayerSession
    private matches = new Map<string, MatchSession>(); // matchId -> MatchSession
    private waitingQueue = new Set<string>(); // userIds
    private disconnectTimers = new Map<string, NodeJS.Timeout>(); // userId -> Timer
    private disconnectDeadlines = new Map<string, { matchId: string; expiresAt: number; monotonicExpiresAt: number; checking?: Promise<void> }>();
    private io: Server;

    constructor(io: Server, private requireRankedAdmission=false, private requireSharedAdmission=false) {
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

    public removeSocket(socketId: string, checkAuthority?: () => Promise<unknown>) {
        for (const [userId, session] of this.players.entries()) {
            if (session.socketId === socketId) {
                if (session.state === 'WAITING') {
                    this.leaveQueue(userId);
                } else if (session.currentMatchId) {
                    this.handleMatchDisconnect(userId, session.currentMatchId, checkAuthority);
                }
                break;
            }
        }
    }

    private handleMatchDisconnect(userId: string, matchId: string, checkAuthority?: () => Promise<unknown>) {
        const match = this.matches.get(matchId);
        if (!match || match.state === 'FINISHED' || match.state === 'CANCELLED') return;

        const isHost = match.players.host === userId;
        const opponentId = isHost ? match.players.joiner : match.players.host;
        
        if (isHost) match.connected.host = false;
        else match.connected.joiner = false;

        // Transport retries are still the same absence, not a new grace period.
        const previous = this.disconnectDeadlines.get(userId);
        if (previous?.matchId === matchId) return;
        this.clearDisconnectTimer(userId);
        const deadline: {matchId:string;expiresAt:number;monotonicExpiresAt:number;checking?:Promise<void>} =
            { matchId, expiresAt: Date.now() + DISCONNECT_GRACE_MS, monotonicExpiresAt: performance.now() + DISCONNECT_GRACE_MS };
        this.disconnectDeadlines.set(userId, deadline);

        // Notify opponent
        const oppSession = this.players.get(opponentId);
        if (oppSession) {
            const oppSock = this.io.sockets.sockets.get(oppSession.socketId);
            if (oppSock) {
                oppSock.emit('opponent_disconnected',{
                    matchId, gracePeriodSeconds: DISCONNECT_GRACE_MS / 1000,
                    serverNow: Date.now(), deadline: deadline.expiresAt,
                });
            }
        }

        const cancelUnavailable=()=>{
            if(this.disconnectDeadlines.get(userId)===deadline)this.cancelInfrastructureMatch(match,'authentication_unavailable');
        };
        // A service outage known during the grace period must not become either
        // abandonment or a clock loss while reauthentication is unavailable.
        const check=()=>{
            const pending=Promise.resolve().then(checkAuthority).then(()=>{},cancelUnavailable).finally(()=>{
                if(deadline.checking===pending)deadline.checking=undefined;
            });
            deadline.checking=pending;return pending;
        };
        if(checkAuthority)void check();
        const finish=async()=>{
            const pending=[...this.disconnectDeadlines.values()].filter(d=>d.matchId===matchId&&d.checking).map(d=>d.checking!);
            if(pending.length)await Promise.all(pending);
            if (this.disconnectDeadlines.get(userId) !== deadline) return;
            if(this.serverResponsive?.()===false){this.cancelInfrastructureMatch(match,'server_unavailable');return;}
            const currentMatch = this.matches.get(matchId);
            if (currentMatch && currentMatch.state === 'IN_GAME') {
                if(currentMatch.engine?.checkTimeout())this.onForfeit?.(currentMatch);
                else if(currentMatch.engine?.forfeit(userId)) {
                    this.io.to(matchId).emit('match_forfeited', { matchId, winner: isHost ? 'joiner' : 'host', reason: 'abandonment' });
                    this.onForfeit?.(currentMatch);
                }
            } else if(currentMatch?.state==='ADMITTING') {
                this.onAdmissionCancel?.(currentMatch,'admission_abandoned');
            }
            this.disconnectTimers.delete(userId);
            this.disconnectDeadlines.delete(userId);
        };
        // The deadline remains fixed while checking infrastructure health.
        // A null/expired proof is a user denial; a rejection is a service outage.
        const timer = setTimeout(() => {
            if(this.disconnectDeadlines.get(userId)!==deadline)return;
            if(this.serverResponsive?.()===false||Date.now()>deadline.expiresAt+5000){
                this.cancelInfrastructureMatch(match,'server_unavailable');return;
            }
            if(checkAuthority)void check().then(finish);
            else void finish();
        }, DISCONNECT_GRACE_MS);

        this.disconnectTimers.set(userId, timer);
    }

    /** Infrastructure cancellation freezes play; paid admission owns durable refunds. */
    public cancelInfrastructureMatch(match: MatchSession, reason: string) {
        if(!['IN_GAME','ADMITTING','CONNECTING','WAITING_FOR_JOINER'].includes(match.state))return;
        match.engine?.freeze();
        for(const id of Object.values(match.players))this.clearDisconnectTimer(id);
        if(this.requiresAdmission(match)||match.admission)this.onAdmissionCancel?.(match,reason);
        else {
            this.finishMatch(match,'CANCELLED');
            this.io.to(match.matchId).emit('match_cancelled',{matchId:match.matchId,reason});
        }
    }

    public authenticationUnavailable(userId: string) {
        this.leaveQueue(userId);
        const id=this.players.get(userId)?.currentMatchId,match=id?this.matches.get(id):undefined;
        if(match&&(!match.connected.host||!match.connected.joiner))this.cancelInfrastructureMatch(match,'authentication_unavailable');
    }

    /** Preserve elapsed clock time, but do not decide a loss while health is unknown. */
    public authorityCheckPending(match: MatchSession): boolean {
        return Object.values(match.players).some(id=>{
            const deadline=this.disconnectDeadlines.get(id);
            return deadline?.matchId===match.matchId&&!!deadline.checking;
        });
    }

    public joinQueue(userId: string, timeControl: number, userName?: string, mode:QueueMode='random', rating?:number): { success: boolean, match?: MatchSession } {
        const session = this.players.get(userId);
        if(this.canAdmitPlayer&&!this.canAdmitPlayer(userId))return {success:false};
        if (!session || ![10,180,600].includes(timeControl) || !['ranked','random'].includes(mode)) return { success: false };
        if (mode==='ranked' && (!Number.isFinite(rating) || rating! < 0)) return {success:false};

        if (session.state !== 'IDLE' || this.accountBusy(userId)) {
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
        for(const id of this.waitingQueue)if(this.canAdmitPlayer&&!this.canAdmitPlayer(id))this.leaveQueue(id);
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
                ...(this.requireSharedAdmission?{admissionProtocol:'shared_v1' as const}:{}),
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
                    if(m.admissionProtocol==='shared_v1'){this.onAdmissionCancel?.(m,'connection_timeout');return;}
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

        if(match.state==='CANCELLED'||match.state==='FINISHED'||match.state==='VOIDING')return undefined;
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

        // A delayed timer callback must not let a late rejoin erase its deadline.
        const absence = this.disconnectDeadlines.get(userId);
        if (absence?.matchId === matchId && (Date.now() >= absence.expiresAt || performance.now() >= absence.monotonicExpiresAt)) return { success: false };

        if (match.state === 'CANCELLED' || match.state === 'FINISHED') {
            console.log(`[connectMatch] Match ${matchId} is ${match.state}`);
            return { success: false };
        }

        // Restore / initialize session
        if (!session) {
            session = { userId, socketId: '', state: match.state==='IN_GAME'?'IN_GAME':'CONNECTING', currentMatchId: matchId, userName };
            this.players.set(userId, session);
        } else {
            session.state = match.state==='IN_GAME'?'IN_GAME':'CONNECTING';
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
            // Reserve synchronously before the first admission await. There is
            // no engine or running clock while the DB result is uncertain.
            if(this.requiresAdmission(match)) {
                match.state='ADMITTING';
                for(const id of Object.values(match.players)) {
                    const player=this.players.get(id);
                    if(player)player.state='ADMITTING';
                }
            } else this.activateMatch(match);
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
                    oppSock.emit('opponent_reconnected', { matchId });
                    oppSock.emit('sync_state', updatedMatch.engine.getPublicState(opponentId));
                }
            }
        }

        return { success: true, match: updatedMatch, engine: updatedMatch.engine, justStarted: updatedMatch.justStartedFlag };
    }

    private requiresAdmission(match: MatchSession) {
        return match.admissionProtocol==='shared_v1'||(match.mode==='ranked'&&this.requireRankedAdmission);
    }

    /** Only admission acknowledgement, or the free release path, may call this. */
    public activateMatch(match:MatchSession, authority?:{canAdvance:()=>boolean;safeUntil:()=>number}):boolean {
        if(!match.engine&&this.canAdmitPlayer&&Object.values(match.players).some(id=>id!==match.cpu?.id&&!this.canAdmitPlayer!(id))){
            if(this.requiresAdmission(match))this.onAdmissionCancel?.(match,'authentication_required');
            else {this.finishMatch(match,'CANCELLED');this.io.to(match.matchId).emit('match_cancelled',{matchId:match.matchId,reason:'authentication_required'});}
            return false;
        }
        if(match.engine||!['CONNECTING','WAITING_FOR_JOINER','ADMITTING'].includes(match.state))return false;
        if(!match.connected.host||!match.connected.joiner)return false;
        if(this.requiresAdmission(match)&&(!authority||match.admission?.state!=='active'||!authority.canAdvance()))return false;
        match.engine=new GameEngine(match.matchId,match.players.host,match.players.joiner,createInitialBoard(),
            match.timeControl,match.playerNames,4000,!!match.appearances?.host?.intro&&!!match.appearances?.joiner?.intro);
        if(authority)match.engine.setAuthority(authority);
        match.engine.setMatchMetadata({mode:match.mode??'random',cpu:match.cpu?{side:match.cpu.side,rating:match.cpu.profile.rating,level:match.cpu.profile.level}:undefined});
        if(match.cpu)match.engine.acknowledgeIntro(match.cpu.id);
        for(const role of ['host','joiner'] as const) {
            const appearance=match.appearances?.[role];
            if(appearance) {
                match.engine.setPlayerAppearance(role,appearance.avatar,appearance.frame);
                match.engine.setPlayerRating(role,appearance.rating);
            }
            const player=this.players.get(match.players[role]);
            if(player?.currentMatchId===match.matchId)player.state='IN_GAME';
        }
        match.state='IN_GAME';
        match.justStartedFlag=true;
        setTimeout(()=>{if(match.state==='IN_GAME'&&match.engine?.completeIntro())this.io.to(match.matchId).emit('sync_state',match.engine.getPublicState(match.players.host));},15000);
        return true;
    }

    public clearDisconnectTimer(userId: string) {
        this.disconnectDeadlines.delete(userId);
        const timer = this.disconnectTimers.get(userId);
        if (timer) {
            clearTimeout(timer);
            this.disconnectTimers.delete(userId);
            console.log('[RECONNECT] Disconnect timer cleared');
        }
    }

    /** Handshake/snapshot alone does not prove a participant has rejoined. */
    public awaitingReconnect(userId: string, matchId: string): boolean {
        return this.disconnectDeadlines.get(userId)?.matchId === matchId;
    }

    /** Snapshot requests must replay, not reset, a missed disconnect notice. */
    public opponentDisconnect(userId: string, matchId: string) {
        const match = this.matches.get(matchId);
        if (!match || match.state !== 'IN_GAME' || !Object.values(match.players).includes(userId)) return null;
        const opponentId = match.players.host === userId ? match.players.joiner : match.players.host;
        const absence = this.disconnectDeadlines.get(opponentId);
        return absence?.matchId === matchId ? {
            matchId, deadline: absence.expiresAt, serverNow: Date.now(), gracePeriodSeconds: DISCONNECT_GRACE_MS / 1000,
        } : null;
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
        let cpuActive=[...this.matches.values()].filter(m=>m.cpu&&['CONNECTING','ADMITTING','VOIDING','IN_GAME'].includes(m.state)).length;
        for(const id of [...this.waitingQueue]) {
            if(this.canAdmitPlayer&&!this.canAdmitPlayer(id)){this.leaveQueue(id);continue;}
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
            const match:MatchSession={matchId,mode:'ranked',...(this.requireSharedAdmission?{admissionProtocol:'shared_v1' as const}:{}),state:'CONNECTING',timeControl:session.timeControl!,
                players:{host:side==='host'?cpuId:id,joiner:side==='joiner'?cpuId:id},
                playerNames:{[humanSide]:session.userName,[side]:`CPU · ${profile.rating}`},
                connected:{host:side==='host',joiner:side==='joiner'},createdAt:now,
                appearances:{[humanSide]:{rating:session.rating},[side]:{rating:profile.rating,intro:true}},
                cpu:{id:cpuId,side,profile}};
            this.waitingQueue.delete(id);session.state='CONNECTING';session.currentMatchId=matchId;
            this.matches.set(matchId,match);created.push(match);cpuActive++;
            setTimeout(()=>{if(match.state==='CONNECTING'){if(match.admissionProtocol==='shared_v1'){this.onAdmissionCancel?.(match,'connection_timeout');return;}this.finishMatch(match,'CANCELLED');this.io.to(matchId).emit('match_cancelled',{matchId,reason:'connection_timeout'});}},15000);
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
            && (['IN_GAME','CONNECTING','ADMITTING','VOIDING'].includes(match.state)||match.settlement==='pending'));
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
