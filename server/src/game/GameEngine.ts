import { attemptLegalMove, checkGameOver, isCheckmate } from './quantumChess';
import { recordReplayChanges, replayPieceId } from './replayHistory';
import { randomUUID } from 'node:crypto';
import { MatchHintError, type TrustedHintPosition } from '../services/MatchHintTypes';
import { MATCH_HINT_RULES_VERSION, onlineHintAdvice, onlineHintHash, onlineHintState, publicHintPiece } from '../services/MatchHintPosition';

export type GameOverReason = 'checkmate' | 'king_capture' | 'timeout' | 'resignation' | 'abandonment';

export interface Piece {
    id: number;
    team: number;
    possibilities: string[];
    x: number;
    y: number;
    captured: boolean;
    hasMoved?: boolean;
    promoted?: boolean;
}

export interface InternalGameState {
    version: number;
    matchId: string;
    players: {
        host: string;
        joiner: string;
    };
    playerNames?: {
        host?: string;
        joiner?: string;
    };
    playerAvatars?: {
        host?: string;
        joiner?: string;
    };
    introPending?:boolean;
    startsAt?: number;
    serverNow?: number;
    playerFrames?: {host?:string;joiner?:string};
    playerRatings?: {host?:number|null;joiner?:number|null};
    board: (number | null)[];
    pieces: Piece[];
    turn: number; // 0 for white (host), 1 for black (joiner)
    moveCount: number;
    gameOver: 'WHITE' | 'BLACK' | 'DRAW' | null;
    gameOverReason?: GameOverReason;
    history: any[];
    clock: {
        white: number; // remaining ms
        black: number; // remaining ms
        lastMoveAt: number; // timestamp of last turn start
        timeControl: number; // starting ms
    };
}

export interface PublicGameState {
    hintContextId: string;
    mode?: 'ranked'|'random';
    cpu?: {side:'host'|'joiner';rating:number;level:number};
    version: number;
    matchId: string;
    players?: {
        host: string;
        joiner: string;
    };
    playerNames?: {
        host?: string;
        joiner?: string;
    };
    playerAvatars?: {
        host?: string;
        joiner?: string;
    };
    introPending?:boolean;
    startsAt?: number;
    serverNow?: number;
    playerFrames?: {host?:string;joiner?:string};
    playerRatings?: {host?:number|null;joiner?:number|null};
    board: (number | null)[];
    pieces: Piece[];
    turn: number;
    moveCount: number;
    gameOver: 'WHITE' | 'BLACK' | 'DRAW' | null;
    gameOverReason?: GameOverReason;
    lastAction: any | null;
    clock?: {
        white: number;
        black: number;
        lastMoveAt: number;
        timeControl: number;
    };
}

export type ActionPayload = 
    | { type: 'MOVE'; payload: { pieceId: number; toX: number; toY: number; intention?: 'castle' | 'normal'; promotedTo?: string } }
    | { type: 'RESIGN'; payload: {} };

export interface Action {
    actionId: string;
    version: number;
    playerId: string;
    action: ActionPayload;
}

export interface ActionResult {
    success: boolean;
    message?: string;
    newState?: InternalGameState;
}

export class GameEngine {
    public readonly hintContextId = randomUUID();
    private hintCommitLock?: symbol;
    private authority?: {canAdvance:()=>boolean;safeUntil:()=>number};
    private frozenAt?:number;
    public setAuthority(authority:NonNullable<GameEngine['authority']>) { this.authority=authority; }
    private canAdvance() { return this.frozenAt===undefined&&(!this.authority||this.authority.canAdvance()); }
    private clockNow() {
        const now=Math.min(Date.now(),this.authority?.safeUntil()??Infinity);
        if(this.authority&&this.frozenAt===undefined&&!this.authority.canAdvance())this.frozenAt=now;
        return Math.min(now,this.frozenAt??Infinity);
    }
    public freeze() {
        this.frozenAt??=this.clockNow();
    }
    private state: InternalGameState;
    // Map of actionId -> ActionResult for idempotent recovery
    private processedActions = new Map<string, ActionResult>();
    private introReady=new Set<string>();
    private replayHistory:Record<string,unknown>[]=[];
    private metadata: {mode?: 'ranked'|'random'; cpu?: {side:'host'|'joiner';rating:number;level:number}} = {};

