const fs = require('fs');
const content = \import { Token, deduceMoveTypes, isPlayerInCheck, isCheckmate } from './GameEngine';
import { IdentityPool } from './IdentityPool';
import { PieceType } from '../config/gameConfig';

export interface AIMove {
    tokenId: string;
    targetRow: number;
    targetCol: number;
    possibleTypes: PieceType[];
    promotedTo?: PieceType;
}

const PIECE_VALUES = { King: 1000, Queen: 90, Rook: 50, Bishop: 30, Knight: 30, Pawn: 10 };

function getExpectedValue(token: Token, pool: IdentityPool): number {
    let expected = 0;
    let totalProb = 0;
    const probs = token.probabilities || {};
    for (const [type, prob] of Object.entries(probs)) {
        expected += PIECE_VALUES[type as keyof typeof PIECE_VALUES] * (prob as number);
        totalProb += (prob as number);
    }
    return totalProb > 0 ? expected / totalProb : 0;
}

function evaluateState(tokens: Token[], pool: IdentityPool, cpuPlayer: 'white' | 'black'): number {
    const opponent = cpuPlayer === 'white' ? 'black' : 'white';
    let myTotalAmbiguity = 0;
    const myKingCandidates: Token[] = [];
    let enemyTotalAmbiguity = 0;
    const enemyKingCandidates: Token[] = [];
    let myMaterial = 0;
    let enemyMaterial = 0;

    for (const t of tokens) {
        if (t.isCaptured) continue;
        const p = pool.piecePossibilities.get(t.id);
        if (!p) continue;

        if (t.player === cpuPlayer) {
            myTotalAmbiguity += p.size;
            myMaterial += getExpectedValue(t, pool);
            if (p.has('King')) myKingCandidates.push(t);
        } else {
            enemyTotalAmbiguity += p.size;
            enemyMaterial += getExpectedValue(t, pool);
            if (p.has('King')) enemyKingCandidates.push(t);
        }
    }

    let score = 0;
    score += myTotalAmbiguity * 15;
    score -= enemyTotalAmbiguity * 20;

    score += myKingCandidates.length * 50;
    score -= enemyKingCandidates.length * 100;

    if (myKingCandidates.length > 1) {
        const avgCol = myKingCandidates.reduce((sum, k) => sum + k.col, 0) / myKingCandidates.length;
        const variance = myKingCandidates.reduce((sum, k) => sum + Math.pow(k.col - avgCol, 2), 0);
        score += variance * 5;
    }

    score += (myMaterial - enemyMaterial) * 0.5;

    if (isPlayerInCheck(opponent, tokens, pool)) {
        score += 200;
        if (isCheckmate(opponent, tokens, pool)) score += 100000;
    }
    
    if (isPlayerInCheck(cpuPlayer, tokens, pool)) {
        score -= 200;
        if (isCheckmate(cpuPlayer, tokens, pool)) score -= 100000;
    }

    return score;
}

function getValidMoves(tokens: Token[], pool: IdentityPool, player: 'white' | 'black'): AIMove[] {
    const validMoves: AIMove[] = [];
    for (const token of tokens.filter(t => t.player === player && !t.isCaptured)) {
        const possibilities = pool.piecePossibilities.get(token.id);
        if (!possibilities || possibilities.size === 0) continue;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (token.row === r && token.col === c) continue;
                if (tokens.some(t => !t.isCaptured && t.row === r && t.col === c && t.player === player)) continue;
                const moveTypes = deduceMoveTypes(token, r, c, tokens);
                const validTypesForMove = moveTypes.filter(mt => possibilities.has(mt));
                if (validTypesForMove.length > 0) {
                    const isPromotion = validTypesForMove.includes('Pawn') && ((player === 'white' && r === 0) || (player === 'black' && r === 7));
                    validMoves.push({
                        tokenId: token.id,
                        targetRow: r,
                        targetCol: c,
                        possibleTypes: validTypesForMove,
                        promotedTo: isPromotion ? 'Queen' : undefined
                    });
                }
            }
        }
    }
    return validMoves;
}

function applyMoveAndResolve(tokens: Token[], pool: IdentityPool, move: AIMove) {
    const clonedPool = pool.clone();
    clonedPool.restrictIdentity(move.tokenId, move.possibleTypes);
    const targetToken = tokens.find(t => !t.isCaptured && t.row === move.targetRow && t.col === move.targetCol);
    
    const simTokens = tokens.map(t => {
        if (t.id === move.tokenId) return { ...t, row: move.targetRow, col: move.targetCol, promotedTo: move.promotedTo || t.promotedTo };
        if (t.id === targetToken?.id) {
            const p = clonedPool.piecePossibilities.get(t.id);
            if (p) p.delete('King');
            return { ...t, isCaptured: true, row: -1, col: -1 }; 
        }
        return t;
    });
    
    return { nextTokens: simTokens, nextPool: clonedPool };
}

