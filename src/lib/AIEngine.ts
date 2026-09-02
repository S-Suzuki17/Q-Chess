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
    
    // CPU level is locked to MAX power for all difficulties
    const timeBudget = 4000; // 4 seconds max
    const evaluator = new EvalV0();
    const mcts = new MCTSEngine(evaluator, { timeLimitMs: timeBudget, maxIterations: 100000 });
    const stats = mcts.search(qState, { timeLimitMs: timeBudget });
    console.log(`[CPU MAX MODE] MCTS Stats: ${stats.iterations} iters, ${stats.maxDepth} depth, ${stats.nodesPerSec.toFixed(1)} nps`);
    const qMove = stats.move;

    if (!qMove) return null;

    return quantumToLegacyMove(qMove, qState);
}