    public setMatchMetadata(metadata: typeof this.metadata) { this.metadata = metadata; }
    public getHistory() { return this.replayHistory.slice(); }
    public forfeit(playerId: string) {
        if(!this.canAdvance())return false;
        if (this.state.gameOver || ![this.state.players.host,this.state.players.joiner].includes(playerId)) return false;
        this.state.gameOver = playerId === this.state.players.host ? 'BLACK' : 'WHITE';
        this.state.gameOverReason = 'abandonment';
        this.state.version += 1;
        return true;
    }

    constructor(
        matchId: string, 
        host: string, 
        joiner: string, 
        initialBoard: any, 
        timeControl: number = 600,
        playerNames?: { host?: string; joiner?: string },
        introMs=0,
        waitForIntro=false
    ) {
        this.state = {
            introPending:waitForIntro,
            startsAt:Date.now()+Math.max(0,Math.min(4000,introMs)),
            version: 0,
            matchId,
            players: { host, joiner },
            playerNames: playerNames || {},
            playerAvatars: {},
            board: initialBoard.board,
            pieces: initialBoard.pieces,
            turn: 0,
            moveCount: 0,
            gameOver: null,
            history: [],
            clock: {
                white: timeControl * 1000,
                black: timeControl * 1000,
                lastMoveAt: Date.now()+Math.max(0,Math.min(4000,introMs)),
                timeControl: timeControl * 1000
            }
        };
    }

    public setPlayerName(role: 'host' | 'joiner', name: string) {
        if (!this.state.playerNames) this.state.playerNames = {};
        this.state.playerNames[role] = name;
    }

    public setPlayerRating(role:'host'|'joiner',rating:unknown) {
        const ratings=this.state.playerRatings??={};
        // A match keeps its opening rating, including across reconnections.
        if(ratings[role]!==undefined)return;
        ratings[role]=typeof rating==='number'&&Number.isFinite(rating)&&rating>=0?rating:null;
    }

    public setPlayerAppearance(role:'host'|'joiner',avatar:unknown,frame:unknown) {
        if(typeof avatar==='string'&&avatar.length<=2048) {
            try { if(new URL(avatar).protocol==='https:') (this.state.playerAvatars??={})[role]=avatar; } catch { /* Invalid URL is ignored. */ }
        }
        if(typeof frame==='string'&&/^(standard|avatar-frame-(0[1-9]|1[0-5]|founders))$/.test(frame)) (this.state.playerFrames??={})[role]=frame;
    }

    public acknowledgeIntro(playerId:string):boolean {
        if(!this.canAdvance())return false;
        if(playerId!==this.state.players.host&&playerId!==this.state.players.joiner)return false;
        this.introReady.add(playerId);
        return this.introReady.size===2?this.completeIntro():false;
    }
    public completeIntro():boolean {
        if(!this.canAdvance())return false;
        if(!this.state.introPending||this.state.gameOver)return false;
        this.state.introPending=false;
        this.state.startsAt=Date.now()+250;
        this.state.clock.lastMoveAt=this.state.startsAt;
        return true;
    }
    public checkTimeout(): boolean {
        if(!this.canAdvance())return false;
        if (this.state.gameOver || this.state.introPending || Date.now() < (this.state.startsAt??0)) return false;
        
        const now = Date.now();
        const elapsed = Math.max(0,now - this.state.clock.lastMoveAt);
        
        if (this.state.turn === 0) {
            if (this.state.clock.white - elapsed <= 0) {
                this.state.clock.white = 0;
                this.state.gameOver = 'BLACK'; // White timed out -> Black wins
                this.state.gameOverReason = 'timeout';
                this.state.version += 1;
                return true;
            }
        } else {
            if (this.state.clock.black - elapsed <= 0) {
                this.state.clock.black = 0;
                this.state.gameOver = 'WHITE'; // Black timed out -> White wins
                this.state.gameOverReason = 'timeout';
                this.state.version += 1;
                return true;
            }
        }
        return false;
    }

