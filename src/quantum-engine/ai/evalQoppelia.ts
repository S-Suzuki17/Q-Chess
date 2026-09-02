import { GameState, QuantumPiece } from '../types';
import { PlayerColor, PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING } from '../constants';
import { hasType } from '../quantum/quantumState';
import { generateLegalMoves } from '../moveGenerator';
import { Evaluator } from './eval';

export interface QoppeliaWeights {
    pieceValue: number;
    originValue: number;
    mobility: number;
    candidateAllocation: number;
    kingCandidate: number;
}

const PIECE_VALUES: Record<number, number> = {
    [PIECE_PAWN]: 1.0,
    [PIECE_KNIGHT]: 3.0,
    [PIECE_BISHOP]: 3.0,
    [PIECE_ROOK]: 5.0,
    [PIECE_QUEEN]: 9.0,
    [PIECE_KING]: 0.0 // Handled by kingCandidate and terminal states
};

export class EvalQoppelia implements Evaluator {
    private weights: QoppeliaWeights;

    constructor(weights: Partial<QoppeliaWeights> = {}) {
        this.weights = {
            pieceValue: weights.pieceValue ?? 1.0,
            originValue: weights.originValue ?? 0.0,
            mobility: weights.mobility ?? 0.0,
            candidateAllocation: weights.candidateAllocation ?? 0.0,
            kingCandidate: weights.kingCandidate ?? 0.0
        };
    }

    private getCount(state: number): number {
        let c = 0;
        const types = [PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING];
        for (const t of types) if (hasType(state, t)) c++;
        return c;
    }

    private getMaxVal(state: number): number {
        let maxVal = 0;
        const types = [PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING];
        for (const t of types) {
            if (hasType(state, t)) {
                if (PIECE_VALUES[t] > maxVal) maxVal = PIECE_VALUES[t];
            }
        }
        return maxVal;
    }

    // 1. Piece Value (Base material logic considering quantum superposition)
    private evalPieceValue(state: GameState, player: PlayerColor): number {
        let score = 0;
        for (const p of state.pieces) {
            if (!p.alive) continue;
            const val = this.getMaxVal(p.state); // Baseline greedy valuation
            if (p.owner === player) score += val;
            else score -= val;
        }
        return score;
    }

    // 2. Origin Value (Positional value based on advancement)
    private evalOriginValue(state: GameState, player: PlayerColor): number {
        let score = 0;
        for (const p of state.pieces) {
            if (!p.alive) continue;
            const advancement = p.owner === 'white' ? (7 - p.position.row) : p.position.row;
            if (p.owner === player) score += advancement;
            else score -= advancement;
        }
        return score;
    }

    // 3. Mobility (Number of legal moves available)
    private evalMobility(state: GameState, player: PlayerColor): number {
        let score = 0;
        
        // Evaluate for current side to move
        for (const p of state.pieces) {
            if (!p.alive || p.owner !== state.sideToMove) continue;
            const movesCount = generateLegalMoves(state, p.id).length;
            if (p.owner === player) score += movesCount;
            else score -= movesCount;
        }
        
        // Temporarily swap sideToMove to evaluate opponent mobility
        const tempState = { ...state, sideToMove: state.sideToMove === 'white' ? 'black' as PlayerColor : 'white' as PlayerColor };
        for (const p of tempState.pieces) {
            if (!p.alive || p.owner !== tempState.sideToMove) continue;
            const movesCount = generateLegalMoves(tempState, p.id).length;
            if (p.owner === player) score += movesCount;
            else score -= movesCount;
        }

        return score;
    }

    // 4. Candidate Allocation (How flexible the pieces are)
    private evalCandidateAllocation(state: GameState, player: PlayerColor): number {
        let score = 0;
        for (const p of state.pieces) {
            if (!p.alive) continue;
            const c = this.getCount(p.state);
            // Non-linear allocation bonus: Count 6 is incredibly valuable. Count 1 or 2 is poor.
            // Using a simple square or cubic scale gives massive bonus to high candidates.
            const flexValue = c * c; 
            if (p.owner === player) score += flexValue;
            else score -= flexValue;
        }
        return score;
    }

    // 5. King Candidate (Safety and presence of King possibilities)
    private evalKingCandidate(state: GameState, player: PlayerColor): number {
        let score = 0;
        for (const p of state.pieces) {
            if (!p.alive) continue;
            if (hasType(p.state, PIECE_KING)) {
                if (p.owner === player) score += 1.0;
                else score -= 1.0;
            }
        }
        return score;
    }

    evaluate(state: GameState, player: PlayerColor): number {
        if (state.winner === player) return 99999;
        if (state.winner && state.winner !== 'draw') return -99999;
        if (state.winner === 'draw') return 0;

        let total = 0;
        
        if (this.weights.pieceValue > 0) total += this.weights.pieceValue * this.evalPieceValue(state, player);
        if (this.weights.originValue > 0) total += this.weights.originValue * this.evalOriginValue(state, player);
        if (this.weights.mobility > 0) total += this.weights.mobility * this.evalMobility(state, player);
        if (this.weights.candidateAllocation > 0) total += this.weights.candidateAllocation * this.evalCandidateAllocation(state, player);
        if (this.weights.kingCandidate > 0) total += this.weights.kingCandidate * this.evalKingCandidate(state, player);

        return total;
    }
}
