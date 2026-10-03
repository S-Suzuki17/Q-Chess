import type { SupabaseClient } from '@supabase/supabase-js';
import type { StripeMembershipSnapshot } from './StripeMembership';

export interface StripeMembershipStatus {
    userId: string;
    active: boolean;
    periodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    lastGrantUtcDay: string | null;
    tickets: { ranked: number; hint: number };
}
export interface StripeMembershipClaim extends StripeMembershipStatus {
    claimed: boolean;
    credited: { ranked: number; hint: number };
}
export interface StripeMembershipReversal {
    eventId: string;
    eventPayloadHash: string;
    eventType: 'charge.refunded' | 'charge.dispute.created' | 'radar.early_fraud_warning.created';
    subscriptionId: string;
    reversedInvoiceId: string;
    currentInvoiceId: string;
    checkoutId: string;
    customerId: string;
    userId: string;
    periodEnd: string;
    livemode: boolean;
}
export interface StripePortalCustomer {
    customerId: string;
    subscriptionId: string;
    livemode: boolean;
}
export interface StripeMembershipStore {
    verifyUser(token: string): Promise<string | null>;
    blocked(userId: string): Promise<boolean>;
    preflight(userId: string, livemode?: boolean): Promise<{ eligible: boolean; reason: string | null; checkoutId: string | null; expiresAt: string | null }>;
    closeExpiredIntent(userId: string, checkoutId: string, livemode?: boolean): Promise<void>;
    registerCheckoutIntent(userId: string, checkoutId: string, priceId: string, expiresAt: string, livemode?: boolean): Promise<void>;
    applySnapshot(snapshot: StripeMembershipSnapshot): Promise<void>;
    applyReversal(reversal: StripeMembershipReversal): Promise<void>;
    portalCustomer(userId: string, livemode: boolean): Promise<StripePortalCustomer | null>;
    status(userId: string, livemode?: boolean): Promise<StripeMembershipStatus>;
    claim(userId: string, livemode?: boolean): Promise<StripeMembershipClaim>;
}

const object = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 20;
function parseStatus(data: unknown, userId: string): StripeMembershipStatus {
    if (!object(data) || data.userId !== userId || typeof data.active !== 'boolean'
        || typeof data.cancelAtPeriodEnd !== 'boolean'
        || (data.cancelAtPeriodEnd && !data.active)
        || (data.active && data.periodEnd === null)
        || !(data.periodEnd === null || (typeof data.periodEnd === 'string' && Number.isFinite(Date.parse(data.periodEnd))))
        || !(data.lastGrantUtcDay === null || (typeof data.lastGrantUtcDay === 'string'
            && /^\d{4}-\d{2}-\d{2}$/.test(data.lastGrantUtcDay)))
        || !object(data.tickets) || !count(data.tickets.ranked) || !count(data.tickets.hint)) {
        throw new Error('MEMBERSHIP_UNAVAILABLE');
    }
    return data as unknown as StripeMembershipStatus;
}

