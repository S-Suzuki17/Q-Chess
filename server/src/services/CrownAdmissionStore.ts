import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CrownAdmissionError, parseCrownAuthorization, type CrownAuthorization } from '../protocol/CrownAdmission';
import { isRankedUserId } from './RankedAuth';

export interface CrownAdmissionStore {
    authorize(userId: string, rankKey: string, signal?: AbortSignal): Promise<CrownAuthorization>;
}
/** RPC owns entitlement reads, exact grant binding and atomic consume/unlock.
 * No browser claim, local progress, request UUID or ad callback grants access. */
export function createCrownAdmissionStore(client: SupabaseClient): CrownAdmissionStore {
    return { async authorize(userId, rankKey, signal) {
        if (!isRankedUserId(userId) || !/^[a-z0-9][a-z0-9:_-]{0,127}$/.test(rankKey)) {
            throw new CrownAdmissionError('INVALID_REQUEST');
        }
        signal?.throwIfAborted();
        const { data, error } = await client.rpc('authorize_crown_first_attempt', {
            p_authorization_id: randomUUID(), p_user_id: userId, p_rank_key: rankKey,
        }).abortSignal(signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000));
        if (error) throw new CrownAdmissionError(error.code === '42501' ? 'ACCOUNT_UNAVAILABLE' : 'CROWN_UNAVAILABLE');
        signal?.throwIfAborted();
        return parseCrownAuthorization(data, userId, rankKey);
    } };
}
