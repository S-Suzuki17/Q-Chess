import type { SupabaseClient } from '@supabase/supabase-js';
import { DeletionError } from './AccountDeletion';
import { QG_STRIPE_API_VERSION } from './StripeApiVersion';

type Mode = 'test' | 'live';
type Intent = { checkoutId: string; livemode: boolean };
type Membership = { subscriptionId: string; checkoutId: string };
export type StripeDeletionLinks = { intents: Intent[]; memberships: Membership[] };
export type StripeDeletionLinkSource = (userId: string) => Promise<StripeDeletionLinks>;

const checkoutId = (id: unknown): id is string =>
    typeof id === 'string' && /^cs_(?:test|live)_[A-Za-z0-9]{8,200}$/.test(id);
const subscriptionId = (id: unknown): id is string =>
    typeof id === 'string' && /^sub_[A-Za-z0-9]{8,200}$/.test(id);
const customerId = (id: unknown): id is string =>
    typeof id === 'string' && /^cus_[A-Za-z0-9]{8,200}$/.test(id);
const object = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

/** Service-role only. An incomplete/unavailable inventory must block deletion. */
export function createStripeDeletionLinkSource(client: SupabaseClient): StripeDeletionLinkSource {
    return async userId => {
        const [intents, members] = await Promise.all([
            client.from('stripe_checkout_intents').select('checkout_id,livemode', { count: 'exact' })
                .eq('user_id', userId).limit(1001).abortSignal(AbortSignal.timeout(5000)),
            client.from('stripe_memberships').select('subscription_id,checkout_id', { count: 'exact' })
                .eq('user_id', userId).limit(1001).abortSignal(AbortSignal.timeout(5000)),
        ]);
        if (intents.error || members.error || !Array.isArray(intents.data) || !Array.isArray(members.data)
            || intents.count !== intents.data.length || members.count !== members.data.length
            || intents.data.length > 1000 || members.data.length > 1000) throw new DeletionError('UNAVAILABLE');
        return {
            intents: intents.data.map(row => {
                if (!checkoutId(row.checkout_id) || typeof row.livemode !== 'boolean') {
                    throw new DeletionError('UNAVAILABLE');
                }
                return { checkoutId: row.checkout_id, livemode: row.livemode };
            }),
            memberships: members.data.map(row => {
                if (!subscriptionId(row.subscription_id) || !checkoutId(row.checkout_id)) {
                    throw new DeletionError('UNAVAILABLE');
                }
                return { subscriptionId: row.subscription_id, checkoutId: row.checkout_id };
            }),
        };
    };
}

/**
 * Fail-closed cancellation before the existing profile/data cascade. Test and
 * live Stripe accounts use separate server-only keys; there is no browser key.
 */
export function createStripeCancellationGuard(
    linksFor: StripeDeletionLinkSource,
    keys: { test?: string; live?: string },
    request: typeof fetch = fetch,
): (userId: string) => Promise<void> {
    return async userId => {
        if (!userId || userId.length > 256) throw new DeletionError('UNAVAILABLE');
        const links = await linksFor(userId);
        const intents = new Map(links.intents.map(intent => [intent.checkoutId, intent]));
        if (intents.size !== links.intents.length) throw new DeletionError('UNAVAILABLE');
        const expected = new Map<string, { mode: Mode; customer: string }>();
        const stripeCall = async (mode: Mode, path: string, method = 'GET') => {
            const key = keys[mode];
            if (!key || !new RegExp(`^(?:sk|rk)_${mode}_[A-Za-z0-9_]{8,}$`).test(key)) {
                throw new DeletionError('UNAVAILABLE');
            }
            const response = await request(`https://api.stripe.com/v1/${path}`, {
                method, headers: { Authorization: `Bearer ${key}`, 'Stripe-Version': QG_STRIPE_API_VERSION },
                signal: AbortSignal.timeout(6000),
            });
            if (!response.ok) throw new DeletionError('UNAVAILABLE');
            const value: unknown = await response.json();
            if (!object(value) || value.livemode !== (mode === 'live')) throw new DeletionError('UNAVAILABLE');
            return value;
        };
        for (const intent of links.intents) {
            const mode: Mode = intent.livemode ? 'live' : 'test';
            if (!intent.checkoutId.startsWith(`cs_${mode}_`)) throw new DeletionError('UNAVAILABLE');
            const path = `checkout/sessions/${encodeURIComponent(intent.checkoutId)}`;
            let session = await stripeCall(mode, path);
            if (session.id !== intent.checkoutId || session.client_reference_id !== userId) {
                throw new DeletionError('UNAVAILABLE');
            }
            if (session.status === 'open') {
                try { session = await stripeCall(mode, `${path}/expire`, 'POST'); }
                catch { session = await stripeCall(mode, path); }
            }
            if (session.id !== intent.checkoutId || session.client_reference_id !== userId) {
                throw new DeletionError('UNAVAILABLE');
            }
            if (session.status === 'expired' && session.subscription == null) continue;
            if (session.status !== 'complete' || !subscriptionId(session.subscription)
                || !customerId(session.customer)) throw new DeletionError('UNAVAILABLE');
            const previous = expected.get(session.subscription);
            if (previous && (previous.mode !== mode || previous.customer !== session.customer)) {
                throw new DeletionError('UNAVAILABLE');
            }
            expected.set(session.subscription, { mode, customer: session.customer });
        }
        for (const member of links.memberships) {
            if (!intents.has(member.checkoutId) || !expected.has(member.subscriptionId)) {
                throw new DeletionError('UNAVAILABLE');
            }
        }
        for (const [id, owner] of expected) {
            const path = `subscriptions/${encodeURIComponent(id)}`;
            const subscription = await stripeCall(owner.mode, path);
            if (subscription.id !== id || subscription.customer !== owner.customer) {
                throw new DeletionError('UNAVAILABLE');
            }
            if (subscription.status === 'canceled' || subscription.status === 'incomplete_expired') continue;
            const canceled = await stripeCall(owner.mode, path, 'DELETE');
            if (canceled.id !== id || canceled.customer !== owner.customer || canceled.status !== 'canceled') {
                throw new DeletionError('UNAVAILABLE');
            }
        }
    };
}
