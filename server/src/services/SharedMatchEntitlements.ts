import type { SupabaseClient } from '@supabase/supabase-js';
import { parseSharedMatchEntitlement } from '../protocol/SharedMatchAdmission';
export { parseSharedMatchEntitlement } from '../protocol/SharedMatchAdmission';
export function createSharedMatchEntitlements(client: SupabaseClient) {
    return async (userId: string) => {
        const { data, error } = await client.rpc('get_shared_match_entitlement', { p_user_id: userId })
            .abortSignal(AbortSignal.timeout(5000));
        if (error) throw error;
        return parseSharedMatchEntitlement(data);
    };
}
