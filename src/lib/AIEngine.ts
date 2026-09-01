import { Token } from './GameEngine';
import { IdentityPool } from './IdentityPool';
import { PieceType } from '../config/gameConfig';
import { legacyToQuantumState, quantumToLegacyMove } from '../quantum-engine/adapter';
import { getRandomMove, getGreedyMove, MCTSEngine, EvalV0 } from '../quantum-engine/ai';

export interface AIMove {
    tokenId: string;
    targetRow: number;
    targetCol: number;
    possibleTypes: PieceType[];
    promotedTo?: PieceType;
}

export function calculateCPUMove(level: number, tokens: Token[], pool: IdentityPool, cpuPlayer: 'white' | 'black' = 'black'): AIMove | null {
    const qState = legacyToQuantumState(tokens, pool, cpuPlayer);
    
    let qMove = null;
    if (level === 1) {
        qMove = getRandomMove(qState);
    } else if (level === 2 || level === 3) {
        qMove = getGreedyMove(qState);
    } else {
        const evaluator = new EvalV0();
        const mcts = new MCTSEngine(evaluator, { timeLimitMs: 1500, maxIterations: 10000 });
        const stats = mcts.search(qState, { timeLimitMs: 1500 });
        qMove = stats.move;
    }

    if (!qMove) return null;

    return quantumToLegacyMove(qMove);
}
