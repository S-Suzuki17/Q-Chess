import type { SupabaseClient } from '@supabase/supabase-js';

export interface StripeCommerceStatus {
    userId: string;
    livemode: boolean;
    /** Billing state in the selected mode; test membership is not a live entitlement. */
    active: boolean;
    sku: 'standard_monthly' | 'plus_monthly' | null;
    periodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    unlimitedRanked: boolean;
    adFree: boolean;
    balances: { purchased: number; subscription: number };
}

export interface StripeCommerceStatusStore {
    status(userId: string, livemode: boolean): Promise<StripeCommerceStatus>;
}

const object = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
const unavailable = () => new Error('COMMERCE_STATUS_UNAVAILABLE');
const balance = (value: unknown): value is number =>
    Number.isSafeInteger(value) && (value as number) >= 0;

function validTimestamp(value: unknown): value is string {
    if (typeof value !== 'string'
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
    const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value.slice(0, 10)
        && Number.isFinite(Date.parse(value));
}

/**
 * The existing read-only RPC atomically checks account, owner, mode, exact
 * price, paid period, refund barrier and retirement. It selects only the two
 * requested-mode commerce pools, without claiming, spending or clearing stock.
 */
export function createStripeCommerceStatusStore(client: SupabaseClient): StripeCommerceStatusStore {
    return {
        async status(userId, livemode) {
            if (typeof userId !== 'string' || !userId || userId.trim() !== userId
                || Buffer.byteLength(userId) > 256 || /[\u0000-\u001f\u007f]/.test(userId)
                || typeof livemode !== 'boolean') throw unavailable();
            const { data, error } = await client.rpc('stripe_commerce_status', {
                p_user_id: userId, p_livemode: livemode,
            }).abortSignal(AbortSignal.timeout(5000));
            if (error || !object(data) || data.userId !== userId || typeof data.active !== 'boolean'
                || typeof data.cancelAtPeriodEnd !== 'boolean'
                || data.unlimitedRanked !== data.active || data.adFree !== data.active
                || !balance(data.purchasedHintTickets) || !balance(data.subscriptionHintTickets)
                || (data.active
                    // The RPC's database clock decides activity; host clock skew
                    // must not hide a valid membership or its separate balances.
                    ? !['standard_monthly', 'plus_monthly'].includes(data.sku as string) || !validTimestamp(data.periodEnd)
                    : data.sku !== null || data.periodEnd !== null || data.cancelAtPeriodEnd)) throw unavailable();
            return {
                userId, livemode, active: data.active,
                sku: data.sku as StripeCommerceStatus['sku'], periodEnd: data.periodEnd as string | null,
                cancelAtPeriodEnd: data.cancelAtPeriodEnd,
                // Sandbox billing remains inspectable but cannot enable live gameplay or ad benefits.
                unlimitedRanked: livemode && data.active, adFree: livemode && data.active,
                balances: { purchased: data.purchasedHintTickets, subscription: data.subscriptionHintTickets },
            };
        },
    };
}
