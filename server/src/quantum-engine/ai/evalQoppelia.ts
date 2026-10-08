import type { GameState, QuantumPiece } from '../types';
import { PlayerColor, PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING } from '../constants';
import { generateLegalMoves, isBlocked } from '../moveGenerator';
import { deduceMoveTypesGeometry } from '../move';
import type { Evaluator } from './eval';
import { feasibleIdentityMarginals, identityMask, identityEntropy, IDENTITY_TYPES, type IdentityProbabilities } from './identityAllocation';

export interface QoppeliaWeights {
    pieceValue: number;
    originValue: number;
    mobility: number;
    candidateAllocation: number;
    kingCandidate: number;
    safety: number;
    center: number;
}
const VALUES: Record<number, number> = {
    [PIECE_PAWN]: 1, [PIECE_KNIGHT]: 3, [PIECE_BISHOP]: 3,
    [PIECE_ROOK]: 5, [PIECE_QUEEN]: 9, [PIECE_KING]: 0
};
const TYPES = Object.keys(VALUES).map(Number);

export function pieceValue(piece: QuantumPiece): number {
    if (piece.promotedType) return VALUES[piece.promotedType] ?? 0;
    const types = TYPES.filter(type => (piece.state & type) !== 0);
    return types.length ? types.reduce((sum, type) => sum + VALUES[type], 0) / types.length : 0;
}

export class EvalQoppelia implements Evaluator {
    private weights: QoppeliaWeights;
    private allocations = new Map<string,Map<number,IdentityProbabilities>>();
    constructor(weights: Partial<QoppeliaWeights> = {}) {
        this.weights = { pieceValue: 1, originValue: 0.03, mobility: 0.035,
            candidateAllocation: 0.8, kingCandidate: 1.2, safety: 0.7, center: 0, ...weights };
    }

    evaluate(state: GameState, player: PlayerColor): number {
        if (state.winner) return state.winner === 'draw' ? 0 : state.winner === player ? 10000 : -10000;
        const live = state.pieces.filter(p => p.alive);
        const attacks = (attacker: QuantumPiece, target: QuantumPiece) => {
            if (attacker.id === target.id) return false;
            let types = deduceMoveTypesGeometry(attacker.position, target.position, attacker.owner, true, attacker.hasMoved);
            // Castling is never an attack.
            if (Math.abs(target.position.col - attacker.position.col) > 1) types &= ~PIECE_KING;
            if (isBlocked(attacker.position, target.position, live)) types &= PIECE_KNIGHT;
            return (types & (attacker.promotedType ?? attacker.state)) !== 0;
        };
        let score = 0;
        for (const color of ['white', 'black'] as const) {
            const mine = live.filter(p => p.owner === color);
            const theirs = live.filter(p => p.owner !== color);
            const kings = mine.filter(p => (p.state & PIECE_KING) !== 0);
            if (!kings.length) return color === player ? -10000 : 10000;
            const masks=state.pieces.filter(p=>p.owner===color).map(identityMask).sort((a,b)=>a-b);
            const key=masks.join(','),cached=this.allocations.get(key);
            const allocations=cached??feasibleIdentityMarginals(masks);
            if (!cached) {
                if(this.allocations.size>=128) this.allocations.delete(this.allocations.keys().next().value!);
                this.allocations.set(key,allocations);
            }
            const probabilities=(p:QuantumPiece)=>allocations.get(identityMask(p))!;
            const kingRisk=kings.map(p=>probabilities(p)[5]);
            const kingTotal=kingRisk.reduce((sum,p)=>sum+p,0);
            let total = this.weights.kingCandidate * identityEntropy(kingRisk.map(p=>p/kingTotal));
            const turnState = { ...state, sideToMove: color };
            for (const p of mine) {
                const distribution=probabilities(p);
                const value = p.promotedType ? VALUES[p.promotedType]??0 : distribution.reduce((sum,probability,index)=>sum+probability*VALUES[IDENTITY_TYPES[index]],0);
                total += this.weights.pieceValue * value;
                // A confirmed piece has no flexibility bonus; use diminishing returns.
                if (!p.promotedType) total += this.weights.candidateAllocation * identityEntropy(distribution);
                total += this.weights.originValue * (color === 'white' ? 7 - p.position.row : p.position.row);
                // Positional styles favour central activity without exposing a sole king.
                if (p.promotedType !== PIECE_KING && p.state !== PIECE_KING) {
                    total += this.weights.center * (7 - Math.abs(p.position.row - 3.5) - Math.abs(p.position.col - 3.5));
                }
                if (this.weights.mobility) total += this.weights.mobility * generateLegalMoves(turnState, p.id).length;
                if (this.weights.safety && theirs.some(enemy => attacks(enemy, p))) {
                    const defended = mine.some(friend => attacks(friend, p));
                    total -= this.weights.safety * value * (defended ? 0.2 : 0.75);
                    // Exposure matters even before a single king is confirmed.
                    total -= this.weights.safety * 8 * distribution[5];
                    if (kings.length === 1 && kings[0].id === p.id) total -= 12;
                }
            }
            score += color === player ? total : -total;
        }
        return score;
    }
}
