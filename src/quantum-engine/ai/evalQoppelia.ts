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

    // 1. Piece Value (Expected value based on superposition probabilities)
    private evalPieceValue(state: GameState, player: PlayerColor): number {
        let score = 0;
        for (const p of state.pieces) {
            if (!p.alive) continue;
            
            let expectedValue = 0;
            let possibleTypesCount = 0;
            const types = [PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING];
            
            for (const t of types) {
                if (hasType(p.state, t)) {
                    expectedValue += PIECE_VALUES[t];
                    possibleTypesCount++;
                }
            }
            
            // Average value of possibilities
            const val = possibleTypesCount > 0 ? (expectedValue / possibleTypesCount) : 0;
            
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
        // Simplified for performance in MCTS
        return 0;
    }

    // 4. Candidate Allocation (Superposition Bonus)
    private evalCandidateAllocation(state: GameState, player: PlayerColor): number {
        let score = 0;
        for (const p of state.pieces) {
            if (!p.alive) continue;
            const c = this.getCount(p.state);
            const flexValue = c * 60; // SUPERPOSITION_BONUS equivalent
            if (p.owner === player) score += flexValue;
            else score -= flexValue;
        }
        return score;
    }

    // 5. King Candidate (Non-linear Ambiguity & Stealth Evaluation)
    private evalKingCandidate(state: GameState, player: PlayerColor): number {
        let whiteKingRevealed = false;
        let blackKingRevealed = false;
        let whiteKingCandidates = 0;
        let blackKingCandidates = 0;

        for (const p of state.pieces) {
            if (!p.alive) continue;
            const isKing = p.state === PIECE_KING;
            const couldBeKing = hasType(p.state, PIECE_KING);

            if (isKing) {
                if (p.owner === 'white') whiteKingRevealed = true;
                else blackKingRevealed = true;
            } else if (couldBeKing) {
                if (p.owner === 'white') whiteKingCandidates++;
                else blackKingCandidates++;
            }
        }

        const getSafetyScore = (candidates: number, revealed: boolean): number => {
            if (candidates === 0 && !revealed) return -99999; // King dead/missing
            if (revealed || candidates === 1) return -1200;   // Fully revealed or only 1 option
            if (candidates === 2) return 300;                 // 50/50 ambiguity
            if (candidates >= 3) return 800;                  // Highly stealthy
            return 0;
        };

        const whiteSafety = getSafetyScore(whiteKingCandidates, whiteKingRevealed);
        const blackSafety = getSafetyScore(blackKingCandidates, blackKingRevealed);

        let score = whiteSafety - blackSafety;
        return player === 'white' ? score : -score;
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
