import type { ActionPayload, Piece, PublicGameState } from './GameEngine';
import { attemptLegalMove, checkGameOver, filterPossibilities, getValidMoves, isCheckmate, isKingInCheck } from './quantumChess';

export type CpuMove = Extract<ActionPayload, { type: 'MOVE' }>['payload'];
export interface CpuProfile {
    /** Approximate difficulty label; this is not a measured or calibrated Elo. */
    rating: number;
    level: number;
    thinkMs: number;
    maxDepth: number;
}

/** Rounded difficulty bands vary search depth, time and deterministic evaluation noise. */
export function cpuProfileForRating(rating: number, timeControlSeconds: number): CpuProfile {
    const rounded = Math.round((Number.isFinite(rating) ? rating : 1000) / 100) * 100;
    const approximateRating = Math.max(600, Math.min(2200, rounded));
    const level = 1 + Math.floor((approximateRating - 600) / 200);
    const seconds = Number.isFinite(timeControlSeconds) ? Math.max(1, timeControlSeconds) : 600;
    const timeCap = seconds <= 10 ? 160 : seconds <= 60 ? 300 : seconds <= 180 ? 500 : 900;
    return {
        rating: approximateRating,
        level,
        thinkMs: Math.min(timeCap, 50 + level * level * 10),
        maxDepth: level <= 2 ? 1 : level <= 5 ? 2 : level <= 7 ? 3 : 4,
    };
}

type Position = Pick<PublicGameState, 'board' | 'pieces' | 'turn'>;
interface Candidate { move: CpuMove; next: Position; order: number }
interface SearchBudget { deadline: number; nodes: number; maxNodes: number }
const STOP = Symbol('CPU search budget exhausted');
const MATE = 1_000_000;
const VALUE: Record<string, number> = { P: 100, N: 320, B: 335, R: 500, Q: 900, K: 1000 };

function pieceValue(piece: Piece): number {
    return piece.possibilities.reduce((sum, type) => sum + (VALUE[type] ?? 0), 0)
        / Math.max(1, piece.possibilities.length);
}

function outOfTime(budget: SearchBudget): boolean {
    return Date.now() >= budget.deadline || budget.nodes >= budget.maxNodes;
}

function checkBudget(budget: SearchBudget): void {
    if (outOfTime(budget)) throw STOP;
}

function evaluate(position: Position): number {
    let score = 0;
    for (const piece of position.pieces) {
        if (piece.captured) continue;
        const sign = piece.team === position.turn ? 1 : -1;
        const confirmedKing = piece.possibilities.length === 1 && piece.possibilities[0] === 'K';
        const centrality = 7 - Math.abs(piece.x - 3.5) - Math.abs(piece.y - 3.5);
        const advance = piece.team === 0 ? piece.y : 7 - piece.y;
        score += sign * (pieceValue(piece) + (confirmedKing ? -centrality * 4 : centrality * 8));
        if (piece.possibilities.includes('P')) score += sign * advance * 5 / piece.possibilities.length;
    }
    // Legal simulation protects a confirmed king; checking the opponent remains tactically useful.
    if (isKingInCheck(position.board, position.pieces, position.turn)) score -= 45;
    if (isKingInCheck(position.board, position.pieces, 1 - position.turn)) score += 45;
    return score;
}

function terminalScore(position: Position, ply: number): number | null {
    const winner = checkGameOver(position.pieces);
    if (winner) return (winner === (position.turn === 0 ? 'WHITE' : 'BLACK') ? 1 : -1) * (MATE - ply);
    if (isCheckmate(position.board, position.pieces, position.turn)) return -MATE + ply;
    return null;
}

/**
 * getValidMoves supplies ordinary destinations. The server helper omits the two-square
 * king step, so add it explicitly and let attemptLegalMove adjudicate every candidate.
 * All simulation and quantum collapse remain owned by the authoritative server rules.
 */
function candidates(position: Position, budget: SearchBudget): Candidate[] {
    const result: Candidate[] = [];
    for (const piece of position.pieces) {
        if (piece.captured || piece.team !== position.turn) continue;
        if (outOfTime(budget)) break;
        const destinations = new Map<string, { x: number; y: number }>();
        for (const destination of getValidMoves(piece, position.board, position.pieces) as { x: number; y: number }[]) {
            destinations.set(`${destination.x},${destination.y}`, destination);
        }
        if (piece.possibilities.includes('K') && !piece.hasMoved) {
            for (const dx of [-2, 2]) {
                const x = piece.x + dx;
                if (x >= 0 && x < 8) destinations.set(`${x},${piece.y}`, { x, y: piece.y });
            }
        }
        for (const { x, y } of destinations.values()) {
            if (outOfTime(budget)) break;
            const castleGeometry = y === piece.y && Math.abs(x - piece.x) === 2 && piece.possibilities.includes('K');
            const intentions: (CpuMove['intention'])[] = castleGeometry ? [undefined, 'normal', 'castle'] : [undefined];
            // The authoritative API also allows a superposed mover to explicitly exclude K.
            // This can be the only legal escape when an ordinary move would confirm its king.
            if (!castleGeometry && piece.possibilities.includes('K') && piece.possibilities.length > 1) intentions.push('normal');
            for (const intention of intentions) {
                if (outOfTime(budget)) break;
                const move: CpuMove = { pieceId: piece.id, toX: x, toY: y };
                if (intention) move.intention = intention;
                if (!piece.promoted && y === (piece.team === 0 ? 7 : 0)
                    && filterPossibilities(piece, x, y, position.board, position.board[y * 8 + x] !== null, position.pieces).includes('P')) {
                    move.promotedTo = 'Q';
                }
                budget.nodes++;
                const simulated = attemptLegalMove(position.pieces, position.board, piece.id, x, y, intention, move.promotedTo);
                if (!simulated.success) continue;
                const next: Position = { board: simulated.board, pieces: simulated.pieces, turn: 1 - position.turn };
                const winner = checkGameOver(simulated.pieces);
                const win = winner === (position.turn === 0 ? 'WHITE' : 'BLACK');
                const capture = simulated.capturedPiece ? pieceValue(simulated.capturedPiece) : 0;
                result.push({ move, next, order: (win ? MATE : 0) + capture * 8 - evaluate(next) + (intention === 'castle' ? 30 : 0) });
            }
        }
    }
    return result.sort((a, b) => b.order - a.order);
}

