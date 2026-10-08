import type { StripeMembershipApi } from './StripeMembership';
import type { StripePortalApi } from './StripePortal';

type PreflightResult = 'verified' | 'failed' | 'unavailable';
export interface StripeCommercePrerequisites {
    enabled(): boolean;
    check(): Promise<boolean>;
}

/** Only new purchases depend on this check; never use it for billing or deletion. */
export function createStripeCheckoutReadiness(options: {
    api: Pick<StripeMembershipApi, 'livemode' | 'availableCheckoutSkus' | 'verifyCheckoutPrice'> | null;
    portal: Pick<StripePortalApi, 'livemode' | 'verifyDefaultConfiguration'> | null;
    processingEnabled: () => boolean;
    portalEnabled: () => boolean;
    commercePrerequisites?: StripeCommercePrerequisites;
}) {
    let verified = false;
    let commerceRequired = false;
    let check: Promise<PreflightResult> | undefined;
    const commerceEnabled = () => {
        try { return !commerceRequired || options.commercePrerequisites?.enabled() === true; }
        catch { return false; }
    };
    return {
        enabled: () => verified && process.env.STRIPE_MEMBERSHIP_CHECKOUT_ENABLED === 'true'
            && options.processingEnabled() && options.portalEnabled() && commerceEnabled(),
        // Check even while purchases are OFF, so rollout can verify real API GETs
        // before opening sales. A failure stays closed until the next startup.
        check: (): Promise<PreflightResult> => check ??= (async () => {
            const { api, portal } = options;
            if (!options.processingEnabled() || !api || !portal || api.livemode !== portal.livemode) {
                return 'unavailable';
            }
            try {
                const skus = api.availableCheckoutSkus();
                commerceRequired = skus.length > 0;
                if (!commerceEnabled()) return 'unavailable';
                const prices = commerceRequired
                    ? skus.map(sku => api.verifyCheckoutPrice(sku))
                    : [api.verifyCheckoutPrice()];
                const [prerequisitesReady] = await Promise.all([
                    commerceRequired ? Promise.resolve().then(() => options.commercePrerequisites!.check()) : Promise.resolve(true),
                    ...prices, portal.verifyDefaultConfiguration(),
                ]);
                if (prerequisitesReady !== true || !commerceEnabled()) return 'failed';
                verified = true;
                return 'verified';
            } catch {
                // Never return Stripe responses, keys, IDs or exception messages to logs.
                return 'failed';
            }
        })(),
    };
}
