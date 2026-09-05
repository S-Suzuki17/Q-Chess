import type { GameState, Move } from '../types';
import type { Evaluator } from './eval';
import { getAllConcreteMoves } from './random';
import { applyMove } from '../stateTransition';
import { isPlayerInCheck } from '../terminal';

export interface TacticalSearchOptions { timeLimitMs?: number; maxDepth?: number }
export interface TacticalSearchResult { move: Move | null; depth: number; nodes: number; timeMs: number; score: number }
const MATE = 10000;
const TIMEOUT = Symbol('search deadline');

/** Iterative deepening: retain only fully searched iterations, with capture extensions. */
export function searchBestMove(state: GameState, evaluator: Evaluator, options: TacticalSearchOptions = {}): TacticalSearchResult {
    const start = performance.now();
    const deadline = start + (options.timeLimitMs ?? 4000);
    let nodes = 0;
    const checkTime = () => { if (performance.now() >= deadline) throw TIMEOUT; };
    const terminal = (s: GameState, ply: number) => s.winner === 'draw' ? 0 : s.winner === s.sideToMove ? MATE - ply : -MATE + ply;
    const order = (s: GameState, preferred?: Move) => {
        const children = [];
        for (const move of getAllConcreteMoves(s)) {
            checkTime();
            const next = applyMove(s, move);
            const capture = next.captured.white + next.captured.black > s.captured.white + s.captured.black;
            const previousBest = preferred?.pieceId === move.pieceId && preferred.target.row === move.target.row &&
                preferred.target.col === move.target.col && preferred.chosenType === move.chosenType;
            const score = next.winner ? (next.winner === s.sideToMove ? MATE : -MATE) : evaluator.evaluate(next, s.sideToMove);
            children.push({ move, next, capture, score, priority: (previousBest ? 2 * MATE : 0) + score + (capture ? 1 : 0) });
        }
        return children.sort((a, b) => b.priority - a.priority);
    };
    const negamax = (s: GameState, depth: number, alpha: number, beta: number, ply: number, extensions: number): number => {
        checkTime(); nodes++;
        if (s.winner) return terminal(s, ply);
        const inCheck = isPlayerInCheck(s.sideToMove, s);
        const staticScore = evaluator.evaluate(s, s.sideToMove);
        // Quiescence: don't stop on an unanswered capture or check.
        if (depth <= 0 && !inCheck) {
            if (extensions <= 0 || staticScore >= beta) return staticScore;
            alpha = Math.max(alpha, staticScore);
        }
        if (depth <= 0 && extensions <= 0) return staticScore;
        let children = order(s);
        if (!children.length) return inCheck ? -MATE + ply : 0;
        if (depth <= 0 && !inCheck) children = children.filter(child => child.capture || child.next.winner);
        let best = depth <= 0 && !inCheck ? staticScore : -Infinity;
        for (const child of children) {
            const score = -negamax(child.next, depth - 1, -beta, -alpha, ply + 1, depth <= 0 ? extensions - 1 : extensions);
            best = Math.max(best, score); alpha = Math.max(alpha, score);
            if (alpha >= beta) break;
        }
        return best;
    };
    if (state.winner) return { move: null, depth: 0, nodes, timeMs: 0, score: terminal(state, 0) };
    // Always retain a legal fallback even if the budget expires during ordering.
    const legal = getAllConcreteMoves(state);
    let bestMove = legal[0] ?? null;
    let bestScore = -Infinity;
    let completedDepth = 0;
    if (!bestMove) return { move: null, depth: 0, nodes, timeMs: performance.now() - start, score: isPlayerInCheck(state.sideToMove, state) ? -MATE : 0 };
    try {
        const root = order(state);
        bestMove = root[0].move;
        bestScore = root[0].score;
        // A proven win must not be lost to a time limit or sampling noise.
        const winning = root.find(child => child.next.winner === state.sideToMove);
        if (winning) return { move: winning.move, depth: 1, nodes, timeMs: performance.now() - start, score: MATE - 1 };
        for (let depth = 1; depth <= (options.maxDepth ?? 6); depth++) {
            let iterationMove = bestMove;
            let iterationScore = -Infinity;
            let alpha = -Infinity;
            const ordered = order(state, bestMove);
            for (const child of ordered) {
                const score = -negamax(child.next, depth - 1, -Infinity, -alpha, 1, 2);
                if (score > iterationScore) { iterationScore = score; iterationMove = child.move; }
                alpha = Math.max(alpha, score);
            }
            bestMove = iterationMove; bestScore = iterationScore; completedDepth = depth;
            if (Math.abs(bestScore) >= MATE - 100) break;
        }
    } catch (error) { if (error !== TIMEOUT) throw error; }
    return { move: bestMove, depth: completedDepth, nodes, timeMs: performance.now() - start, score: bestScore };
}
