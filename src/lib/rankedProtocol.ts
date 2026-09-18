export type QueueMode = 'ranked' | 'random';
export type CPUOpponent = { side: 'host' | 'joiner'; rating: number; level?: number };
export type MatchedRoom = { id: string; myColor: 'white' | 'black'; timeControl: number; hostId: string; joinerId: string; mode: QueueMode; cpu?: CPUOpponent };
export type RatingSettlement = { matchId: string; userId: string; before: number; after: number; delta: number; timeControl: number };

export function ratingSettlement(value: unknown, matchId: string | undefined, userId: string | undefined): RatingSettlement | null {
    if (!value || typeof value !== 'object') return null;
    const data = value as Record<string, unknown>;
    if (!matchId || !userId || data.matchId !== matchId || data.userId !== userId ||
        ![10, 180, 600].includes(data.timeControl as number) ||
        ![data.before, data.after, data.delta].every(n => typeof n === 'number' && Number.isFinite(n)) ||
        (data.before as number) < 0 || (data.after as number) < 0 ||
        Math.abs((data.after as number) - (data.before as number) - (data.delta as number)) > 0.001) return null;
    return data as RatingSettlement;
}

export function cpuOpponent(value: unknown): CPUOpponent | undefined {
    if (!value || typeof value !== 'object') return;
    const data = value as Record<string, unknown>;
    if ((data.side !== 'host' && data.side !== 'joiner') || typeof data.rating !== 'number' || !Number.isFinite(data.rating) || data.rating < 0) return;
    return { side: data.side, rating: data.rating, ...(typeof data.level === 'number' && Number.isFinite(data.level) ? { level: data.level } : {}) };
}
