import type { GameState, Move } from '../types';
import type { Evaluator } from './eval';
import { getConcreteMoveChildren } from './random';
import { isPlayerInCheck } from '../terminal';

export interface TacticalSearchOptions { timeLimitMs?: number; maxDepth?: number; tieBreakSeed?:number; quiescenceDepth?:number; transpositionEntries?:number; playableRoot?: boolean }
export interface TacticalSearchResult { move: Move | null; depth: number; nodes: number; timeMs: number; score: number; cacheHits?:number; quiescenceDepth?: number }
const MATE = 10000;
const TIMEOUT = Symbol('search deadline');

/** Never trust the caller's hash. Quantum identities, captures and last move
 * affect quotas, collapse, castling and en passant even on identical squares. */
export function searchPositionKey(state: GameState): string {
    return JSON.stringify([state.sideToMove, state.winner, state.captured, state.lastMove ?? null,
        state.pieces.map(p => [p.id, p.owner, p.origin.row, p.origin.col, p.position.row, p.position.col,
            p.state, p.alive, p.hasMoved, p.promoted, p.promotedType ?? null])]);
}
const sameMove = (a: Move | undefined, b: Move) => !!a && a.pieceId === b.pieceId &&
    a.target.row === b.target.row && a.target.col === b.target.col &&
    a.chosenType === b.chosenType && a.promotionTarget === b.promotionTarget;
type CacheEntry = { depth:number; extensions:number; score:number; bound:'exact'|'lower'|'upper'; move?:Move };

export function moveTiePriority(move:Move,seed=0) {
    if (!seed) return 0;
    let hash=seed>>>0;
    for (const char of `${move.pieceId}:${move.target.row}:${move.target.col}:${move.chosenType??0}:${move.promotionTarget??0}`) hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
    return hash/4294967296;
}

