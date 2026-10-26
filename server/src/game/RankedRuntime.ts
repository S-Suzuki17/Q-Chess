import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { existsSync } from 'node:fs';
import type { Server } from 'socket.io';
import type { MatchSession, MatchmakingService } from '../matchmaking/MatchmakingService';
import type { RankedSettlement } from '../services/SupabaseService';
import type { PublicGameState } from './GameEngine';
import type { CpuProfile } from './RankCpuSearch';
import type { RankCpuWorkerResponse } from './rankCpuWorker';
import type { RankedAdmissionCoordinator } from '../services/RankedAdmissionCoordinator';

export type CpuRunner=(state:PublicGameState,profile:CpuProfile)=>Promise<RankCpuWorkerResponse>;

class CpuFailure extends Error {
    constructor(public readonly reason: 'deadline' | 'worker_error' | 'no_result' | 'search_error' | 'version_mismatch' | 'no_legal_move' | 'illegal_move') {
        super(`CPU ${reason}`);
    }
}

/** Worker budget includes startup; search cannot block Socket.IO or other clocks. */
export const runCpuWorker:CpuRunner=(state,profile)=>new Promise((resolve,reject)=>{
    const deadline=Date.now()+3000;
    const js=path.join(__dirname,'rankCpuWorker.js');
    const worker=new Worker(existsSync(js)?js:path.join(__dirname,'rankCpuWorker.ts'),{workerData:{state,profile,deadline:deadline-100,reportProgress:true}});
    let done=false;
    let fallback:RankCpuWorkerResponse|undefined;
    const finish=(response?:RankCpuWorkerResponse,error?:Error)=>{
        if(done)return;done=true;clearTimeout(timer);void worker.terminate();
        if(error)reject(error);else resolve(response!);
    };
    const timer=setTimeout(()=>fallback?finish(fallback):finish(undefined,new CpuFailure('deadline')),Math.max(0,deadline-Date.now()));
    worker.on('message',(response:RankCpuWorkerResponse)=>{
        if(done)return;
        if(response.partial) {
            if(response.version===state.version&&response.move&&!response.error)fallback={version:response.version,move:response.move};
        } else finish(response);
    });
    worker.once('error',()=>finish(undefined,new CpuFailure('worker_error')));
    worker.once('exit',()=>{if(!done)finish(undefined,new CpuFailure('no_result'));});
});

/** One terminal path for moves, resignations, idle timeouts and disconnections. */
export class RankedRuntime {
    private cpuBusy=new Set<string>();
    private saving=new Set<string>();
    private retryAt=new Map<string,number>();
    private saved=new Map<string,RankedSettlement>();
    private casualSaving=new Set<string>();
    constructor(private io:Server,private matchmaking:MatchmakingService,
        private settle:(match:MatchSession)=>Promise<RankedSettlement|null>,private runCpu:CpuRunner=runCpuWorker,
        private recordCasual?:(match:MatchSession)=>Promise<void>, private admission?:RankedAdmissionCoordinator) {
        matchmaking.onForfeit=match=>this.afterAction(match);
    }

    public broadcast(match:MatchSession) {
        if(!match.engine)return;
        const state=match.engine.getPublicState(match.players.host);
        this.io.to(match.matchId).emit('sync_state',state);
        return state;
    }

    public replaySettlement(match:MatchSession,userId:string,emit:(event:string,data:unknown)=>void) {
        const result=this.saved.get(match.matchId);
        const change=[result?.white,result?.black].find(x=>x?.userId===userId);
        if(change)emit('rating_settled',{matchId:match.matchId,...change,timeControl:match.timeControl});
        else if(match.settlement==='pending')emit('rating_pending',{matchId:match.matchId});
    }

    public afterAction(match:MatchSession) {
        if(match.admission&&!this.admission?.canAdvance(match))return;
        const alreadyFinished=match.state==='FINISHED';
        const state=this.broadcast(match);
        if(state?.gameOver) {
            this.matchmaking.finishMatch(match);
            if(match.mode==='ranked'&&match.settlement!=='saved') {
                match.settlement='pending';
                void this.persist(match);
            }
            else if(match.admissionProtocol==='shared_v1'&&match.settlement!=='saved') {
                match.settlement='pending'; void this.persistOnline(match);
            }
            else if(match.mode!=='ranked'&&!alreadyFinished&&this.recordCasual) {
                this.casualSaving.add(match.matchId);
                void this.recordCasual(match).catch(()=>{}).finally(()=>this.casualSaving.delete(match.matchId));
            }
        }
    }

    public isSavingAccount(userId:string) {
        return this.matchmaking.getMatches().some(match => Object.values(match.players).includes(userId)
            && (this.saving.has(match.matchId) || this.casualSaving.has(match.matchId) || match.settlement==='pending'));
    }
    public forgetReceipts(matchIds:string[]) {
        for(const id of matchIds) { this.saved.delete(id); this.retryAt.delete(id); }
    }

