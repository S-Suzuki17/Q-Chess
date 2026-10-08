import type { QoppeliaWeights } from './evalQoppelia';

/** Style is independent of difficulty. Select once, never on each move. */
export const CPU_PERSONALITIES = ['balanced', 'attacker', 'guardian', 'positional', 'active', 'flexible'] as const;
export type CPUPersonality = typeof CPU_PERSONALITIES[number];
export const PERSONALITY_WEIGHTS: Record<CPUPersonality, Partial<QoppeliaWeights>> = {
    balanced: {},
    attacker: { pieceValue: 1.35, originValue: .09, mobility: .055, safety: .4, candidateAllocation: .55 },
    guardian: { pieceValue: 1, originValue: .015, mobility: .025, safety: 1.25, candidateAllocation: 1.15, kingCandidate: 1.6 },
    positional: { originValue: .02, mobility: .045, safety: .85, center: .16 },
    active: { originValue: .065, mobility: .11, safety: .65, candidateAllocation: .65, center: .055 },
    flexible: { originValue: .025, mobility: .045, safety: .9, candidateAllocation: 1.7, kingCandidate: 1.5, center: .03 },
};

export function randomCPUPersonality(random: () => number = Math.random): CPUPersonality {
    const value = random();
    const index = Number.isFinite(value) ? Math.max(0, Math.min(CPU_PERSONALITIES.length - 1, Math.floor(value * CPU_PERSONALITIES.length))) : 0;
    return CPU_PERSONALITIES[index];
}

/** A restored authoritative practice session keeps its style without a DB migration.
 * Not an authorization token: the server still owns session, position and strength. */
export function cpuPersonalityForGame(gameId: string): CPUPersonality {
    let hash = 2166136261;
    for (const char of gameId) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return CPU_PERSONALITIES[(hash >>> 0) % CPU_PERSONALITIES.length];
}