/** Iterative deepening: retain only fully searched iterations, with capture extensions. */
export function searchBestMove(state: GameState, evaluator: Evaluator, options: TacticalSearchOptions = {}): TacticalSearchResult {
    const start = performance.now();
    const deadline = start + (options.timeLimitMs ?? 4000);
    let nodes = 0;
    let cacheHits = 0;
    const cacheLimit = Math.max(0, Math.min(30000, Math.floor(options.transpositionEntries ?? 0)));
    const table = new Map<string, CacheEntry>();
    const evaluations = new Map<string, number>();
    const staticEvaluation = (s:GameState) => {
        if (!cacheLimit) return evaluator.evaluate(s, s.sideToMove);
        const key = searchPositionKey(s), cached = evaluations.get(key);
        if (cached !== undefined) { cacheHits++; return cached; }
        const score = evaluator.evaluate(s, s.sideToMove);
        if (evaluations.size >= cacheLimit) evaluations.delete(evaluations.keys().next().value!);
        evaluations.set(key, score); return score;
    };
    const checkTime = () => { if (performance.now() >= deadline) throw TIMEOUT; };
    const terminal = (s: GameState, ply: number) => s.winner === 'draw' ? 0 : s.winner === s.sideToMove ? MATE - ply : -MATE + ply;
    const order = (s: GameState, preferred?: Move, rememberRoot = false, generated?: ReturnType<typeof getConcreteMoveChildren>) => {
        const children = [];
        for (const { move, next } of generated ?? getConcreteMoveChildren(s, { allPromotions: true })) {
            checkTime();
            const capture = next.captured.white + next.captured.black > s.captured.white + s.captured.black;
            const previousBest = sameMove(preferred, move);
            const score = next.winner === 'draw' ? 0 : next.winner ? (next.winner === s.sideToMove ? MATE : -MATE) : -staticEvaluation(next);
            if (rememberRoot && (score > bestScore || (score === bestScore && moveTiePriority(move,options.tieBreakSeed)>moveTiePriority(bestMove!,options.tieBreakSeed)))) {
                bestMove=move; bestScore=score;
            }
            children.push({ move, next, capture, score, priority: (previousBest ? 2 * MATE : 0) + score + (capture ? 1 : 0) });
        }
        return children.sort((a, b) => b.priority - a.priority || (s===state ? moveTiePriority(b.move,options.tieBreakSeed)-moveTiePriority(a.move,options.tieBreakSeed) : 0));
    };
    const negamax = (s: GameState, depth: number, alpha: number, beta: number, ply: number, extensions: number): number => {
        checkTime(); nodes++;
        if (s.winner) return terminal(s, ply);
        const key = cacheLimit ? searchPositionKey(s) : '';
        const cached = table.get(key);
        const originalAlpha = alpha, originalBeta = beta;
        if (cached && cached.depth >= depth && cached.extensions >= extensions) {
            cacheHits++;
            if (cached.bound === 'exact') return cached.score;
            if (cached.bound === 'lower') alpha = Math.max(alpha, cached.score);
            else beta = Math.min(beta, cached.score);
            if (alpha >= beta) return cached.score;
        }
        const inCheck = isPlayerInCheck(s.sideToMove, s);
        const staticScore = staticEvaluation(s);
        // Quiescence: don't stop on an unanswered capture or check.
        if (depth <= 0 && !inCheck) {
            if (extensions <= 0 || staticScore >= beta) return staticScore;
            alpha = Math.max(alpha, staticScore);
        }
        if (depth <= 0 && extensions <= 0) return staticScore;
        let children = order(s, cached?.move);
        if (!children.length) return inCheck ? -MATE + ply : 0;
        if (depth <= 0 && !inCheck) children = children.filter(child => {
            if (child.capture || child.next.winner || child.move.promotionTarget) return true;
            // A quiet move can force identities elsewhere or expose the last
            // king. Extend these quantum tactics and checks, with the same cap.
            const chain = child.next.pieces.some((piece, index) => piece.id !== child.move.pieceId &&
                piece.alive && piece.state !== s.pieces[index].state && (piece.state & (piece.state - 1)) === 0);
            return chain || isPlayerInCheck(child.next.sideToMove, child.next);
        });
        let best = depth <= 0 && !inCheck ? staticScore : -Infinity;
        let bestChild: Move | undefined;
        for (const child of children) {
            const score = -negamax(child.next, depth - 1, -beta, -alpha, ply + 1, depth <= 0 ? extensions - 1 : extensions);
            if (score > best) { best = score; bestChild = child.move; }
            alpha = Math.max(alpha, score);
            if (alpha >= beta) break;
        }
        // Never cache an incomplete iteration or a ply-dependent mate distance.
        if (cacheLimit && Math.abs(best) < MATE - 100) {
            if (table.size >= cacheLimit && !table.has(key)) table.delete(table.keys().next().value!);
            table.set(key, { depth, extensions, score:best, move:bestChild,
                bound:best <= originalAlpha ? 'upper' : best >= originalBeta ? 'lower' : 'exact' });
        }
        return best;
    };
    if (state.winner) return { move: null, depth: 0, nodes, timeMs: 0, score: terminal(state, 0) };
    // Always retain a legal fallback even if the budget expires during ordering.
    const legal = getConcreteMoveChildren(state, { allPromotions: true, playable: options.playableRoot });
    let bestMove = legal[0]?.move ?? null;
    let bestScore = 0;
    let completedDepth = 0;
    let completedExtensions = 0;
    if (!bestMove) return { move: null, depth: 0, nodes, timeMs: performance.now() - start, score: isPlayerInCheck(state.sideToMove, state) ? -MATE : 0 };
    bestScore=evaluator.evaluate(legal[0].next,state.sideToMove);
    try {
        const root = order(state,undefined,true,legal);
        bestMove = root[0].move;
        bestScore = root[0].score;
        // A proven win must not be lost to a time limit or sampling noise.
        const winning = root.find(child => child.next.winner === state.sideToMove);
        if (winning) return { move: winning.move, depth: 1, nodes, timeMs: performance.now() - start, score: MATE - 1 };
        const extensionLimit = Math.max(0, Math.min(8, Math.floor(options.quiescenceDepth ?? 2)));
        search: for (let depth = 1; depth <= (options.maxDepth ?? 6); depth++) {
            // Complete a usable shallow iteration before quantum capture/check
            // continuations consume the budget. Then deepen both gradually.
            const extensions = Math.min(depth, extensionLimit);
            for (const extensionPass of depth === 1 && extensions > 0 ? [0, extensions] : [extensions]) {
                let iterationMove = bestMove;
                let iterationScore = -Infinity;
                let alpha = -Infinity;
                // Root children are immutable. Reuse them instead of repeating every
                // candidate-collapse simulation and evaluation on each iteration.
                const ordered = [...root].sort((a,b) => Number(sameMove(bestMove ?? undefined,b.move)) - Number(sameMove(bestMove ?? undefined,a.move)) || b.priority-a.priority);
                for (const child of ordered) {
                    const score = -negamax(child.next, depth - 1, -Infinity, -alpha, 1, extensionPass);
                    if (score > iterationScore) { iterationScore = score; iterationMove = child.move; }
                    alpha = Math.max(alpha, score);
                }
                bestMove = iterationMove; bestScore = iterationScore; completedDepth = depth;
                completedExtensions = extensionPass;
                if (Math.abs(bestScore) >= MATE - 100) break search;
            }
        }
    } catch (error) { if (error !== TIMEOUT) throw error; }
    return { move: bestMove, depth: completedDepth, nodes, timeMs: performance.now() - start, score: bestScore, cacheHits,
        quiescenceDepth: completedExtensions };
}
