import { Token, deduceMoveTypes, isPlayerInCheck, isCheckmate } from './GameEngine';
import { IdentityPool } from './IdentityPool';
import { PieceType } from '../config/gameConfig';


function isValidMove(player: 'white'|'black', simTokens: Token[], pool: IdentityPool): boolean {
    const opponent = player === 'white' ? 'black' : 'white';
    const opponentHasKing = simTokens.some(t => t.player === opponent && !t.isCaptured && pool.piecePossibilities.get(t.id)?.has('King'));
    if (!opponentHasKing) return true; // Capturing the king is always valid and wins the game!
    return !isPlayerInCheck(player, simTokens, pool);
}

export interface AIMove {
    tokenId: string;
    targetRow: number;
    targetCol: number;
    possibleTypes: PieceType[];
    promotedTo?: PieceType;
}

const PIECE_VALUES = { King: 1000, Queen: 90, Rook: 50, Bishop: 30, Knight: 30, Pawn: 10 };

function getMaxValue(token: Token, pool: IdentityPool): number {
    let maxVal = 0;
    const p = pool.piecePossibilities.get(token.id);
    if (!p) return 0;
    for (const type of p) {
        maxVal = Math.max(maxVal, PIECE_VALUES[type as keyof typeof PIECE_VALUES]);
    }
    return maxVal;
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
            myMaterial += getMaxValue(t, pool);
            if (p.has('King')) myKingCandidates.push(t);
        } else {
            enemyTotalAmbiguity += p.size;
            enemyMaterial += getMaxValue(t, pool);
            if (p.has('King')) enemyKingCandidates.push(t);
        }
    }

    if (myKingCandidates.length === 0) return -999999;
    if (enemyKingCandidates.length === 0) return 999999;

    let score = 0;
    score += myTotalAmbiguity * 40;
    score -= enemyTotalAmbiguity * 50;

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
    
    let simTokens = tokens.map(t => {
        if (t.id === move.tokenId) return { ...t, row: move.targetRow, col: move.targetCol, promotedTo: move.promotedTo || t.promotedTo };
        if (t.id === targetToken?.id) {
            const p = clonedPool.piecePossibilities.get(t.id);
            if (p) p.delete('King');
            return { ...t, isCaptured: true, row: -1, col: -1 }; 
        }
        return t;
    });

    // En Passant capture: if pawn moves diagonally to empty square, capture the pawn behind
    if (!targetToken && move.possibleTypes.includes('Pawn')) {
        const movingToken = tokens.find(t => t.id === move.tokenId);
        if (movingToken) {
            const dc = Math.abs(move.targetCol - movingToken.col);
            if (dc === 1) {
                // Diagonal pawn move to empty square = en passant
                const epTarget = simTokens.find(t => !t.isCaptured && t.row === movingToken.row && t.col === move.targetCol && t.player !== movingToken.player);
                if (epTarget) {
                    simTokens = simTokens.map(t => t.id === epTarget.id ? { ...t, isCaptured: true, row: -1, col: -1 } : t);
                }
            }
        }
    }
    
    return { nextTokens: simTokens, nextPool: clonedPool };
}

