'use client';
import { isCommerceSku, type CommerceSku } from '../config/commerceCatalog';
import { requireCurrentAccountTerms } from './currentAccountTerms';

import { Capacitor } from '@capacitor/core';
import { ANDROID_BUILD, platformFeatures } from '../config/appPlatform';
import { supabase } from './supabaseClient';
import { gameServerUrl, readRankedSession } from './rankedSession';
import { webCommerceCheckoutReady } from '../config/webCommerce';

/** Explicit public build flags, default OFF. Native/runtime guards remain mandatory. */
export const STRIPE_WEB_MEMBERSHIP_ENABLED = !ANDROID_BUILD && process.env.NEXT_PUBLIC_QG_STRIPE_WEB_MEMBERSHIP_ENABLED === 'true';
export const STRIPE_WEB_CHECKOUT_ENABLED = !ANDROID_BUILD && process.env.NEXT_PUBLIC_QG_STRIPE_WEB_CHECKOUT_ENABLED === 'true';
export const STRIPE_WEB_PORTAL_ENABLED = !ANDROID_BUILD && process.env.NEXT_PUBLIC_QG_STRIPE_WEB_PORTAL_ENABLED === 'true';
/** Use of existing entitlements is separate from new purchases and allowed on Android. */
export const MEMBER_TICKET_USAGE_ENABLED = process.env.NEXT_PUBLIC_QG_MEMBER_TICKET_USAGE_ENABLED === 'true';

/** Separate mode-specific stock and billing state; never legacy daily tickets. */
export type StripeCommerceStatus = Readonly<{
    userId: string;
    livemode: boolean;
    active: boolean;
    sku: 'standard_monthly' | 'plus_monthly' | null;
    periodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    unlimitedRanked: boolean;
    adFree: boolean;
    balances: Readonly<{ purchased: number; subscription: number }>;
}>;

export type StripeMembershipStatus = Readonly<{
    userId: string;
    availableCheckoutSkus?: readonly CommerceSku[];
    commerce?: StripeCommerceStatus;
    enabled: true;
    active: boolean;
    canManageBilling: boolean;
    cancelAtPeriodEnd: boolean;
    periodEnd: string | null;
    lastGrantUtcDay: string | null;
    tickets: Readonly<{ ranked: number; hint: number }>;
}>;

export class StripeMembershipError extends Error {
    constructor(public readonly code: 'DISABLED' | 'AUTH_REQUIRED' | 'UNAVAILABLE') { super(code); }
}

export function stripeWebMembershipAllowed(webContent: boolean, nativePlatform: boolean, enabled = STRIPE_WEB_MEMBERSHIP_ENABLED || STRIPE_WEB_PORTAL_ENABLED): boolean {
    return enabled && webContent && !nativePlatform && platformFeatures(ANDROID_BUILD, nativePlatform).webContent;
}

type Action = 'status' | 'checkout' | 'portal' | 'daily-grant';
function assertWebOnly(action: Action): void {
    if (!stripeWebMembershipAllowed(true, Capacitor.isNativePlatform())
        || (action === 'checkout' && (!STRIPE_WEB_CHECKOUT_ENABLED || !STRIPE_WEB_MEMBERSHIP_ENABLED || !webCommerceCheckoutReady()))
        || (action === 'portal' && !STRIPE_WEB_PORTAL_ENABLED)) {
        throw new StripeMembershipError('DISABLED');
    }
}

const validUserId = (id: string) => typeof id === 'string' && !!id && id.length <= 128 &&
    !/^(?:guest(?:[-_]|$)|anon(?:ymous)?(?:[-_]|$)|cpu(?:[-_]|$)|ai(?::|$)|supabase-)/i.test(id);
const validDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

const validPeriodEnd = (value: unknown): value is string => typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    validDay(value.slice(0, 10)) && Number.isFinite(Date.parse(value));

