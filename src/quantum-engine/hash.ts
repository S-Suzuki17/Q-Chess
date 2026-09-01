import { GameState } from './types';

export function hashState(state: GameState): string {
    const pStr = [...state.pieces]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(p => `${p.id}:${p.alive ? 1 : 0}:${p.position.row},${p.position.col}:${p.state}:${p.promotedType || 0}`)
        .join('|');
    return `${state.sideToMove}|cw:${state.captured.white}|cb:${state.captured.black}|${pStr}`;
}
