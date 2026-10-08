/** Approved policy: clock variants share one CPU-strength authorization. */
export type CrownRankMapping = 'stage_v1' | 'strength_v1';
export const CROWN_RANK_MAPPING: CrownRankMapping | null = 'strength_v1';
export const CROWN_VERIFIED_PROVIDER_READY = false;
export const crownAdmissionEnabled = () => CROWN_RANK_MAPPING !== null && CROWN_VERIFIED_PROVIDER_READY;
export function crownRankKey(stageId: unknown, mapping: CrownRankMapping | null = CROWN_RANK_MAPPING): string | null {
    if (!Number.isInteger(stageId) || (stageId as number) < 1 || (stageId as number) > 100) return null;
    if (mapping === 'stage_v1') return `crown:stage:v1:${stageId}`;
    if (mapping === 'strength_v1') return `crown:strength:v1:${Math.floor(((stageId as number) - 1) / 3) + 1}`;
    return null;
}
export type CrownAuthorization =
    | { state: 'reward_required'; userId: string; rankKey: string }
    | { state: 'authorized'; userId: string; rankKey: string; authorizationId: string;
        source: 'verified_ad' | 'subscription' | 'legacy_campaign'; reused: boolean };
export class CrownAdmissionError extends Error {
    constructor(public readonly code: 'AUTH_REQUIRED' | 'ACCOUNT_UNAVAILABLE' | 'INVALID_REQUEST' | 'CROWN_UNAVAILABLE') { super(code); }
}
export function parseCrownAuthorization(value: unknown, userId: string, rankKey: string): CrownAuthorization {
    const row = value as CrownAuthorization;
    if (!row || row.userId !== userId || row.rankKey !== rankKey) throw new CrownAdmissionError('CROWN_UNAVAILABLE');
    if (row.state === 'reward_required') return { state: row.state, userId, rankKey };
    if (row.state !== 'authorized' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(row.authorizationId)
        || !['verified_ad','subscription','legacy_campaign'].includes(row.source) || typeof row.reused !== 'boolean') {
        throw new CrownAdmissionError('CROWN_UNAVAILABLE');
    }
    return { state: row.state, userId, rankKey, authorizationId: row.authorizationId, source: row.source, reused: row.reused };
}