function parseCommerceStatus(value: unknown, userId: string): StripeCommerceStatus {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new StripeMembershipError('UNAVAILABLE');
    const row = value as Record<string, unknown>;
    const balances = row.balances as Record<string, unknown> | null;
    if (row.userId !== userId || typeof row.livemode !== 'boolean' || typeof row.active !== 'boolean' ||
        typeof row.cancelAtPeriodEnd !== 'boolean' || typeof row.unlimitedRanked !== 'boolean' || typeof row.adFree !== 'boolean' ||
        !balances || Array.isArray(balances) || typeof balances !== 'object' ||
        !Number.isSafeInteger(balances.purchased) || (balances.purchased as number) < 0 ||
        !Number.isSafeInteger(balances.subscription) || (balances.subscription as number) < 0 ||
        (row.active
            ? !['standard_monthly', 'plus_monthly'].includes(row.sku as string) || !validPeriodEnd(row.periodEnd)
            : row.sku !== null || row.periodEnd !== null || row.cancelAtPeriodEnd !== false) ||
        row.unlimitedRanked !== (row.active && row.livemode) || row.adFree !== (row.active && row.livemode)) {
        throw new StripeMembershipError('UNAVAILABLE');
    }
    return {
        userId, livemode: row.livemode, active: row.active,
        sku: row.sku as StripeCommerceStatus['sku'], periodEnd: row.periodEnd as string | null,
        cancelAtPeriodEnd: row.cancelAtPeriodEnd, unlimitedRanked: row.unlimitedRanked, adFree: row.adFree,
        balances: { purchased: balances.purchased as number, subscription: balances.subscription as number },
    };
}

export function parseStripeMembershipStatus(value: unknown, userId: string): StripeMembershipStatus {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new StripeMembershipError('UNAVAILABLE');
    const row = value as Record<string, unknown>;
    const tickets = row.tickets as Record<string, unknown> | null;
    if (row.availableCheckoutSkus !== undefined && (!Array.isArray(row.availableCheckoutSkus) ||
        !row.availableCheckoutSkus.every(isCommerceSku) || new Set(row.availableCheckoutSkus).size !== row.availableCheckoutSkus.length)) {
        throw new StripeMembershipError('UNAVAILABLE');
    }
    if (row.userId !== userId || row.enabled !== true || typeof row.active !== 'boolean' ||
        typeof row.canManageBilling !== 'boolean' || typeof row.cancelAtPeriodEnd !== 'boolean' ||
        (row.cancelAtPeriodEnd && !row.active) ||
        (row.active && row.periodEnd === null) ||
        (row.periodEnd !== null && (typeof row.periodEnd !== 'string' || !Number.isFinite(Date.parse(row.periodEnd)))) ||
        (row.lastGrantUtcDay !== null && !validDay(row.lastGrantUtcDay)) || !tickets ||
        !Number.isSafeInteger(tickets.ranked) || (tickets.ranked as number) < 0 ||
        !Number.isSafeInteger(tickets.hint) || (tickets.hint as number) < 0) {
        throw new StripeMembershipError('UNAVAILABLE');
    }
    return {
        userId, enabled: true, active: row.active as boolean,
        ...(row.availableCheckoutSkus === undefined ? {} : { availableCheckoutSkus: row.availableCheckoutSkus as CommerceSku[] }),
        ...(row.commerce === undefined ? {} : { commerce: parseCommerceStatus(row.commerce, userId) }),
        canManageBilling: row.canManageBilling as boolean,
        cancelAtPeriodEnd: row.cancelAtPeriodEnd as boolean,
        periodEnd: row.periodEnd as string | null,
        lastGrantUtcDay: row.lastGrantUtcDay as string | null,
        tickets: { ranked: tickets.ranked as number, hint: tickets.hint as number },
    };
}

