import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RewardedAdPurpose } from '../protocol/SharedMatchAdmission';
import { isMatchUuid } from '../protocol/SharedMatchAdmission';
import { verifiedMatchAdProviderEnabled } from './SharedMatchFeatureGates';

export interface VerifiedRewardedAdEvidence {
    grantId: string; userId: string; purpose: RewardedAdPurpose; targetKey: string;
    provider: string; transactionId: string;
}
/** A verifier must check a provider signature/server receipt, freshness and its
 * server-issued account/purpose/target challenge before returning this evidence.
 * No production verifier/HTTP route is installed. Tests use synthetic signatures. */
export interface RewardedAdEvidenceVerifier {
    verify(rawProviderEvidence: string): Promise<VerifiedRewardedAdEvidence | null>;
}
export class VerifiedRewardedAdTermsRequiredError extends Error {
    readonly code = 'CURRENT_TICKET_TERMS_REQUIRED';
    readonly retryable = true;
    constructor() { super('CURRENT_TICKET_TERMS_REQUIRED'); }
}

export function createVerifiedRewardedAdRecorder(client: SupabaseClient, verifier: RewardedAdEvidenceVerifier,
    enabled = verifiedMatchAdProviderEnabled) {
    return async (rawProviderEvidence: string): Promise<{ grantId: string; duplicate: boolean }> => {
        if (!enabled()) throw new Error('VERIFIED_REWARDED_AD_DISABLED');
        if (typeof rawProviderEvidence !== 'string' || !rawProviderEvidence || Buffer.byteLength(rawProviderEvidence) > 65536)
            throw new Error('VERIFIED_REWARDED_AD_INVALID');
        const e = await verifier.verify(rawProviderEvidence);
        if (!e || !isMatchUuid(e.grantId) || !e.userId || Buffer.byteLength(e.userId) > 256
            || e.userId.trim() !== e.userId || /[\u0000-\u001f\u007f]/.test(e.userId)
            || !['online_ranked_match', 'crown_first_attempt'].includes(e.purpose)
            || !e.targetKey || e.targetKey.length > 128 || /[\u0000-\u001f\u007f]/.test(e.targetKey)
            || !/^[a-z][a-z0-9_]{1,63}$/.test(e.provider) || e.transactionId.length < 8 || e.transactionId.length > 256
            || /[\u0000-\u001f\u007f]/.test(e.transactionId)
            || (e.purpose === 'online_ranked_match' && !isMatchUuid(e.targetKey))) throw new Error('VERIFIED_REWARDED_AD_INVALID');
        const { data, error } = await client.rpc('record_verified_rewarded_ad', {
            p_grant_id: e.grantId, p_user_id: e.userId, p_purpose: e.purpose, p_target_key: e.targetKey,
            p_provider: e.provider, p_transaction_id: e.transactionId,
            p_evidence_sha256: createHash('sha256').update(rawProviderEvidence).digest('hex'), p_expires_at: null,
        }).abortSignal(AbortSignal.timeout(5000));
        if (error?.code === '42501' && error.message === 'CURRENT_TICKET_TERMS_REQUIRED')
            throw new VerifiedRewardedAdTermsRequiredError();
        if (error) throw error;
        if (!data || data.grantId !== e.grantId || typeof data.duplicate !== 'boolean') throw new Error('VERIFIED_REWARDED_AD_INVALID');
        return data;
    };
}
