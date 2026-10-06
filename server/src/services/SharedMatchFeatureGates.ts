// Source hard closed. Environment configuration alone cannot expose new limits,
// ticket choice or an unavailable ad requirement in public gameplay.
export const SHARED_MATCH_ADMISSION_RELEASE_READY = false;
export const VERIFIED_MATCH_AD_PROVIDER_RELEASE_READY = false;
// Paid no-ad status can later remain available while new free-match limits are
// paused. Until its schema is deployed, do not query the dormant entitlement RPC.
export const SHARED_MATCH_ENTITLEMENT_RELEASE_READY = false;
export const sharedMatchEntitlementEnabled = () => SHARED_MATCH_ENTITLEMENT_RELEASE_READY
    && process.env.SHARED_MATCH_ENTITLEMENT_ENABLED === 'true';
export const sharedMatchAdmissionEnabled = () => SHARED_MATCH_ADMISSION_RELEASE_READY
    && process.env.SHARED_MATCH_ADMISSION_ENABLED === 'true';
export const verifiedMatchAdProviderEnabled = () => VERIFIED_MATCH_AD_PROVIDER_RELEASE_READY
    && process.env.VERIFIED_MATCH_AD_PROVIDER_ENABLED === 'true';
// Eventual rollout must release recovery alongside admission, then leave this
// recovery switch enabled when disabling new starts during rollback.
export const SHARED_MATCH_ADMISSION_RECOVERY_RELEASE_READY = false;
export const sharedMatchAdmissionRecoveryEnabled = () => sharedMatchAdmissionEnabled()
    || (SHARED_MATCH_ADMISSION_RECOVERY_RELEASE_READY && process.env.SHARED_MATCH_ADMISSION_RECOVERY_ENABLED === 'true');