export function parseStripeCheckoutUrl(value: unknown): string {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new StripeMembershipError('UNAVAILABLE');
    const raw = (value as Record<string, unknown>).url;
    if (typeof raw !== 'string' || raw.length > 4096) throw new StripeMembershipError('UNAVAILABLE');
    try {
        const url = new URL(raw);
        if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com' || url.username || url.password || url.port ||
            !(/^\/c\/pay\//.test(url.pathname) || /^\/pay\//.test(url.pathname))) throw new Error('Unexpected checkout host');
        return url.href;
    } catch { throw new StripeMembershipError('UNAVAILABLE'); }
}

export function parseStripePortalUrl(value: unknown): string {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new StripeMembershipError('UNAVAILABLE');
    const raw = (value as Record<string, unknown>).url;
    if (typeof raw !== 'string' || raw.length > 4096) throw new StripeMembershipError('UNAVAILABLE');
    try {
        const url = new URL(raw);
        if (url.protocol !== 'https:' || url.hostname !== 'billing.stripe.com'
            || !/^\/p\/session\/[A-Za-z0-9_-]{8,}$/.test(url.pathname)
            || url.username || url.password || url.port || url.search || url.hash) {
            throw new Error('Unexpected billing portal URL');
        }
        return url.href;
    } catch { throw new StripeMembershipError('UNAVAILABLE'); }
}

async function request(userId: string, action: Action, signal?: AbortSignal, usageOnly = false, sku?: CommerceSku): Promise<unknown> {
    if (usageOnly) {
        if (!MEMBER_TICKET_USAGE_ENABLED || !['status','daily-grant'].includes(action)) throw new StripeMembershipError('DISABLED');
    } else assertWebOnly(action);
    if (action === 'checkout' && !isCommerceSku(sku)) throw new StripeMembershipError('UNAVAILABLE');
    if (!validUserId(userId)) throw new StripeMembershipError('AUTH_REQUIRED');
    signal?.throwIfAborted();
    try {
        let token = readRankedSession(userId)?.token;
        if (!token) {
            const { data, error } = await supabase.auth.getSession();
            const session = data.session;
            if (!error && session?.user.id === userId && !session.user.is_anonymous &&
                (!session.expires_at || session.expires_at * 1000 > Date.now())) token = session.access_token;
        }
        signal?.throwIfAborted();
        if (!token) throw new StripeMembershipError('AUTH_REQUIRED');
        if (action === 'daily-grant' || action === 'checkout') await requireCurrentAccountTerms(userId, signal);
        signal?.throwIfAborted();
        const endpoint = new URL(`/membership/stripe/${action}`, gameServerUrl());
        if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) {
            throw new StripeMembershipError('UNAVAILABLE');
        }
        const response = await fetch(endpoint, {
            method: action === 'status' ? 'GET' : 'POST',
            headers: { Authorization: `Bearer ${token}`,
                ...(action === 'status' ? {} : { 'Content-Type': 'application/json' }) },
            ...(action === 'status' ? {} : { body: JSON.stringify(action === 'checkout' ? { sku } : {}) }),
            signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
            credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
        });
        signal?.throwIfAborted();
        if (response.status === 401 || response.status === 403) throw new StripeMembershipError('AUTH_REQUIRED');
        if (!response.ok) throw new StripeMembershipError('UNAVAILABLE');
        return await response.json();
    } catch (error) {
        if (signal?.aborted) throw signal.reason;
        if (error instanceof StripeMembershipError) throw error;
        throw new StripeMembershipError('UNAVAILABLE');
    }
}

export async function readStripeMembershipStatus(userId: string, signal?: AbortSignal): Promise<StripeMembershipStatus> {
    return parseStripeMembershipStatus(await request(userId, 'status', signal), userId);
}

/** Same authenticated status API, with no offer, billing URL or purchase operation. */
export async function readMemberTicketStatus(userId: string, signal?: AbortSignal): Promise<StripeMembershipStatus> {
    return parseStripeMembershipStatus(await request(userId, 'status', signal, true), userId);
}
export async function claimMemberTickets(userId: string, signal?: AbortSignal): Promise<StripeMembershipStatus> {
    return parseStripeMembershipStatus(await request(userId, 'daily-grant', signal, true), userId);
}

/** Returns a validated URL; the caller must decide whether to navigate. Never called while checkout flag is off. */
export async function prepareStripeCheckout(userId: string, sku: CommerceSku, signal?: AbortSignal): Promise<string> {
    return parseStripeCheckoutUrl(await request(userId, 'checkout', signal, false, sku));
}

/** A short-lived, server-created customer portal URL; never accepts a client-supplied Stripe Customer ID. */
export async function prepareStripeBillingPortal(userId: string, signal?: AbortSignal): Promise<string> {
    return parseStripePortalUrl(await request(userId, 'portal', signal));
}