export function calculateDeepMove(level: number, tokens: Token[], pool: IdentityPool, cpuPlayer: 'white' | 'black' = 'black'): AIMove | null {
    const opponent = cpuPlayer === 'white' ? 'black' : 'white';
    const timeoutMs = level === 5 ? 8000 : 1000;
    const startTime = Date.now();
    
    const moves = getValidMoves(tokens, pool, cpuPlayer);
    if (moves.length === 0) return null;
    
    let globalBestMove: AIMove | null = null;
    let currentDepth = 1;
    
    moves.sort((a, b) => {
        const aTarget = tokens.some(t => !t.isCaptured && t.row === a.targetRow && t.col === a.targetCol) ? 1 : 0;
        const bTarget = tokens.some(t => !t.isCaptured && t.row === b.targetRow && t.col === b.targetCol) ? 1 : 0;
        return bTarget - aTarget || Math.random() - 0.5;
    });

    const alphaBeta = (depth: number, alpha: number, beta: number, isMaximizingPlayer: boolean, currentTokens: Token[], currentPool: IdentityPool): number => {
        if (Date.now() - startTime > timeoutMs) return isMaximizingPlayer ? -Infinity : Infinity; 
        
        if (depth === 0) {
            return evaluateState(currentTokens, currentPool, cpuPlayer);
        }

        const currentPlayer = isMaximizingPlayer ? cpuPlayer : opponent;
        const nextMoves = getValidMoves(currentTokens, currentPool, currentPlayer);
        
        nextMoves.sort((a, b) => {
            const aTarget = currentTokens.some(t => !t.isCaptured && t.row === a.targetRow && t.col === a.targetCol) ? 1 : 0;
            const bTarget = currentTokens.some(t => !t.isCaptured && t.row === b.targetRow && t.col === b.targetCol) ? 1 : 0;
            return bTarget - aTarget;
        });

        if (nextMoves.length === 0) {
            return evaluateState(currentTokens, currentPool, cpuPlayer);
        }

        if (isMaximizingPlayer) {
            let maxEval = -Infinity;
            for (const move of nextMoves) {
                const { nextTokens: simTokens, nextPool: simPool } = applyMoveAndResolve(currentTokens, currentPool, move);
                if (!simPool.resolveGlobalConstraints(simTokens)) continue;
                if (isPlayerInCheck(currentPlayer, simTokens, simPool)) continue;
                
                const evalScore = alphaBeta(depth - 1, alpha, beta, false, simTokens, simPool);
                maxEval = Math.max(maxEval, evalScore);
                alpha = Math.max(alpha, evalScore);
                if (beta <= alpha) break;
            }
            return maxEval === -Infinity ? evaluateState(currentTokens, currentPool, cpuPlayer) : maxEval;
        } else {
            let minEval = Infinity;
            for (const move of nextMoves) {
                const { nextTokens: simTokens, nextPool: simPool } = applyMoveAndResolve(currentTokens, currentPool, move);
                if (!simPool.resolveGlobalConstraints(simTokens)) continue;
                if (isPlayerInCheck(currentPlayer, simTokens, simPool)) continue;
                
                const evalScore = alphaBeta(depth - 1, alpha, beta, true, simTokens, simPool);
                minEval = Math.min(minEval, evalScore);
                beta = Math.min(beta, evalScore);
                if (beta <= alpha) break;
            }
            return minEval === Infinity ? evaluateState(currentTokens, currentPool, cpuPlayer) : minEval;
        }
    };

    while (Date.now() - startTime < timeoutMs && currentDepth <= 3) {
        let currentBestMove: AIMove | null = null;
        let currentBestScore = -Infinity;
        let alpha = -Infinity;
        let beta = Infinity;
        
        let completed = true;
        
        for (const move of moves) {
            const { nextTokens: simTokens, nextPool: simPool } = applyMoveAndResolve(tokens, pool, move);
            if (!simPool.resolveGlobalConstraints(simTokens)) continue;
            if (isPlayerInCheck(cpuPlayer, simTokens, simPool)) continue;
            
            const score = alphaBeta(currentDepth - 1, alpha, beta, false, simTokens, simPool);
            
            if (Date.now() - startTime > timeoutMs) {
                completed = false;
                break;
            }
            
            if (score > currentBestScore) {
                currentBestScore = score;
                currentBestMove = move;
            }
            alpha = Math.max(alpha, score);
        }
        
        if (completed && currentBestMove) {
            globalBestMove = currentBestMove;
            moves.splice(moves.indexOf(currentBestMove), 1);
            moves.unshift(currentBestMove);
        }
        currentDepth++;
    }

    if (!globalBestMove && moves.length > 0) {
        return moves[0];
    }

    return globalBestMove;
}\;
fs.writeFileSync('src/lib/ServerAIEngine.ts', content);
