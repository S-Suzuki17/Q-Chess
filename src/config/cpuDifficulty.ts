export type CPULevel = 1 | 3 | 5;
export const CPU_LEVELS: readonly CPULevel[] = [1, 3, 5];
export interface CPUSearchProfile { timeLimitMs:number; maxDepth:number; tieBreakSeed?:number }

export function cpuSearchProfile(level:number, profile?:CPUSearchProfile):CPUSearchProfile {
    const base=cpuDifficulty(level);
    return {
        timeLimitMs:profile && Number.isFinite(profile.timeLimitMs) ? Math.max(500,Math.min(6000,profile.timeLimitMs)) : base.timeLimitMs,
        maxDepth:profile && Number.isFinite(profile.maxDepth) ? Math.max(0,Math.min(8,Math.floor(profile.maxDepth))) : base.maxDepth,
        ...(profile?.tieBreakSeed ? {tieBreakSeed:profile.tieBreakSeed>>>0} : {}),
    };
}

export function cpuDifficulty(level: number = 5) {
    if (level <= 1) return { timeLimitMs: 1000, maxDepth: 0, ja: '弱い', en: 'Easy' };
    if (level <= 3) return { timeLimitMs: 1500, maxDepth: 2, ja: '普通', en: 'Normal' };
    return { timeLimitMs: 4000, maxDepth: 6, ja: '強い', en: 'Hard' };
}
