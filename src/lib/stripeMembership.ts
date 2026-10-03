'use client';

import { Capacitor } from '@capacitor/core';
import { ANDROID_BUILD, platformFeatures } from '../config/appPlatform';
import { supabase } from './supabaseClient';
import { gameServerUrl, readRankedSession } from './rankedSession';

/** Local scaffold only. Never turn on before policy, fulfillment, and Play separation review. */
export const STRIPE_WEB_MEMBERSHIP_ENABLED = false;
export const STRIPE_WEB_CHECKOUT_ENABLED = false;
export const STRIPE_WEB_PORTAL_ENABLED = false;

export type StripeMembershipStatus = Readonly<{
    userId: string;
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

export function stripeWebMembershipAllowed(webContent: boolean, nativePlatform: boolean, enabled = STRIPE_WEB_MEMBERSHIP_ENABLED): boolean {
    return enabled && webContent && !nativePlatform && platformFeatures(ANDROID_BUILD, nativePlatform).webContent;
}

type Action = 'status' | 'checkout' | 'portal';
function assertWebOnly(action: Action): void {
    if (!stripeWebMembershipAllowed(true, Capacitor.isNativePlatform())
        || (action === 'checkout' && !STRIPE_WEB_CHECKOUT_ENABLED)
        || (action === 'portal' && !STRIPE_WEB_PORTAL_ENABLED)) {
        throw new StripeMembershipError('DISABLED');
    }
}

const validUserId = (id: string) => typeof id === 'string' && !!id && id.length <= 128 &&
    !/^(?:guest(?:[-_]|$)|anon(?:ymous)?(?:[-_]|$)|cpu(?:[-_]|$)|ai(?::|$)|supabase-)/i.test(id);
const validDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function parseStripeMembershipStatus(value: unknown, userId: string): StripeMembershipStatus {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new StripeMembershipError('UNAVAILABLE');
    const row = value as Record<string, unknown>;
    const tickets = row.tickets as Record<string, unknown> | null;
    if (row.userId !== userId || row.enabled !== true || typeof row.active !== 'boolean' ||
        typeof row.canManageBilling !== 'boolean' || typeof row.cancelAtPeriodEnd !== 'boolean' ||
        (row.cancelAtPeriodEnd && !row.active) ||
        (row.active && row.periodEnd === null) ||
        (row.periodEnd !== null && (typeof row.periodEnd !== 'string' || !Number.isFinite(Date.parse(row.periodEnd)))) ||
        (row.lastGrantUtcDay !== null && !validDay(row.lastGrantUtcDay)) || !tickets ||
        !Number.isSafeInteger(tickets.ranked) || (tickets.ranked as number) < 0 || (tickets.ranked as number) > 20 ||
        !Number.isSafeInteger(tickets.hint) || (tickets.hint as number) < 0 || (tickets.hint as number) > 20) {
        throw new StripeMembershipError('UNAVAILABLE');
    }
    return {
        userId, enabled: true, active: row.active as boolean,
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

async function request(userId: string, action: Action, signal?: AbortSignal): Promise<unknown> {
    assertWebOnly(action);
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
        const endpoint = new URL(`/membership/stripe/${action}`, gameServerUrl());
        if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) {
            throw new StripeMembershipError('UNAVAILABLE');
        }
        const response = await fetch(endpoint, {
            method: action === 'status' ? 'GET' : 'POST',
            headers: { Authorization: `Bearer ${token}`,
                ...(action === 'status' ? {} : { 'Content-Type': 'application/json' }) },
            ...(action === 'status' ? {} : { body: '{}' }),
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

/** Returns a validated URL; the caller must decide whether to navigate. Never called while checkout flag is off. */
export async function prepareStripeCheckout(userId: string, signal?: AbortSignal): Promise<string> {
    return parseStripeCheckoutUrl(await request(userId, 'checkout', signal));
}

/** A short-lived, server-created customer portal URL; never accepts a client-supplied Stripe Customer ID. */
export async function prepareStripeBillingPortal(userId: string, signal?: AbortSignal): Promise<string> {
    return parseStripePortalUrl(await request(userId, 'portal', signal));
}
