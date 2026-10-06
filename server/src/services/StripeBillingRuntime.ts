import type { RankedSessionAuthority } from './RankedAuth';
import type { AccountWriteGate } from './AccountDeletion';
import type { StripeMembershipApi } from './StripeMembership';
import type { StripeMembershipStore } from './StripeMembershipStore';
import type { StripePortalApi } from './StripePortal';
import type { StripeCommerceCheckoutStore, StripeCommerceStore } from './StripeCommerceStore';
import type { StripeCommerceStatusStore } from './StripeCommerceStatus';
import { StripeCommerceEvidence, type CommerceEvidenceConfig } from './StripeCommerceEvidence';
import { StripeCommerceFulfillment } from './StripeCommerceFulfillment';
import { createStripeMembershipRouter, createStripeWebhookRouter } from './StripeMembershipRoutes';

/** Independent of sales readiness: future receipt processing must survive paused sales. */
export const COMMERCE_RUNTIME_RELEASE_VERIFIED = false;
interface BillingRuntimeOptions {
    auth: RankedSessionAuthority;
    api: StripeMembershipApi | null;
    store: StripeMembershipStore;
    gate: AccountWriteGate;
    webhookSecret: string;
    processingEnabled: () => boolean;
    portalApi: StripePortalApi | null;
    portalEnabled: () => boolean;
    checkoutEnabled: () => boolean;
    commerce: {
        config: CommerceEvidenceConfig;
        createStore: () => StripeCommerceStore & StripeCommerceCheckoutStore;
        createStatusStore: () => StripeCommerceStatusStore;
    };
}

/** Actual server composition. Closed commerce never constructs adapters or queries pending tables. */
export function createStripeBillingRouters(options: BillingRuntimeOptions,
    commerceReleaseVerified: boolean = COMMERCE_RUNTIME_RELEASE_VERIFIED) {
    const { auth, api, store, gate, webhookSecret, processingEnabled,
        portalApi, portalEnabled, checkoutEnabled } = options;
    let commerceStore: (StripeCommerceStore & StripeCommerceCheckoutStore) | null = null;
    let commerceStatusStore: StripeCommerceStatusStore | null = null;
    let fulfillment: StripeCommerceFulfillment | null = null;
    if (commerceReleaseVerified && api && processingEnabled()) {
        const evidence = new StripeCommerceEvidence(options.commerce.config);
        if (evidence.config.livemode !== api.livemode) throw new Error('COMMERCE_MODE_MISMATCH');
        commerceStore = options.commerce.createStore();
        commerceStatusStore = options.commerce.createStatusStore();
        fulfillment = new StripeCommerceFulfillment(evidence, commerceStore, webhookSecret);
    }
    return {
        webhook: createStripeWebhookRouter(api, store, webhookSecret, processingEnabled, fulfillment),
        membership: createStripeMembershipRouter(auth, api, store, gate, processingEnabled,
            portalApi, portalEnabled, checkoutEnabled, commerceStore, commerceStatusStore),
    };
}
