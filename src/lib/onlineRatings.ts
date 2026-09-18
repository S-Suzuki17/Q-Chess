export function isRatedPlayer(id: string | undefined): id is string {
    return !!id && id !== 'ai' && !id.startsWith('ai:') && !id.startsWith('GUEST-') && !id.startsWith('anon_');
}

/** Prefer the opening server snapshot; unknown data must not invent a rank. */
export function openingRating(id: string | undefined, snapshot: unknown, fallback: unknown): number | null {
    if (!isRatedPlayer(id)) return null;
    for (const value of [snapshot, fallback]) {
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
    }
    return null;
}
