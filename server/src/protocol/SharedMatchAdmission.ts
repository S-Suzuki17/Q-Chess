/** Shared wire vocabulary; no client-side balances or ad completion are authority. */
export type SharedMatchChoiceSource = 'ticket' | 'verified_ad';
export type SharedMatchAllocationSource = 'daily_quota' | 'free_ticket' | 'legacy_paid_ticket'
    | 'subscription_unlimited' | 'verified_ad';
export type RewardedAdPurpose = 'online_ranked_match' | 'crown_first_attempt';
export interface SharedMatchEntitlement {
    plan: 'free' | 'legacy299' | 'standard' | 'plus';
    unlimitedOnlineRanked: boolean;
    noAds: boolean;
    periodEnd: string | null;
}
export interface SharedMatchChoiceRequired {
    matchId: string;
    dailyFreeMatches: 3;
    ticketCost: 1;
    verifiedAdMatches: 1;
    verifiedAdAvailable: boolean;
    grantId?: string;
}
export interface SharedMatchChoice {
    matchId: string;
    source: SharedMatchChoiceSource;
    grantId?: string;
}
export const isMatchUuid = (value: unknown): value is string => typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function parseSharedMatchChoice(value: unknown): SharedMatchChoice | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const row = value as Record<string, unknown>;
    if (!isMatchUuid(row.matchId) || typeof row.source !== 'string' || !['ticket', 'verified_ad'].includes(row.source)
        || Object.keys(row).some(key => !['matchId', 'source', 'grantId'].includes(key))
        || (row.source === 'ticket' && row.grantId !== undefined)
        || (row.source === 'verified_ad' && !isMatchUuid(row.grantId))) return null;
    return row as unknown as SharedMatchChoice;
}
export function parseSharedMatchChoiceRequired(value: unknown, matchId?: string): SharedMatchChoiceRequired | null {
    if (!value || typeof value !== 'object') return null;
    const row = value as SharedMatchChoiceRequired;
    if (!isMatchUuid(row.matchId) || row.matchId !== matchId || row.dailyFreeMatches !== 3
        || row.ticketCost !== 1 || row.verifiedAdMatches !== 1 || typeof row.verifiedAdAvailable !== 'boolean'
        || (row.verifiedAdAvailable && !isMatchUuid(row.grantId))) return null;
    return row;
}

export function parseSharedMatchEntitlement(value: unknown): SharedMatchEntitlement {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('SHARED_ENTITLEMENT_INVALID');
    const row = value as SharedMatchEntitlement;
    const paid = row.plan === 'standard' || row.plan === 'plus';
    if (!['free', 'legacy299', 'standard', 'plus'].includes(row.plan)
        || row.unlimitedOnlineRanked !== paid || row.noAds !== paid
        || (paid ? typeof row.periodEnd !== 'string' || !Number.isFinite(Date.parse(row.periodEnd)) : row.periodEnd !== null))
        throw new Error('SHARED_ENTITLEMENT_INVALID');
    return row;
}
