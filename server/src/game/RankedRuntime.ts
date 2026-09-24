import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { existsSync } from 'node:fs';
import type { Server } from 'socket.io';
import type { MatchSession, MatchmakingService } from '../matchmaking/MatchmakingService';
import type { RankedSettlement } from '../services/SupabaseService';
import type { PublicGameState } from './GameEngine';
import type { CpuProfile } from './RankCpuSearch';
import type { RankCpuWorkerResponse } from './rankCpuWorker';

export type CpuRunner=(state:PublicGameState,profile:CpuProfile)=>Promise<RankCpuWorkerResponse>;

/** Worker budget includes startup; search cannot block Socket.IO or other clocks. */
export const runCpuWorker:CpuRunner=(state,profile)=>new Promise((resolve,reject)=>{
    const js=path.join(__dirname,'rankCpuWorker.js');
    const worker=new Worker(existsSync(js)?js:path.join(__dirname,'rankCpuWorker.ts'),{workerData:{state,profile}});
    let done=false;
    const finish=(response?:RankCpuWorkerResponse,error?:Error)=>{
        if(done)return;done=true;clearTimeout(timer);void worker.terminate();
        if(error)reject(error);else resolve(response!);
    };
    const timer=setTimeout(()=>finish(undefined,new Error('CPU deadline exceeded')),3000);
    worker.once('message',response=>finish(response));
    worker.once('error',error=>finish(undefined,error instanceof Error?error:new Error('CPU worker error')));
    worker.once('exit',()=>{if(!done)finish(undefined,new Error('CPU stopped without a move'));});
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
        private recordCasual?:(match:MatchSession)=>Promise<void>) {
        matchmaking.onForfeit=match=>this.afterAction(match);
    }

    public broadcast(match:MatchSession) {
        if(match.engine)this.io.to(match.matchId).emit('sync_state',match.engine.getPublicState(match.players.host));
    }

    public replaySettlement(match:MatchSession,userId:string,emit:(event:string,data:unknown)=>void) {
        const result=this.saved.get(match.matchId);
        const change=[result?.white,result?.black].find(x=>x?.userId===userId);
        if(change)emit('rating_settled',{matchId:match.matchId,...change,timeControl:match.timeControl});
        else if(match.settlement==='pending')emit('rating_pending',{matchId:match.matchId});
    }

    public afterAction(match:MatchSession) {
        const alreadyFinished=match.state==='FINISHED';
        this.broadcast(match);
        if(match.engine?.getPublicState(match.players.host).gameOver) {
            this.matchmaking.finishMatch(match);
            if(match.mode==='ranked'&&match.settlement!=='saved') {
                match.settlement='pending';
                void this.persist(match);
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

    private async persist(match:MatchSession) {
        if(this.saving.has(match.matchId)||match.settlement==='saved'||Date.now()<(this.retryAt.get(match.matchId)??0))return;
        this.saving.add(match.matchId);
        try {
            const result=await this.settle(match);
            if(!result){this.retryAt.set(match.matchId,Date.now()+5000);this.io.to(match.matchId).emit('rating_pending',{matchId:match.matchId});return;}
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
        for(const match of this.matchmaking.getMatches()) {
            if(match.state==='FINISHED'&&match.settlement==='pending'){void this.persist(match);continue;}
            if(match.state!=='IN_GAME'||!match.engine)continue;
            if(match.engine.checkTimeout()){this.afterAction(match);continue;}
            const state=match.engine.getPublicState(match.players.host);
            if(state.gameOver){this.afterAction(match);continue;}
            if(!match.cpu||state.introPending||Date.now()<(state.startsAt??0)||this.cpuBusy.has(match.matchId))continue;
            if(state.turn!==(match.cpu.side==='host'?0:1))continue;
            this.cpuBusy.add(match.matchId);
            void this.runCpu(state,match.cpu.profile).then(response=>{
                if(match.state!=='IN_GAME'||!match.engine||!match.cpu)return;
                const current=match.engine.getPublicState(match.cpu.id);
                if(current.gameOver||current.version!==state.version||current.turn!==state.turn)return;
                if(response.error||response.version!==state.version||!response.move)throw new Error('CPU unavailable');
                const result=match.engine.processAction({actionId:`cpu:${state.version}`,version:state.version,playerId:match.cpu.id,action:{type:'MOVE',payload:response.move}});
                if(!result.success&&!match.engine.getPublicState(match.cpu.id).gameOver)throw new Error('CPU illegal move');
                this.afterAction(match);
            }).catch(()=>{
                // Infrastructure failure is a void match, never a free rated win/loss.
                if(match.state==='IN_GAME') {
                    this.matchmaking.finishMatch(match,'CANCELLED');
                    this.io.to(match.matchId).emit('match_cancelled',{matchId:match.matchId,reason:'cpu_unavailable'});
                }
            }).finally(()=>this.cpuBusy.delete(match.matchId));
        }
        for(const id of this.saved.keys())if(!this.matchmaking.getMatch(id))this.saved.delete(id);
    }
}