export function calculateDeepMove(level: number, tokens: Token[], pool: IdentityPool, cpuPlayer: 'white' | 'black' = 'black', timeControl: string = '10m'): AIMove | null {
    const opponent = cpuPlayer === 'white' ? 'black' : 'white';
    let timeoutMs = 1000;
    if (level === 5) {
        timeoutMs = timeControl === '10s' ? 2000 : 8000;
    }
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

    
    const quiescence = (alpha: number, beta: number, isMaximizingPlayer: boolean, currentTokens: Token[], currentPool: IdentityPool): number => {
        if (Date.now() - startTime > timeoutMs) return isMaximizingPlayer ? -Infinity : Infinity; 
        
        const standPat = evaluateState(currentTokens, currentPool, cpuPlayer);
        
        if (isMaximizingPlayer) {
            if (standPat >= beta) return beta;
            alpha = Math.max(alpha, standPat);
        } else {
            if (standPat <= alpha) return alpha;
            beta = Math.min(beta, standPat);
        }

        const currentPlayer = isMaximizingPlayer ? cpuPlayer : opponent;
        const nextMoves = getValidMoves(currentTokens, currentPool, currentPlayer).filter(m => 
            currentTokens.some(t => !t.isCaptured && t.row === m.targetRow && t.col === m.targetCol)
        );

        if (nextMoves.length === 0) return standPat;

        if (isMaximizingPlayer) {
            let maxEval = standPat;
            for (const move of nextMoves) {
                const { nextTokens: simTokens, nextPool: simPool } = applyMoveAndResolve(currentTokens, currentPool, move);
                if (!simPool.resolveGlobalConstraints(simTokens)) continue;
                if (!isValidMove(currentPlayer, simTokens, simPool)) continue;
                
                const evalScore = quiescence(alpha, beta, false, simTokens, simPool);
                maxEval = Math.max(maxEval, evalScore);
                alpha = Math.max(alpha, evalScore);
                if (beta <= alpha) break;
            }
            return maxEval;
        } else {
            let minEval = standPat;
            for (const move of nextMoves) {
                const { nextTokens: simTokens, nextPool: simPool } = applyMoveAndResolve(currentTokens, currentPool, move);
                if (!simPool.resolveGlobalConstraints(simTokens)) continue;
                if (!isValidMove(currentPlayer, simTokens, simPool)) continue;
                
                const evalScore = quiescence(alpha, beta, true, simTokens, simPool);
                minEval = Math.min(minEval, evalScore);
                beta = Math.min(beta, evalScore);
                if (beta <= alpha) break;
            }
            return minEval;
        }
    };

const alphaBeta = (depth: number, alpha: number, beta: number, isMaximizingPlayer: boolean, currentTokens: Token[], currentPool: IdentityPool): number => {
        if (Date.now() - startTime > timeoutMs) return isMaximizingPlayer ? -Infinity : Infinity; 
        
        if (depth === 0) {
            return quiescence(alpha, beta, isMaximizingPlayer, currentTokens, currentPool);
        }

        const currentPlayer = isMaximizingPlayer ? cpuPlayer : opponent;
        const nextMoves = getValidMoves(currentTokens, currentPool, currentPlayer);
        
        nextMoves.sort((a, b) => {
            const aTarget = currentTokens.some(t => !t.isCaptured && t.row === a.targetRow && t.col === a.targetCol) ? 1 : 0;
            const bTarget = currentTokens.some(t => !t.isCaptured && t.row === b.targetRow && t.col === b.targetCol) ? 1 : 0;
            return bTarget - aTarget;
        });

        if (nextMoves.length === 0) {
            return quiescence(alpha, beta, isMaximizingPlayer, currentTokens, currentPool);
        }

        if (isMaximizingPlayer) {
            let maxEval = -Infinity;
            for (const move of nextMoves) {
                const { nextTokens: simTokens, nextPool: simPool } = applyMoveAndResolve(currentTokens, currentPool, move);
                if (!simPool.resolveGlobalConstraints(simTokens)) continue;
                if (!isValidMove(currentPlayer, simTokens, simPool)) continue;
                
                const evalScore = alphaBeta(depth - 1, alpha, beta, false, simTokens, simPool);
                maxEval = Math.max(maxEval, evalScore);
                alpha = Math.max(alpha, evalScore);
                if (beta <= alpha) break;
            }
            return maxEval === -Infinity ? quiescence(alpha, beta, isMaximizingPlayer, currentTokens, currentPool) : maxEval;
        } else {
            let minEval = Infinity;
            for (const move of nextMoves) {
                const { nextTokens: simTokens, nextPool: simPool } = applyMoveAndResolve(currentTokens, currentPool, move);
                if (!simPool.resolveGlobalConstraints(simTokens)) continue;
                if (!isValidMove(currentPlayer, simTokens, simPool)) continue;
                
                const evalScore = alphaBeta(depth - 1, alpha, beta, true, simTokens, simPool);
                minEval = Math.min(minEval, evalScore);
                beta = Math.min(beta, evalScore);
                if (beta <= alpha) break;
            }
            return minEval === Infinity ? quiescence(alpha, beta, isMaximizingPlayer, currentTokens, currentPool) : minEval;
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
            if (!isValidMove(cpuPlayer, simTokens, simPool)) continue;
            
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
        
        if (currentBestMove) {
            globalBestMove = currentBestMove;
            if (completed) {
                moves.splice(moves.indexOf(currentBestMove), 1);
                moves.unshift(currentBestMove);
            }
        }
        currentDepth++;
    }

    if (!globalBestMove && moves.length > 0) {
        return moves[0];
    }

    return globalBestMove;
}
