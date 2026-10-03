'use client';
import { supabase } from './supabaseClient';
import { gameServerUrl, readRankedSession } from './rankedSession';

/** Release alongside ranked recovery, independently of new sales/daily rewards. */
export const RANKED_REFUND_BALANCE_ENABLED = false;
export type RankedRefundBalance = Readonly<{ userId: string; enabled: true; freeRankedRefunds: number; paidRankedRefunds: number }>;
export class RankedRefundBalanceError extends Error {
    constructor(public readonly code: 'DISABLED' | 'AUTH_REQUIRED' | 'UNAVAILABLE') { super(code); }
}
const validUserId = (id: string) => typeof id === 'string' && !!id && id.length <= 128 &&
    !/^(?:guest(?:[-_]|$)|anon(?:ymous)?(?:[-_]|$)|cpu(?:[-_]|$)|ai(?::|$)|supabase-)/i.test(id);

export function parseRankedRefundBalance(value: unknown, userId: string): RankedRefundBalance {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RankedRefundBalanceError('UNAVAILABLE');
    const row = value as Record<string, unknown>;
    if (row.userId !== userId || row.enabled !== true ||
        ![row.freeRankedRefunds, row.paidRankedRefunds].every(count => Number.isSafeInteger(count) && (count as number) >= 0)) {
        throw new RankedRefundBalanceError('UNAVAILABLE');
    }
    // Do not clamp to the ordinary wallet's 20-ticket cap or reconstruct paid eligibility in the browser.
    return { userId, enabled: true, freeRankedRefunds: row.freeRankedRefunds as number, paidRankedRefunds: row.paidRankedRefunds as number };
}

export function createRankedRefundApi(enabled: () => boolean = () => RANKED_REFUND_BALANCE_ENABLED) {
    return async function readRankedRefundBalance(userId: string, signal?: AbortSignal): Promise<RankedRefundBalance> {
        if (!enabled()) throw new RankedRefundBalanceError('DISABLED');
        if (!validUserId(userId)) throw new RankedRefundBalanceError('AUTH_REQUIRED');
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
            if (!token) throw new RankedRefundBalanceError('AUTH_REQUIRED');
            const endpoint = new URL('/tickets/ranked-refunds', gameServerUrl());
            if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) {
                throw new RankedRefundBalanceError('UNAVAILABLE');
            }
            const response = await fetch(endpoint, {
                method: 'GET', headers: { Authorization: `Bearer ${token}` },
                signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
                credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
            });
            signal?.throwIfAborted();
            if (response.status === 401 || response.status === 403) throw new RankedRefundBalanceError('AUTH_REQUIRED');
            const value = await response.json();
            if (response.status === 503 && value?.code === 'FEATURE_DISABLED' && value?.enabled === false) throw new RankedRefundBalanceError('DISABLED');
            if (!response.ok) throw new RankedRefundBalanceError('UNAVAILABLE');
            signal?.throwIfAborted();
            if (!enabled()) throw new RankedRefundBalanceError('DISABLED');
            return parseRankedRefundBalance(value, userId);
        } catch (error) {
            if (signal?.aborted) throw signal.reason;
            if (error instanceof RankedRefundBalanceError) throw error;
            throw new RankedRefundBalanceError('UNAVAILABLE');
        }
    };
}
export const readRankedRefundBalance = createRankedRefundApi();