    private async persistOnline(match:MatchSession) {
        if(this.casualSaving.has(match.matchId)||match.settlement==='saved'||Date.now()<(this.retryAt.get(match.matchId)??0))return;
        this.casualSaving.add(match.matchId);
        try {
            await this.admission!.finishOnline(match);
            this.retryAt.delete(match.matchId);
            await this.recordCasual?.(match);
        } catch { this.retryAt.set(match.matchId,Date.now()+1000); }
        finally { this.casualSaving.delete(match.matchId); }
    }

    private async persist(match:MatchSession) {
        if(this.saving.has(match.matchId)||match.settlement==='saved'||Date.now()<(this.retryAt.get(match.matchId)??0))return;
        this.saving.add(match.matchId);
        try {
            const result=await this.settle(match);
            if(match.admission&&['voided','rejected'].includes(match.admission.state))return;
            if(!result){this.retryAt.set(match.matchId,Date.now()+5000);this.io.to(match.matchId).emit('rating_pending',{matchId:match.matchId});return;}
            if(match.admission)match.admission.state='settled';
            match.settlement='saved';this.saved.set(match.matchId,result);this.retryAt.delete(match.matchId);
            for(const id of Object.values(match.players)) {
                const session=this.matchmaking.getPlayerSession(id);
                const socket=session&&this.io.sockets.sockets.get(session.socketId);
                if(socket)this.replaySettlement(match,id,(event,data)=>socket.emit(event,data));
            }
        } catch {this.retryAt.set(match.matchId,Date.now()+5000);}
        finally {this.saving.delete(match.matchId);}
    }

    /** Called every 250 ms. No network/AI work is awaited on the timer. */
    public tick() {
        this.admission?.tick();
        for(const match of this.matchmaking.getMatches()) {
            if(match.admission?.state==='active'&&!this.admission?.canAdvance(match)) {
                void this.admission?.cancel(match,'owner_unavailable');continue;
            }
            if(match.state==='FINISHED'&&match.settlement==='pending'){
                if(match.mode!=='ranked'&&match.admissionProtocol==='shared_v1')void this.persistOnline(match);
                else void this.persist(match);
                continue;
            }
            if(match.state!=='IN_GAME'||!match.engine)continue;
            if(this.matchmaking.authorityCheckPending(match))continue;
            if(match.engine.checkTimeout()){this.afterAction(match);continue;}
            const status=match.engine.getTurnStatus();
            if(status.gameOver){this.afterAction(match);continue;}
            if(!match.cpu||status.introPending||Date.now()<(status.startsAt??0)||this.cpuBusy.has(match.matchId))continue;
            if(status.turn!==(match.cpu.side==='host'?0:1))continue;
            const state=match.engine.getPublicState(match.players.host);
            this.cpuBusy.add(match.matchId);
            const cpuStartedAt=Date.now();
            void this.runCpu(state,match.cpu.profile).then(response=>{
                if(match.state!=='IN_GAME'||!match.engine||!match.cpu||(match.admission&&!this.admission?.canAdvance(match)))return;
                if(this.matchmaking.authorityCheckPending(match))return;
                const current=match.engine.getTurnStatus();
                if(current.gameOver||current.version!==state.version||current.turn!==state.turn)return;
                if(response.error)throw new CpuFailure('search_error');
                if(response.version!==state.version)throw new CpuFailure('version_mismatch');
                if(!response.move)throw new CpuFailure('no_legal_move');
                const result=match.engine.processAction({actionId:`cpu:${state.version}`,version:state.version,playerId:match.cpu.id,action:{type:'MOVE',payload:response.move}});
                if(!result.success&&!match.engine.getTurnStatus().gameOver)throw new CpuFailure('illegal_move');
                this.afterAction(match);
            }).catch(error=>{
                // Infrastructure failure is a void match, never a free rated win/loss.
                if(match.state==='IN_GAME') {
                    const current=match.engine?.getTurnStatus();
                    if(!current||current.gameOver||current.version!==state.version||current.turn!==state.turn)return;
                    console.warn('[RankedCPU] Move failed', {reason:error instanceof CpuFailure?error.reason:'worker_error',
                        level:match.cpu?.profile.level,version:state.version,elapsedMs:Date.now()-cpuStartedAt});
                    if(match.admission&&this.admission)void this.admission.cancel(match,'cpu_unavailable');
                    else {
                        this.matchmaking.finishMatch(match,'CANCELLED');
                        this.io.to(match.matchId).emit('match_cancelled',{matchId:match.matchId,reason:'cpu_unavailable'});
                    }
                }
            }).finally(()=>this.cpuBusy.delete(match.matchId));
        }
        for(const id of this.saved.keys())if(!this.matchmaking.getMatch(id))this.saved.delete(id);
    }
}
