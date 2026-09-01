import { GameState } from './types';

// Simple deterministic hash function for Phase 1
// In a real MCTS we would use Zobrist hashing for speed
export function hashState(state: GameState): string {
    const pStr = [...state.pieces]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(p => `${p.id}:${p.alive ? 1 : 0}:${p.position.row},${p.position.col}:${p.state}`)
        .join('|');
    return `${state.sideToMove}|${pStr}`;
}
