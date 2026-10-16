'use client';
import { requestAccountProfile } from './accountProfile';
import { CURRENT_TERMS_VERSION, CURRENT_TERMS_EFFECTIVE_DATE, currentTermsEffective } from '../config/currentTerms';
export const CURRENT_TERMS_ACCEPTED_EVENT = 'qg-current-terms-accepted';
export const TERMS_CONSENT_STORAGE_KEY_PREFIX = 'qg_terms_consent_v1';

export function getLocalTermsConsentKey(userId: string): string {
    return `${TERMS_CONSENT_STORAGE_KEY_PREFIX}_${CURRENT_TERMS_VERSION}_${userId}`;
}

export function hasLocalTermsConsent(userId: string): boolean {
    if (typeof window === 'undefined' || !window.localStorage || !userId) return false;
    try {
        return window.localStorage.getItem(getLocalTermsConsentKey(userId)) === 'true';
    } catch {
        return false;
    }
}

export function setLocalTermsConsent(userId: string): void {
    if (typeof window === 'undefined' || !window.localStorage || !userId) return;
    try {
        window.localStorage.setItem(getLocalTermsConsentKey(userId), 'true');
    } catch {
        // Ignore quota/private mode errors
    }
}

export function clearLocalTermsConsent(userId: string): void {
    if (typeof window === 'undefined' || !window.localStorage || !userId) return;
    try {
        window.localStorage.removeItem(getLocalTermsConsentKey(userId));
    } catch {
        // Ignore
    }
}

export function parseCurrentAccountTerms(value: Record<string, unknown>): { effective: boolean; accepted: boolean } {
    if (value.currentVersion !== CURRENT_TERMS_VERSION || value.effectiveDate !== CURRENT_TERMS_EFFECTIVE_DATE
        || typeof value.effective !== 'boolean') throw new Error('TERMS_UPDATED');
    const consent = value.consent as { version?: unknown; acceptedAt?: unknown } | null;
    if (!(consent === null || (consent?.version === CURRENT_TERMS_VERSION && typeof consent.acceptedAt === 'string'
        && Number.isFinite(Date.parse(consent.acceptedAt))))) throw new Error('TERMS_UNAVAILABLE');
    const effective = value.effective && currentTermsEffective();
    return { effective, accepted: effective && consent !== null };
}
export async function currentAccountTermsStatus(userId: string, signal?: AbortSignal) {
    if (hasLocalTermsConsent(userId) && currentTermsEffective()) {
        return { effective: true, accepted: true };
    }
    const result = parseCurrentAccountTerms(await requestAccountProfile('/account/current-terms', userId, undefined, signal));
    if (result.accepted) {
        setLocalTermsConsent(userId);
    }
    return result;
}
export async function requireCurrentAccountTerms(userId: string, signal?: AbortSignal) {
    if (!(await currentAccountTermsStatus(userId, signal)).accepted) throw new Error('CURRENT_TERMS_REQUIRED');
    signal?.throwIfAborted();
}
/** Only call following an explicit checked acceptance of the displayed current document. */
export async function acceptCurrentAccountTerms(userId: string, signal?: AbortSignal) {
    if (!currentTermsEffective()) throw new Error('TERMS_NOT_EFFECTIVE');
    const value = parseCurrentAccountTerms(await requestAccountProfile('/account/current-terms', userId,
        { version: CURRENT_TERMS_VERSION, accepted: true }, signal));
    signal?.throwIfAborted();
    if (!value.accepted) throw new Error('TERMS_UNAVAILABLE');
    setLocalTermsConsent(userId);
    window.dispatchEvent(new CustomEvent(CURRENT_TERMS_ACCEPTED_EVENT, { detail: { userId } }));
}