function negamax(position: Position, depth: number, alpha: number, beta: number, ply: number, budget: SearchBudget, level: number): number {
    checkBudget(budget);
    const terminal = terminalScore(position, ply);
    if (terminal !== null) return terminal;
    checkBudget(budget);
    if (depth === 0) return evaluate(position);
    const moves = candidates(position, budget);
    checkBudget(budget); // Never treat a partially generated move list as an exhaustive search.
    if (moves.length === 0) return evaluate(position); // The server has no stalemate-draw rule.
    // A selective beam bounds the quantum game's unusually large branching factor.
    const width = depth >= 2 ? 8 + level * 3 : moves.length;
    let best = -Infinity;
    for (const candidate of moves.slice(0, width)) {
        const score = -negamax(candidate.next, depth - 1, -beta, -alpha, ply + 1, budget, level);
        best = Math.max(best, score);
        alpha = Math.max(alpha, score);
        if (alpha >= beta) break;
    }
    return best;
}

function decisionNoise(seed: string, move: CpuMove, level: number): number {
    let hash = 2166136261;
    for (const character of `${seed}:${move.pieceId}:${move.toX}:${move.toY}:${move.intention ?? ''}`) {
        hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    }
    return ((hash >>> 0) / 0xffffffff - 0.5) * Math.max(0, 9 - level) * 45;
}

/**
 * Return a MOVE payload without mutating the snapshot. deadline, when supplied, is an
 * absolute Date.now() timestamp and can only shorten the profile's bounded budget.
 * A worker must be terminated by its caller for a strict wall-clock cap: individual
 * authoritative rule calls are synchronous and cannot be interrupted internally.
 */
export function chooseCpuMove(state: PublicGameState, profile: CpuProfile, deadline?: number): CpuMove | null {
    if (state.gameOver || state.introPending || (state.turn !== 0 && state.turn !== 1)) return null;
    const level = Math.max(1, Math.min(9, Math.round(Number.isFinite(profile.level) ? profile.level : 3)));
    const thinkMs = Math.max(1, Math.min(1500, Number.isFinite(profile.thinkMs) ? profile.thinkMs : 140));
    const budget: SearchBudget = {
        deadline: Math.min(Date.now() + thinkMs, Number.isFinite(deadline) ? deadline! : Infinity),
        nodes: 0,
        maxNodes: 1200 + level * 1400,
    };
    if (outOfTime(budget) || checkGameOver(state.pieces)) return null;
    const rootMoves = candidates(state, budget);
    if (rootMoves.length === 0) return null;
    let bestMove = rootMoves[0].move;
    let bestScore = -Infinity;
    const maxDepth = Math.max(1, Math.min(4, Math.round(Number.isFinite(profile.maxDepth) ? profile.maxDepth : 2)));
    const seed = `${state.matchId}:${state.version}:${state.moveCount}`;
    // Iterative deepening keeps the last fully searched iteration when time runs out.
    for (let depth = 1; depth <= maxDepth; depth++) {
        let iterationMove = bestMove;
        let iterationScore = -Infinity;
        let completed = true;
        for (const candidate of rootMoves) {
            try {
                const score = -negamax(candidate.next, depth - 1, -Infinity, Infinity, 1, budget, level)
                    + decisionNoise(seed, candidate.move, level);
                if (score > iterationScore) {
                    iterationScore = score;
                    iterationMove = candidate.move;
                }
            } catch (error) {
                if (error !== STOP) throw error;
                completed = false;
                break;
            }
        }
        if (completed || depth === 1 && iterationScore > -Infinity) {
            bestMove = iterationMove;
            bestScore = iterationScore;
        }
        if (!completed || bestScore > MATE - 1000) break;
        // Search the previous best first to improve pruning in subsequent iterations.
        rootMoves.sort((a, b) => Number(b.move === bestMove) - Number(a.move === bestMove) || b.order - a.order);
    }
    return bestMove;
}
