// Deploy the matching shared-admission and commerce migrations before enabling
// these runtime switches. Paid access uses the same durable admission as free
// starts; entitlement reads alone do not change the legacy ticket rules.
export const SHARED_MATCH_ADMISSION_RELEASE_READY = true;
export const VERIFIED_MATCH_AD_PROVIDER_RELEASE_READY = false;
// Keep paid no-ad status available when new starts are paused during rollback.
export const SHARED_MATCH_ENTITLEMENT_RELEASE_READY = true;
export const sharedMatchEntitlementEnabled = () => SHARED_MATCH_ENTITLEMENT_RELEASE_READY
    && process.env.SHARED_MATCH_ENTITLEMENT_ENABLED === 'true';
export const sharedMatchAdmissionEnabled = () => SHARED_MATCH_ADMISSION_RELEASE_READY
    && sharedMatchEntitlementEnabled()
    && process.env.SHARED_MATCH_ADMISSION_ENABLED === 'true';
export const verifiedMatchAdProviderEnabled = () => VERIFIED_MATCH_AD_PROVIDER_RELEASE_READY
    && process.env.VERIFIED_MATCH_AD_PROVIDER_ENABLED === 'true';
// Eventual rollout must release recovery alongside admission, then leave this
// recovery switch enabled when disabling new starts during rollback.
export const SHARED_MATCH_ADMISSION_RECOVERY_RELEASE_READY = true;
export const sharedMatchAdmissionRecoveryEnabled = () => sharedMatchAdmissionEnabled()
    || (SHARED_MATCH_ADMISSION_RECOVERY_RELEASE_READY && process.env.SHARED_MATCH_ADMISSION_RECOVERY_ENABLED === 'true');
