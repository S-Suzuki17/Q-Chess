export type CPULevel = 1 | 3 | 5;
export const CPU_LEVELS: readonly CPULevel[] = [1, 3, 5];

export function cpuDifficulty(level: number = 5) {
    if (level <= 1) return { timeLimitMs: 1000, maxDepth: 0, ja: '弱い', en: 'Easy' };
    if (level <= 3) return { timeLimitMs: 1500, maxDepth: 2, ja: '普通', en: 'Normal' };
    return { timeLimitMs: 4000, maxDepth: 6, ja: '強い', en: 'Hard' };
}
