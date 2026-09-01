import { Token } from './GameEngine';
import { IdentityPool } from './IdentityPool';
import { PieceType } from '../config/gameConfig';
import { legacyToQuantumState, quantumToLegacyMove } from '../quantum-engine/adapter';
import { getRandomMove, getGreedyMove } from '../quantum-engine/ai';

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
    } else {
        qMove = getGreedyMove(qState);
    }

    if (!qMove) return null;

    return quantumToLegacyMove(qMove);
}
