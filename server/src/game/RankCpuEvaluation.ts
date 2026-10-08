import type { Piece, PublicGameState } from './GameEngine';
import type { GameState } from '../quantum-engine/types';
import { EvalQoppelia } from '../quantum-engine/ai/evalQoppelia';
import { PERSONALITY_WEIGHTS, type CPUPersonality } from '../quantum-engine/ai/personalities';

const TYPE_BITS: Record<string, number> = { P: 1, N: 2, B: 4, R: 8, Q: 16, K: 32 };
const evaluators = new Map<CPUPersonality, EvalQoppelia>();

/** Evaluation only. Ranked move simulation and terminal adjudication stay in
 * quantumChess; this maps its coordinates, captured quotas and original Pawns. */
export function rankedEvaluationState(position: Pick<PublicGameState, 'pieces' | 'turn'>): GameState {
    const identity = (piece: Piece) => piece.possibilities.reduce((mask, type) => {
        if (!TYPE_BITS[type]) throw new Error('Invalid ranked identity');
        return mask | TYPE_BITS[type];
    }, 0);
    return {
        pieces: position.pieces.map(piece => {
            const mask = identity(piece), square = { row: 7 - piece.y, col: piece.x };
            return { id: String(piece.id), owner: piece.team === 0 ? 'white' : 'black',
                origin: square, position: square, state: piece.promoted ? TYPE_BITS.P : mask,
                promoted: !!piece.promoted, ...(piece.promoted ? { promotedType: mask } : {}),
                alive: !piece.captured, hasMoved: !!piece.hasMoved };
        }),
        sideToMove: position.turn === 0 ? 'white' : 'black', ply: 0, hash: '', winner: null,
        captured: { white: position.pieces.filter(p => p.team === 1 && p.captured).length,
            black: position.pieces.filter(p => p.team === 0 && p.captured).length },
    };
}

export function evaluateRankedCandidates(position: Pick<PublicGameState, 'pieces' | 'turn'>, personality: CPUPersonality): number {
    let evaluator = evaluators.get(personality);
    if (!evaluator) {
        evaluator = new EvalQoppelia(PERSONALITY_WEIGHTS[personality]);
        evaluators.set(personality, evaluator);
    }
    const state = rankedEvaluationState(position);
    return 100 * evaluator.evaluate(state, state.sideToMove);
}
