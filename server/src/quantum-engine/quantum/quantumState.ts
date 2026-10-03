import { QuantumState } from '../types';

export function hasType(state: QuantumState, type: number): boolean {
    return (state & type) !== 0;
}

export function isCollapsed(state: QuantumState): boolean {
    return state !== 0 && (state & (state - 1)) === 0;
}

export function removeType(state: QuantumState, type: number): QuantumState {
    return state & ~type;
}

export function intersect(state1: QuantumState, state2: QuantumState): QuantumState {
    return state1 & state2;
}

export function union(state1: QuantumState, state2: QuantumState): QuantumState {
    return state1 | state2;
}

export function getCollapsedType(state: QuantumState): number | null {
    return isCollapsed(state) ? state : null;
}
