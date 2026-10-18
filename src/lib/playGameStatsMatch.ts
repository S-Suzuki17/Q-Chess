import type { MatchStats } from './playGameStats';
import type { MoveRecord } from './gameRecordService';
import type { TimeControl } from '../types/game';

type Side = 'white' | 'black';
type Winner = 'white_wins' | 'black_wins' | 'draw' | null;

export function localMatchStats(input: {
    matchKey: string; mode: MatchStats['mode']; timeControl: TimeControl;
    side: Side | 'spectator'; winner: Winner; moves: Pick<MoveRecord, 'player' | 'capturedTokenId'>[]; checkmate: boolean;
}): MatchStats | null {
    if (!input.winner || input.side === 'spectator') return null;
    const moves = input.moves.filter(move => move.player === input.side);
    if (!moves.length) return null;
    return {
        matchKey: input.matchKey, mode: input.mode, timeControl: input.timeControl,
        result: input.winner === 'draw' ? 'draw' : input.winner === `${input.side}_wins` ? 'win' : 'loss',
        playerMoves: moves.length, captures: moves.filter(move => !!move.capturedTokenId).length,
        checkmate: input.checkmate,
    };
}

interface OnlineSnapshot {
    matchId?: string; players?: { host?: string; joiner?: string }; moveCount?: number;
    gameOver?: unknown; gameOverReason?: string; introPending?: boolean;
    pieces?: Array<{ team: number; captured: boolean }>;
}

/** Only a participant's accepted terminal snapshot contributes; reconnects reuse the same key. */
export function onlineMatchStats(input: {
    roomId?: string; userId?: string; role?: Side | 'spectator'; cancelled: boolean;
    mode?: 'private' | 'random' | 'ranked'; timeControl: TimeControl; snapshot: OnlineSnapshot | null;
}): MatchStats | null {
    const state = input.snapshot;
    if (!state || !input.roomId || state.matchId !== input.roomId || !input.userId || !input.mode
        || input.role === 'spectator' || input.cancelled || state.introPending) return null;
    const side = state.players?.host === input.userId ? 'white' : state.players?.joiner === input.userId ? 'black' : null;
    if (!side) return null;
    const winner = state.gameOver && typeof state.gameOver === 'object' && 'winner' in state.gameOver
        ? state.gameOver.winner : state.gameOver;
    if (!['WHITE', 'BLACK', 'DRAW'].includes(winner as string)
        || !Number.isSafeInteger(state.moveCount) || state.moveCount! < 1 || !Array.isArray(state.pieces)) return null;
    // The server increments moveCount once for each accepted ply, starting with White.
    const playerMoves = side === 'white' ? Math.ceil(state.moveCount! / 2) : Math.floor(state.moveCount! / 2);
    if (!playerMoves) return null;
    return {
        matchKey: `online:${input.roomId}:${side}`, mode: input.mode, timeControl: input.timeControl,
        result: winner === 'DRAW' ? 'draw' : winner === side.toUpperCase() ? 'win' : 'loss', playerMoves,
        captures: state.pieces.filter(piece => piece.team === (side === 'white' ? 1 : 0) && piece.captured === true).length,
        checkmate: state.gameOverReason === 'checkmate',
    };
}