export function createStripeMembershipStore(
    client: SupabaseClient,
    verifyUser: StripeMembershipStore['verifyUser'],
    blocked: StripeMembershipStore['blocked'],
): StripeMembershipStore {
    return {
        verifyUser, blocked,
        async preflight(userId, livemode = false) {
            const { data, error } = await client.rpc(livemode ? 'stripe_live_checkout_preflight' : 'stripe_checkout_preflight', { p_user_id: userId })
                .abortSignal(AbortSignal.timeout(5000));
            if (error || !object(data) || typeof data.eligible !== 'boolean'
                || !(data.reason === null || data.reason === 'checkout_pending'
                    || data.reason === 'subscription_unresolved')
                || !(data.checkoutId === null || (typeof data.checkoutId === 'string'
                    && /^cs_(?:test|live)_[A-Za-z0-9]+$/.test(data.checkoutId)
                    && data.checkoutId.startsWith(livemode ? 'cs_live_' : 'cs_test_')))
                || !(data.expiresAt === null || (typeof data.expiresAt === 'string'
                    && Number.isFinite(Date.parse(data.expiresAt))))
                || (data.reason === 'checkout_pending' && (!data.checkoutId || !data.expiresAt))) {
                throw new Error('MEMBERSHIP_UNAVAILABLE');
            }
            return { eligible: data.eligible, reason: data.reason as string | null,
                checkoutId: data.checkoutId as string | null, expiresAt: data.expiresAt as string | null };
        },
        async closeExpiredIntent(userId, checkoutId, livemode = false) {
            const { error } = await client.rpc(livemode
                ? 'close_expired_stripe_live_checkout_intent' : 'close_expired_stripe_checkout_intent', {
                p_user_id: userId, p_checkout_id: checkoutId,
            }).abortSignal(AbortSignal.timeout(5000));
            if (error) throw new Error('MEMBERSHIP_UNAVAILABLE');
        },
        async registerCheckoutIntent(userId, checkoutId, priceId, expiresAt, livemode = false) {
            const { error } = await client.rpc(livemode
                ? 'register_stripe_live_checkout_intent' : 'register_stripe_checkout_intent', {
                p_user_id: userId, p_checkout_id: checkoutId,
                p_price_id: priceId, ...(livemode ? {} : { p_livemode: false }), p_expires_at: expiresAt,
            }).abortSignal(AbortSignal.timeout(5000));
            if (error) throw new Error('MEMBERSHIP_UNAVAILABLE');
        },
        async applySnapshot(value) {
            const { data, error } = await client.rpc(value.livemode
                ? 'apply_stripe_live_membership_snapshot_with_schedule' : 'apply_stripe_membership_snapshot_with_schedule', {
                p_event_id: value.eventId, p_event_payload_hash: value.eventPayloadHash,
                p_event_type: value.eventType, p_event_created: value.eventCreated,
                p_observed_at: value.observedAt, p_subscription_id: value.subscriptionId,
                p_checkout_id: value.checkoutId, p_customer_id: value.customerId,
                p_user_id: value.userId, p_price_id: value.priceId,
                p_status: value.status, p_period_end: value.periodEnd,
                ...(value.livemode ? {} : { p_livemode: false }), p_paid_new_period: value.paidNewPeriod,
                p_cancel_at_period_end: value.cancelAtPeriodEnd,
            }).abortSignal(AbortSignal.timeout(5000));
            if (error || !object(data) || typeof data.applied !== 'boolean'
                || typeof data.duplicate !== 'boolean') throw new Error('MEMBERSHIP_UNAVAILABLE');
        },
        async applyReversal(value) {
            const { data, error } = await client.rpc(value.livemode
                ? 'apply_stripe_live_membership_reversal' : 'apply_stripe_membership_reversal', {
                p_event_id: value.eventId, p_event_payload_hash: value.eventPayloadHash,
                p_event_type: value.eventType, p_subscription_id: value.subscriptionId,
                p_reversed_invoice_id: value.reversedInvoiceId,
                p_current_invoice_id: value.currentInvoiceId,
                p_checkout_id: value.checkoutId, p_customer_id: value.customerId,
                p_user_id: value.userId, p_period_end: value.periodEnd,
                ...(value.livemode ? {} : { p_livemode: false }),
            }).abortSignal(AbortSignal.timeout(5000));
            if (error || !object(data) || typeof data.applied !== 'boolean'
                || typeof data.duplicate !== 'boolean' || typeof data.blocked !== 'boolean') {
                throw new Error('MEMBERSHIP_UNAVAILABLE');
            }
        },
        async portalCustomer(userId, livemode) {
            const { data, error } = await client.rpc('stripe_portal_customer_for_user', {
                p_user_id: userId, p_livemode: livemode,
            }).abortSignal(AbortSignal.timeout(5000));
            if (error || !object(data) || typeof data.manageable !== 'boolean') {
                throw new Error('MEMBERSHIP_UNAVAILABLE');
            }
            if (!data.manageable) return null;
            if (typeof data.customerId !== 'string' || !/^cus_[A-Za-z0-9]+$/.test(data.customerId)
                || typeof data.subscriptionId !== 'string' || !/^sub_[A-Za-z0-9]+$/.test(data.subscriptionId)
                || data.livemode !== livemode) {
                throw new Error('MEMBERSHIP_UNAVAILABLE');
            }
            return { customerId: data.customerId, subscriptionId: data.subscriptionId,
                livemode: data.livemode };
        },
        async status(userId, livemode = false) {
            const { data, error } = await client.rpc(livemode
                ? 'stripe_live_member_status_with_schedule' : 'stripe_member_status_with_schedule', { p_user_id: userId })
                .abortSignal(AbortSignal.timeout(5000));
            if (error) throw new Error('MEMBERSHIP_UNAVAILABLE');
            return parseStatus(data, userId);
        },
        async claim(userId, livemode = false) {
            const { data, error } = await client.rpc(livemode
                ? 'claim_stripe_live_member_daily_grant_with_schedule' : 'claim_stripe_member_daily_grant_with_schedule', { p_user_id: userId })
                .abortSignal(AbortSignal.timeout(5000));
            if (error) throw new Error('MEMBERSHIP_UNAVAILABLE');
            const status = parseStatus(data, userId);
            if (!object(data) || typeof data.claimed !== 'boolean' || !object(data.credited)
                || !count(data.credited.ranked) || !count(data.credited.hint)
                || (!data.claimed && (data.credited.ranked !== 0 || data.credited.hint !== 0))) {
                throw new Error('MEMBERSHIP_UNAVAILABLE');
            }
            return { ...status, claimed: data.claimed, credited: data.credited as { ranked: number; hint: number } };
        },
    };
}
