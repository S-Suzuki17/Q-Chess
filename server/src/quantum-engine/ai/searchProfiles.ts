import type { TacticalSearchOptions } from './search';

/** High-precision hint analysis, NOT a CPU difficulty. Finite, cancellable and
 * bounded for mobile/worker capacity; not a proof of the globally optimal move. */
export function qubeSearchProfile(availableMs?: number): Required<Pick<TacticalSearchOptions, 'timeLimitMs' | 'maxDepth' | 'quiescenceDepth' | 'transpositionEntries' | 'playableRoot'>> {
    const timeLimitMs = availableMs === undefined ? 15000 :
        Number.isFinite(availableMs) ? Math.max(0, Math.min(15000, Math.floor(availableMs))) : 0;
    return { timeLimitMs, maxDepth: 16, quiescenceDepth: 4, transpositionEntries: 15000, playableRoot: true };
}

/** Keep the clock running and leave one second to act on the delivered advice.
 * Subtract time since the server snapshot, including network/RPC latency. */
export function hintTimeAvailable(remainingMs: number, elapsedMs = 0): number {
    return Number.isFinite(remainingMs) && Number.isFinite(elapsedMs)
        ? Math.max(0, Math.floor(remainingMs - Math.max(0, elapsedMs) - 1000)) : 0;
}

/** Gradual learning curve, with a playable final challenge below hint analysis.
 * The game's custom rules have no measured mapping to standard-chess Elo. */
export function circuitSearchProfile(strength: number) {
    const group = Math.max(1, Math.min(34, Math.floor(Number.isFinite(strength) ? strength : 1)));
    return {
        timeLimitMs: Math.round(500 + 2500 * Math.pow((group - 1) / 33, 1.3)),
        maxDepth: group === 1 ? 0 : group <= 6 ? 1 : group <= 14 ? 2 : group <= 25 ? 3 : 4,
        tieBreakSeed: group,
    };
}
