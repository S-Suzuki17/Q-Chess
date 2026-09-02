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

        // 【修正点】
        // 以前は (maxVal * 0.7) + (avgVal * 0.3) だったため、
        // 「可能性（count）が減るほど、平均値が上がり、評価値が高くなる」というバグがあった。
        // これにより、AIは自分のコマの正体をわざと明かして評価値を稼ごうとしていた。
        //
        // 【新しい評価ロジック】
        // コマの価値は「最大ポテンシャル（maxVal）」をベースとする。
        // さらに、「正体が隠されている（countが多い）ほど価値が高い」とする。
        // 1つの正体につき +0.5 の「秘匿ボーナス」を与える。
        const hiddenBonus = (count - 1) * 0.5;

        return maxVal + hiddenBonus;
    }
}
