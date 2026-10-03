'use client';

import { supabase } from './supabaseClient';
import { gameServerUrl, readRankedSession } from './rankedSession';

/** Remains hard-off until the database, Render API, and account deletion path are verified. */
export const DAILY_LOGIN_REWARDS_ENABLED = false;
export const DAILY_LOGIN_REWARD_CHANGED_EVENT = 'qg-daily-login-reward-changed';

export type DailyTicketAmounts = Readonly<{ ranked: number; hint: number }>;
export type DailyLoginStatus = Readonly<{
    userId: string;
    enabled: boolean;
    streakDays: number;
    tickets: DailyTicketAmounts;
    lastClaimUtcDay: string | null;
    /** Render server's UTC day, used only to preview the next claim. Older APIs may omit it. */
    currentUtcDay?: string;
}>;
export type DailyLoginClaim = DailyLoginStatus & Readonly<{ credited: DailyTicketAmounts }>;

export class DailyLoginRewardsError extends Error {
    constructor(public readonly code: 'DISABLED' | 'AUTH_REQUIRED' | 'UNAVAILABLE') { super(code); }
}

const validCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const validTicketCount = (value: unknown): value is number => validCount(value) && value <= 20;
const validTickets = (value: unknown): value is DailyTicketAmounts =>
    !!value && typeof value === 'object' && !Array.isArray(value) &&
    validTicketCount((value as DailyTicketAmounts).ranked) && validTicketCount((value as DailyTicketAmounts).hint);
const validUtcDay = (value: unknown): value is string => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    if (year < 1970 || year > 9999) return false;
    const time = Date.UTC(year, month - 1, day);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
};
const validUserId = (userId: string) => typeof userId === 'string' && !!userId && userId.length <= 128 &&
    !/^(?:guest(?:[-_]|$)|anon(?:ymous)?(?:[-_]|$)|cpu(?:[-_]|$)|ai(?::|$)|supabase-)/i.test(userId);

function parseStatus(value: unknown, userId: string): DailyLoginStatus {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DailyLoginRewardsError('UNAVAILABLE');
    const row = value as Record<string, unknown>;
    if (row.userId !== userId || row.enabled !== true || !validCount(row.streakDays) || row.streakDays > 7 ||
        !validTickets(row.tickets) || (row.lastClaimUtcDay !== null && !validUtcDay(row.lastClaimUtcDay)) ||
        (row.lastClaimUtcDay === null ? row.streakDays !== 0 : row.streakDays < 1) ||
        (row.currentUtcDay !== undefined && (!validUtcDay(row.currentUtcDay) ||
            (typeof row.lastClaimUtcDay === 'string' && row.lastClaimUtcDay > row.currentUtcDay)))) {
        throw new DailyLoginRewardsError('UNAVAILABLE');
    }
    return {
        userId,
        enabled: row.enabled,
        streakDays: row.streakDays,
        tickets: { ranked: row.tickets.ranked, hint: row.tickets.hint },
        lastClaimUtcDay: row.lastClaimUtcDay,
        ...(row.currentUtcDay !== undefined ? { currentUtcDay: row.currentUtcDay as string } : {}),
    };
}

async function request(userId: string, claim: false, signal?: AbortSignal): Promise<DailyLoginStatus>;
async function request(userId: string, claim: true, signal?: AbortSignal): Promise<DailyLoginClaim>;
async function request(userId: string, claim: boolean, signal?: AbortSignal): Promise<DailyLoginStatus | DailyLoginClaim> {
    if (!validUserId(userId)) throw new DailyLoginRewardsError('AUTH_REQUIRED');
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
        if (!token) throw new DailyLoginRewardsError('AUTH_REQUIRED');
        const endpoint = new URL(claim ? '/rewards/daily-login/claim' : '/rewards/daily-login', gameServerUrl());
        if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) {
            throw new DailyLoginRewardsError('UNAVAILABLE');
        }
        const response = await fetch(endpoint, {
            method: claim ? 'POST' : 'GET',
            headers: { Authorization: `Bearer ${token}`, ...(claim ? { 'Content-Type': 'application/json' } : {}) },
            ...(claim ? { body: JSON.stringify({}) } : {}),
            signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
            credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
        });
        signal?.throwIfAborted();
        if (response.status === 401 || response.status === 403) throw new DailyLoginRewardsError('AUTH_REQUIRED');
        const value = await response.json();
        if (response.status === 503 && value?.code === 'FEATURE_DISABLED' && value?.enabled === false) {
            throw new DailyLoginRewardsError('DISABLED');
        }
        if (!response.ok) throw new DailyLoginRewardsError('UNAVAILABLE');
        signal?.throwIfAborted();
        const status = parseStatus(value, userId);
        if (!claim) return status;
        if (!validTickets(value.credited)) throw new DailyLoginRewardsError('UNAVAILABLE');
        return { ...status, credited: { ranked: value.credited.ranked, hint: value.credited.hint } };
    } catch (error) {
        if (signal?.aborted) throw signal.reason;
        if (error instanceof DailyLoginRewardsError) throw error;
        throw new DailyLoginRewardsError('UNAVAILABLE');
    }
}

/** Reading the balance never claims a reward. Automatic claims are separately release-gated. */
export function createDailyLoginApi(enabled: () => boolean = () => DAILY_LOGIN_REWARDS_ENABLED) {
    const requireEnabled = () => { if (!enabled()) throw new DailyLoginRewardsError('DISABLED'); };
    return {
        async readDailyLoginStatus(userId: string, signal?: AbortSignal) { requireEnabled(); return request(userId, false, signal); },
        async claimDailyLoginReward(userId: string, signal?: AbortSignal) { requireEnabled(); return request(userId, true, signal); },
    };
}
export const { readDailyLoginStatus, claimDailyLoginReward } = createDailyLoginApi();
