import type { SupabaseClient } from '@supabase/supabase-js';
import { COMMERCE_DELETION_RELEASE_VERIFIED } from './StripeCommerceDeletion';
import { sharedMatchAdmissionEnabled, sharedMatchEntitlementEnabled } from './SharedMatchFeatureGates';
import type { StripeCommercePrerequisites } from './StripeMembershipReadiness';

interface CommerceReadinessGates {
    deletionEnabled(): boolean;
    sharedEntitlementEnabled(): boolean;
    sharedAdmissionEnabled(): boolean;
}

/** Read-only sales dependency check. Never gates existing billing, deletion or recovery. */
export function createStripeCommercePrerequisites(client: SupabaseClient,
    gates: CommerceReadinessGates = {
        deletionEnabled: () => COMMERCE_DELETION_RELEASE_VERIFIED,
        sharedEntitlementEnabled: () => sharedMatchEntitlementEnabled(),
        sharedAdmissionEnabled: () => sharedMatchAdmissionEnabled(),
    }): StripeCommercePrerequisites {
    const enabled = () => {
        try {
            return gates.deletionEnabled() === true && gates.sharedEntitlementEnabled() === true
                && gates.sharedAdmissionEnabled() === true;
        } catch { return false; }
    };
    return {
        enabled,
        async check() {
            // Dormant deployments must not query protocols whose migrations are absent.
            if (!enabled()) return false;
            try {
                const results = await Promise.all([
                    'stripe_commerce_deletion_protocol_version', 'shared_match_admission_protocol_version',
                ].map(name => client.rpc(name).abortSignal(AbortSignal.timeout(5000))));
                return enabled() && results.every(({ data, error }) => !error && data === 1);
            } catch { return false; }
        },
    };
}
