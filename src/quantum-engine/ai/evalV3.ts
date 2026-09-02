import { GameState, QuantumPiece } from '../types';
import { PlayerColor, PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING } from '../constants';
import { hasType } from '../quantum/quantumState';
import { Evaluator } from './eval';

const PIECE_VALUES: Record<number, number> = {
    [PIECE_PAWN]: 1.0,
    [PIECE_KNIGHT]: 3.0,
    [PIECE_BISHOP]: 3.0,
    [PIECE_ROOK]: 5.0,
    [PIECE_QUEEN]: 9.0,
    [PIECE_KING]: 0.0
};

export class EvalV3 implements Evaluator {
    evaluate(state: GameState, player: PlayerColor): number {
        if (state.winner === player) return 99999;
        if (state.winner && state.winner !== 'draw') return -99999;
        if (state.winner === 'draw') return 0;

        let score = 0;
        const KING_CONFIRMED_VALUE = 5000;

        for (const p of state.pieces) {
            if (!p.alive) continue;
            
            let pieceVal = this.getQuantumPieceValue(p);

            // 自玉が確定するのは一番ダメ (ペナルティ)
            if (p.state === PIECE_KING && p.owner === player) {
                pieceVal -= KING_CONFIRMED_VALUE;
            }

            if (p.owner === player) score += pieceVal;
            else score -= pieceVal;
        }

        return score;
    }

    private getQuantumPieceValue(piece: QuantumPiece): number {
        if (piece.promoted && piece.promotedType !== undefined) {
            return PIECE_VALUES[piece.promotedType] || 1.0;
        }

        let maxVal = 0;
        let count = 0;

        const types = [PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING];
        for (const t of types) {
            if (hasType(piece.state, t)) {
                const v = PIECE_VALUES[t];
                if (v > maxVal) maxVal = v;
                count++;
            }
        }

        if (count === 0) return 0;

        const isConfirmed = count === 1;
        const advancement = piece.owner === 'white' ? (7 - piece.position.row) : piece.position.row;

        // 1. 基本の秘匿ボーナス (可能性が多く残っていること自体へのボーナス)
        const hiddenBonus = (count - 1) * 0.5;

        // 2. 前進ボーナス (敵陣へ攻め込むことの評価)
        // ユーザー要望: 「自分の駒の種類を確定させないで敵陣を責めるのが最善」
        // 正体を確定させてしまったコマが前進しても少ししか評価されないが、
        // 未確定（可能性を残した状態）で前進すると非常に高く評価される。
        let positionalBonus = advancement * 0.3;
        if (!isConfirmed) {
            // 未確定のまま進軍すると大きなボーナス (+0.7追加で 合計1.0/マス)
            positionalBonus += advancement * 0.7;
        }

        return maxVal + hiddenBonus + positionalBonus;
    }
}
