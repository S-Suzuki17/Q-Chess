import type { StripeMembershipApi } from './StripeMembership';
import type { StripePortalApi } from './StripePortal';

type PreflightResult = 'verified' | 'failed' | 'unavailable';

/** Only new purchases depend on this check; never use it for billing or deletion. */
export function createStripeCheckoutReadiness(options: {
    api: Pick<StripeMembershipApi, 'livemode' | 'verifyCheckoutPrice'> | null;
    portal: Pick<StripePortalApi, 'livemode' | 'verifyDefaultConfiguration'> | null;
    processingEnabled: () => boolean;
    portalEnabled: () => boolean;
}) {
    let verified = false;
    let check: Promise<PreflightResult> | undefined;
    return {
        enabled: () => verified && process.env.STRIPE_MEMBERSHIP_CHECKOUT_ENABLED === 'true'
            && options.processingEnabled() && options.portalEnabled(),
        // Check even while purchases are OFF, so rollout can verify real API GETs
        // before opening sales. A failure stays closed until the next startup.
        check: (): Promise<PreflightResult> => check ??= (async () => {
            const { api, portal } = options;
            if (!options.processingEnabled() || !api || !portal || api.livemode !== portal.livemode) {
                return 'unavailable';
            }
            try {
                await Promise.all([api.verifyCheckoutPrice(), portal.verifyDefaultConfiguration()]);
                verified = true;
                return 'verified';
            } catch {
                // Never return Stripe responses, keys, IDs or exception messages to logs.
                return 'failed';
            }
        })(),
    };
}
