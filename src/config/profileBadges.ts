export type BadgeId = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';
export type BadgeDefinition = {
    id: BadgeId; minimum: number; metal: string; inset: string; accent: string;
    silhouette: 'shield' | 'crest' | 'lens' | 'fortress' | 'orbital' | 'crown';
};

/** Cosmetic thresholds only. Never used to calculate or persist a player's rating. */
export const PROFILE_BADGES: readonly BadgeDefinition[] = [
    {id:'pawn',minimum:1200,metal:'#9d8267',inset:'#32383c',accent:'#d4c3a1',silhouette:'shield'},
    {id:'knight',minimum:1500,metal:'#c7d4df',inset:'#273e50',accent:'#96dbe6',silhouette:'crest'},
    {id:'bishop',minimum:1800,metal:'#dbb35f',inset:'#453a2b',accent:'#ffe0a1',silhouette:'lens'},
    {id:'rook',minimum:2100,metal:'#8f9da6',inset:'#171f28',accent:'#e47a54',silhouette:'fortress'},
    {id:'queen',minimum:2250,metal:'#c8c6de',inset:'#443064',accent:'#bd9be8',silhouette:'orbital'},
    {id:'king',minimum:2400,metal:'#e1be71',inset:'#403726',accent:'#e9f4fa',silhouette:'crown'},
];

export function badgeFromRating(rating: number | null | undefined): BadgeDefinition | null {
    if (typeof rating !== 'number' || !Number.isFinite(rating) || rating < 0) return null;
    return [...PROFILE_BADGES].reverse().find(badge => rating >= badge.minimum) ?? null;
}

// Same recognizable chess silhouettes for small displays and WebGL fallback.
export const BADGE_PIECE_PATHS: Record<BadgeId,string> = {
    pawn:'M44 68h32l-3-8H47Zm5-12h22l-6-19H55ZM60 17a9 9 0 1 0 0 18 9 9 0 1 0 0-18Z',
    knight:'M43 68h35l-4-9H48Zm7-13 2-11-12-1 2-11 11-11 3-9 9 5 8 2 7 12-4 25H51l8-19-6-3-5 6-5-2 8-13',
    bishop:'M44 68h32l-3-8H47Zm7-12h18l-5-15h-8Zm9-43c-16 14-17 23-3 26l5-13 4 3-4 11c16-1 13-15-2-27Z',
    rook:'M43 68h34l-3-8H46Zm7-12h20l-2-23h7V17h-7v7h-5v-7h-6v7h-5v-7h-7v16h7Z',
    queen:'M43 68h34l-3-8H46Zm7-12h20l-2-18 7-18-12 9-3-14-4 14-11-9 7 18Zm-6-41a3 3 0 1 0 0-6 3 3 0 1 0 0 6Zm16-5a3 3 0 1 0 0-6 3 3 0 1 0 0 6Zm16 5a3 3 0 1 0 0-6 3 3 0 1 0 0 6Z',
    king:'M43 68h34l-3-8H46Zm8-12h18l-3-19 8-13H46l8 13Zm6-35h6v-6h6V9h-6V3h-6v6h-6v6h6Z',
};
