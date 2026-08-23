import { attemptMove, checkGameOver } from './quantumChess';

export interface Piece {
    id: number;
    team: number;
    possibilities: string[];
    x: number;
    y: number;
    captured: boolean;
}

export interface InternalGameState {
    version: number;
    matchId: string;
    players: {
        host: string;
        joiner: string;
    };
    board: (number | null)[];
    pieces: Piece[];
    turn: number; // 0 for white (host), 1 for black (joiner)
    moveCount: number;
    gameOver: 'WHITE' | 'BLACK' | 'DRAW' | null;
    history: any[];
    clock: {
        white: number; // remaining ms
        black: number; // remaining ms
        lastMoveAt: number; // timestamp of last turn start
        timeControl: number; // starting ms
    };
}

export interface PublicGameState {
    version: number;
    matchId: string;
    board: (number | null)[];
    pieces: Piece[];
    turn: number;
    moveCount: number;
    gameOver: 'WHITE' | 'BLACK' | 'DRAW' | null;
    lastAction: any | null;
    clock?: {
        white: number;
        black: number;
        lastMoveAt: number;
        timeControl: number;
    };
}

export type ActionPayload = 
    | { type: 'MOVE'; payload: { pieceId: number; toX: number; toY: number } }
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
    private state: InternalGameState;
    // Map of actionId -> ActionResult for idempotent recovery
    private processedActions = new Map<string, ActionResult>();

    constructor(matchId: string, host: string, joiner: string, initialBoard: any, timeControl: number = 600) {
        this.state = {
            version: 0,
            matchId,
            players: { host, joiner },
            board: initialBoard.board,
            pieces: initialBoard.pieces,
            turn: 0,
            moveCount: 0,
            gameOver: null,
            history: [],
            clock: {
                white: timeControl * 1000,
                black: timeControl * 1000,
                lastMoveAt: Date.now(),
                timeControl: timeControl * 1000
            }
        };
    }

    public checkTimeout(): boolean {
        if (this.state.gameOver) return false;
        
        const now = Date.now();
        const elapsed = now - this.state.clock.lastMoveAt;
        
        if (this.state.turn === 0) {
            if (this.state.clock.white - elapsed <= 0) {
                this.state.clock.white = 0;
                this.state.gameOver = 'BLACK'; // White timed out
                this.state.version += 1;
                return true;
            }
        } else {
            if (this.state.clock.black - elapsed <= 0) {
                this.state.clock.black = 0;
                this.state.gameOver = 'WHITE'; // Black timed out
                this.state.version += 1;
                return true;
            }
        }
        return false;
    }

    public processAction(action: Action): ActionResult {
        // Return cached result if idempotent
        if (this.processedActions.has(action.actionId)) {
            return this.processedActions.get(action.actionId)!;
        }

        // Before processing move, check if time ran out
        if (this.checkTimeout()) {
            const result: ActionResult = {
                success: false,
                message: 'Time out',
                newState: this.state
            };
            this.processedActions.set(action.actionId, result);
            return result;
        }

        if (this.state.gameOver) {
            return { success: false, message: 'Game is already over' };
        }

        if (action.version !== this.state.version) {
            return { success: false, message: `Version mismatch. Server: ${this.state.version}, Client: ${action.version}` };
        }

        let result = false;
        const turnBefore = this.state.turn;

        if (action.action.type === 'MOVE') {
            result = this.handleMove(action.playerId, action.action.payload);
        } else if (action.action.type === 'RESIGN') {
            result = this.handleResign(action.playerId);
        }

        let finalResult: ActionResult;
        if (result) {
            // Deduct time for the player who just moved
            const now = Date.now();
            const elapsed = now - this.state.clock.lastMoveAt;
            if (turnBefore === 0) {
                this.state.clock.white -= elapsed;
            } else {
                this.state.clock.black -= elapsed;
            }
            this.state.clock.lastMoveAt = now;

            this.state.version += 1;
            this.state.history.push(action);
            finalResult = { success: true, newState: this.state };
        } else {
            finalResult = { success: false, message: 'Invalid action' };
        }

        // Memoize and return
        this.processedActions.set(action.actionId, finalResult);
        return finalResult;
    }

    private handleMove(playerId: string, payload: { pieceId: number; toX: number; toY: number }): boolean {
        const expectedTeam = this.state.turn;
        const playerTeam = playerId === this.state.players.host ? 0 : 1;
        
        if (playerTeam !== expectedTeam) return false;

        const { pieceId, toX, toY } = payload;

        const result = attemptMove(this.state.pieces, this.state.board, pieceId, toX, toY);
        
        if (result.success) {
            this.state.pieces = result.pieces;
            this.state.board = result.board;
            
            // Check game over
            const gameOverResult = checkGameOver(this.state.pieces);
            if (gameOverResult) {
                this.state.gameOver = gameOverResult;
            } else {
                // Pass turn
                this.state.turn = this.state.turn === 0 ? 1 : 0;
            }
            this.state.moveCount += 1;
            return true;
        }
        
        return false;
    }

    private handleResign(playerId: string): boolean {
        const playerTeam = playerId === this.state.players.host ? 0 : 1;
        this.state.gameOver = playerTeam === 0 ? 'BLACK' : 'WHITE';
        return true;
    }

    // 2. Generate Public GameState with filtering (Information Hiding)
    public getPublicState(playerId: string): PublicGameState {
        // Deep copy pieces to filter out any true identities if they existed
        // Currently Q-GAMBIT pieces are purely their possibilities, 
        // but this ensures we have a hook for future hidden info filtering.
        const filteredPieces = this.state.pieces.map(p => ({
            ...p,
            // Example of filtering: if there was a hidden `trueIdentity`, we would strip it if p.team !== playerTeam
        }));

        return {
            version: this.state.version,
            matchId: this.state.matchId,
            board: this.state.board,
            pieces: filteredPieces,
            turn: this.state.turn,
            moveCount: this.state.moveCount,
            gameOver: this.state.gameOver,
            lastAction: this.state.history.length > 0 ? this.state.history[this.state.history.length - 1] : null,
            clock: this.state.clock
        };
    }
}