    public processAction(action: Action): ActionResult {
        if(!this.canAdvance())return {success:false,message:'Ranked ownership unavailable'};
        if (action.playerId !== this.state.players.host && action.playerId !== this.state.players.joiner) {
            return { success: false, message: 'Not a participant' };
        }
        if(action.action.type==='MOVE'&&(this.state.introPending||Date.now()<(this.state.startsAt??0))) return {success:false,message:'Match is preparing'};
        // A human must never poison another participant's (especially CPU's) action cache.
        const actionKey=JSON.stringify([action.playerId,action.actionId]);
        if(this.processedActions.size>=4096)this.processedActions.delete(this.processedActions.keys().next().value!);
        if (this.processedActions.has(actionKey)) {
            return this.processedActions.get(actionKey)!;
        }

        // Before processing move, check if time ran out
        if (this.checkTimeout()) {
            const result: ActionResult = {
                success: false,
                message: 'Time out',
                newState: this.state
            };
            this.processedActions.set(actionKey, result);
            return result;
        }

        if (this.state.gameOver) {
            return { success: false, message: 'Game is already over' };
        }

        if (action.version !== this.state.version) {
            return { success: false, message: `Version mismatch. Server: ${this.state.version}, Client: ${action.version}` };
        }

        // Separate from ranked ownership: natural timeout and abandonment still
        // progress while an ambiguous purchase fences explicit mutations.
        if (this.hintCommitLock) return { success: false, message: 'HINT_PURCHASE_PENDING' };

        let result = false;
        const turnBefore = this.state.turn;
        // A synchronous search/rules calculation can outlive the lease while
        // the event loop is stalled. Stage its state and roll back before exposing it.
        const before=this.authority?structuredClone(this.state):undefined;
        const replayLength=this.replayHistory.length;

        if (action.action.type === 'MOVE') {
            result = this.handleMove(action.playerId, action.action.payload);
        } else if (action.action.type === 'RESIGN') {
            result = this.handleResign(action.playerId);
        }
        if(before&&!this.canAdvance()) {
            this.state=before;this.replayHistory.length=replayLength;
            return {success:false,message:'Ranked ownership unavailable'};
        }

        let finalResult: ActionResult;
        if (result) {
            // Deduct time for the player who just moved
            const now = Date.now();
            const elapsed = Math.max(0,now - this.state.clock.lastMoveAt);
            if (turnBefore === 0) {
                this.state.clock.white -= elapsed;
            } else {
                this.state.clock.black -= elapsed;
            }
            if (this.state.clock.timeControl === 10000) { if (turnBefore === 0) this.state.clock.white = 10000; else this.state.clock.black = 10000; } this.state.clock.lastMoveAt = now;

            this.state.version += 1;
            this.state.history.push(action);
            finalResult = { success: true, newState: this.state };
        } else {
            finalResult = { success: false, message: 'Invalid action' };
        }

        // Memoize and return
        this.processedActions.set(actionKey, finalResult);
        return finalResult;
    }

    private handleMove(playerId: string, payload: { pieceId: number; toX: number; toY: number; intention?: 'castle' | 'normal'; promotedTo?: string }): boolean {
        if(!payload||!Number.isInteger(payload.pieceId)||![payload.toX,payload.toY].every(n=>Number.isInteger(n)&&n>=0&&n<8))return false;
        if(payload.intention!==undefined&&!['castle','normal'].includes(payload.intention))return false;
        if(payload.promotedTo!==undefined&&!['Q','R','B','N'].includes(payload.promotedTo))return false;
        const expectedTeam = this.state.turn;
        const isHost = playerId === this.state.players.host;
        const playerTeam = isHost ? 0 : 1;
        
        if (playerTeam !== expectedTeam) return false;

        const { pieceId, toX, toY, intention, promotedTo } = payload;
        if (!this.state.pieces.some(p => p.id === pieceId && p.team === playerTeam && !p.captured)) return false;
        const result = attemptLegalMove(this.state.pieces, this.state.board, pieceId, toX, toY, intention, promotedTo);
        
        if (result.success && this.canAdvance()) {
            // Persist the Web replay format, not socket action envelopes.
            const before=this.state.pieces.find(p=>p.id===pieceId)!;
            const moved=result.pieces.find(p=>p.id===pieceId)!;
            const types:Record<string,string>={P:'Pawn',N:'Knight',B:'Bishop',R:'Rook',Q:'Queen',K:'King'};
            this.replayHistory.push({turn:this.state.moveCount+1,player:before.team===0?'white':'black',tokenId:replayPieceId(pieceId),
                from:[7-before.y,before.x],to:[7-toY,toX],possibleTypes:moved.possibilities.map(t=>types[t]),
                ...(result.capturedPiece?{capturedTokenId:replayPieceId(result.capturedPiece.id)}:{}),
                ...(moved.promoted?{promotedTo:types[moved.possibilities[0]]}:{}),
                replayVersion:2,changes:recordReplayChanges(this.state.pieces,result.pieces)});
            this.state.pieces = result.pieces;
            this.state.board = result.board;
            
            // Check game over
            const gameOverResult = checkGameOver(this.state.pieces);
            if (gameOverResult) {
                this.state.gameOver = gameOverResult;
                this.state.gameOverReason = 'king_capture';
            } else {
                // Pass turn
                this.state.turn = this.state.turn === 0 ? 1 : 0;
                if (isCheckmate(this.state.board, this.state.pieces, this.state.turn)) {
                    this.state.gameOver = this.state.turn === 0 ? 'BLACK' : 'WHITE';
                    this.state.gameOverReason = 'checkmate';
                }
            }
            this.state.moveCount += 1;
            return true;
        }
        
        return false;
    }

