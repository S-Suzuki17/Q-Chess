import { Token } from './GameEngine';
import { IdentityPool } from './IdentityPool';
import { PieceType } from '../config/gameConfig';
import { legacyToQuantumState, quantumToLegacyMove } from '../quantum-engine/adapter';
import { EvalQoppelia } from '../quantum-engine/ai/evalQoppelia';
import { searchBestMove } from '../quantum-engine/ai/search';
import type { MoveRecord } from './gameRecordService';

export interface AIMove {
    tokenId: string;
    targetRow: number;
    targetCol: number;
    possibleTypes: PieceType[];
    promotedTo?: PieceType;
}

export function calculateCPUMove(tokens: Token[], pool: IdentityPool, cpuPlayer: 'white' | 'black' = 'black', ply: number = 0, lastMove: MoveRecord | null = null): AIMove | null {
    const qState = legacyToQuantumState(tokens, pool, cpuPlayer, ply, lastMove);
    
    const stats = searchBestMove(qState, new EvalQoppelia(), { timeLimitMs: 4000, maxDepth: 6 });
    console.info(`[CPU] completed depth ${stats.depth}, ${stats.nodes} nodes, ${stats.timeMs.toFixed(0)} ms`);
    const qMove = stats.move;

    if (!qMove) return null;

    return quantumToLegacyMove(qMove, qState);
}
