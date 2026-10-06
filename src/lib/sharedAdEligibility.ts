import { parseSharedMatchEntitlement, type SharedMatchEntitlement } from '../../server/src/protocol/SharedMatchAdmission';
let current: { userId: string; entitlement: SharedMatchEntitlement; expiresAt: number } | null = null;
/** In-memory only, tied to the authenticated socket. Stale/unknown never shows ads. */
export function resetAdEntitlement() { current = null; }
export function acceptAdEntitlement(userId: string, value: unknown, now = Date.now()) {
    const entitlement = parseSharedMatchEntitlement(value);
    current = { userId, entitlement, expiresAt: now + 60_000 };
}
export function canShowVerifiedAccountAds(now = Date.now()) {
    return !!current && current.expiresAt > now && !current.entitlement.noAds;
}
export function verifiedAccountEntitlement(userId: string, now = Date.now()) {
    return current?.userId === userId && current.expiresAt > now ? current.entitlement : null;
}

/** Reward intents belong to the same authenticated account as the ad eligibility. */
export function canShowVerifiedAccountAdsFor(userId?: string, now = Date.now()) {
    return canShowVerifiedAccountAds(now) && (userId === undefined || current?.userId === userId);
}

export function verifiedAdAccountId(now = Date.now()): string | null {
    return current && current.expiresAt > now ? current.userId : null;
}