    private handleResign(playerId: string): boolean {
        const isHost = playerId === this.state.players.host;
        // If Host (White) resigns, Black wins ('BLACK'). If Joiner (Black) resigns, White wins ('WHITE').
        this.state.gameOver = isHost ? 'BLACK' : 'WHITE';
        this.state.gameOverReason = 'resignation';
        return true;
    }

    public hintContextFor(playerId: string): string {
        if (![this.state.players.host, this.state.players.joiner].includes(playerId)) throw new MatchHintError('NOT_A_PARTICIPANT');
        return this.hintContextId;
    }
    public hintPosition(playerId: string, revision: number): TrustedHintPosition {
        this.hintContextFor(playerId);
        if (!this.canAdvance()) throw new MatchHintError('MATCH_AUTHORITY_UNAVAILABLE');
        this.checkTimeout();
        if (revision !== this.state.version) throw new MatchHintError('STALE_REVISION');
        if (this.state.gameOver) throw new MatchHintError('SESSION_FINISHED');
        if (this.state.introPending || Date.now() < (this.state.startsAt ?? 0)) throw new MatchHintError('MATCH_PREPARING');
        const side = playerId === this.state.players.host ? 'white' : 'black';
        if ((side === 'white' ? 0 : 1) !== this.state.turn) throw new MatchHintError('NOT_YOUR_TURN');
        const now = Date.now();
        const remainingMs = Math.max(0, this.state.clock[side] - Math.max(0, now - this.state.clock.lastMoveAt));
        if (!remainingMs) throw new MatchHintError('SEARCH_CLOCK_EXPIRED');
        const online = { board: this.state.board.slice(), pieces: this.state.pieces.map(publicHintPiece), turn: this.state.turn };
        const state = onlineHintState(online, this.state.moveCount);
        const stateHash = onlineHintHash(online, this.state.moveCount);
        return { contextId: this.hintContextId, kind: 'match', mode: this.metadata.mode ?? 'private', side,
            revision, stateHash, rulesVersion: MATCH_HINT_RULES_VERSION, state, online, remainingMs,
            validUntilMs: Math.min(now + remainingMs, this.authority?.safeUntil() ?? Infinity),
            validateMove: move => onlineHintAdvice(online, state, move),
            acquire: () => this.acquireHint(playerId, revision, stateHash) };
    }
    private acquireHint(playerId: string, revision: number, stateHash: string): () => void {
        const current = this.hintPosition(playerId, revision);
        if (current.stateHash !== stateHash) throw new MatchHintError('STALE_REVISION');
        if (this.hintCommitLock) throw new MatchHintError('HINT_PURCHASE_PENDING');
        const lock = Symbol(); this.hintCommitLock = lock;
        return () => { if (this.hintCommitLock === lock) this.hintCommitLock = undefined; };
    }

    // 2. Generate Public GameState with filtering
    public getPublicState(playerId: string): PublicGameState {
        const clockNow=this.clockNow();
        const filteredPieces = this.state.pieces.map(publicHintPiece);

        return {
            ...this.metadata,
            hintContextId: this.hintContextId,
            version: this.state.version,
            matchId: this.state.matchId,
            players: this.state.players,
            playerNames: this.state.playerNames,
            playerAvatars: this.state.playerAvatars,
            playerRatings: this.state.playerRatings,
            board: this.state.board.slice(),
            pieces: filteredPieces,
            turn: this.state.turn,
            moveCount: this.state.moveCount,
            gameOver: this.state.gameOver,
            gameOverReason: this.state.gameOverReason,
            lastAction: this.state.history.length > 0 ? this.state.history[this.state.history.length - 1] : null,
            introPending:this.state.introPending,startsAt:this.state.startsAt,serverNow:Date.now(),playerFrames:this.state.playerFrames,
            clock:{...this.state.clock,
                white:Math.max(0,this.state.clock.white-(!this.state.introPending&&!this.state.gameOver&&this.state.turn===0?Math.max(0,clockNow-this.state.clock.lastMoveAt):0)),
                black:Math.max(0,this.state.clock.black-(!this.state.introPending&&!this.state.gameOver&&this.state.turn===1?Math.max(0,clockNow-this.state.clock.lastMoveAt):0))}
        };
    }
}
