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
        // Level 1: Random Move
        qMove = getRandomMove(qState);
    } else if (level === 2) {
        // Level 2: Greedy (Immediate material gain)
        qMove = getGreedyMove(qState);
    } else {
        // Level 3-5: MCTS Engine with varying time budgets
        let timeBudget = 500;
        if (level === 4) timeBudget = 1500;
        if (level === 5) timeBudget = 3000;

        const evaluator = new EvalV0();
        const mcts = new MCTSEngine(evaluator, { timeLimitMs: timeBudget, maxIterations: 20000 });
        const stats = mcts.search(qState, { timeLimitMs: timeBudget });
        console.log(`[CPU Level ${level}] MCTS Stats: ${stats.iterations} iters, ${stats.maxDepth} depth, ${stats.nodesPerSec.toFixed(1)} nps`);
        qMove = stats.move;
    }

    if (!qMove) return null;

    return quantumToLegacyMove(qMove, qState);
}
