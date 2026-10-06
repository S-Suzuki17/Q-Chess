import type { SupabaseClient } from '@supabase/supabase-js';
import { hasCurrentTicketTerms } from './AccountCurrentTerms';
import { DEFAULT_DAILY_LOGIN_POLICY, type DailyLoginState, type TicketAmounts } from './DailyLoginStreak';

export interface DailyLoginClaim extends DailyLoginState {
    claimed: boolean;
    credited: TicketAmounts;
}

export interface DailyLoginStore {
    verifyUser(token: string): Promise<string | null>;
    blocked(userId: string): Promise<boolean>;
    hasCurrentTerms(userId: string): Promise<boolean>;
    read(userId: string): Promise<DailyLoginState>;
    claim(userId: string): Promise<DailyLoginClaim>;
}

const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const record = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

function validUtcDay(value: unknown): value is string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function amounts(value: unknown, cap: TicketAmounts): TicketAmounts | null {
    if (!record(value) || !integer(value.ranked) || !integer(value.hint)
        || value.ranked > cap.ranked || value.hint > cap.hint) return null;
    return { ranked: value.ranked, hint: value.hint };
}

/** Validate the service-only RPC response before exposing it to an account. */
export function parseDailyLoginState(value: unknown): DailyLoginState | null {
    if (!record(value)) return null;
    if (value.rewardPolicyVersion !== undefined && value.rewardPolicyVersion !== 1 && value.rewardPolicyVersion !== 2) return null;
    const tickets = amounts(value.tickets, value.rewardPolicyVersion === 2 ? {ranked:Number.MAX_SAFE_INTEGER,hint:Number.MAX_SAFE_INTEGER} : DEFAULT_DAILY_LOGIN_POLICY.ticketCaps);
    let lastClaimUtcDay: string | null;
    if (value.lastClaimUtcDay === null) lastClaimUtcDay = null;
    else if (validUtcDay(value.lastClaimUtcDay)) lastClaimUtcDay = value.lastClaimUtcDay;
    else return null;
    if (!tickets || !integer(value.streakDays) || value.streakDays > DEFAULT_DAILY_LOGIN_POLICY.maxStreakDays
        || (lastClaimUtcDay === null ? value.streakDays !== 0 : value.streakDays < 1)) return null;
    return { lastClaimUtcDay, streakDays: value.streakDays, tickets,
        ...(value.rewardPolicyVersion === undefined ? {} : {rewardPolicyVersion:value.rewardPolicyVersion as 1 | 2}) };
}

export function parseDailyLoginClaim(value: unknown): DailyLoginClaim | null {
    const state = parseDailyLoginState(value);
    if (!state || !record(value) || typeof value.claimed !== 'boolean') return null;
    const credited = amounts(value.credited, state.rewardPolicyVersion === 2 ? {ranked:3,hint:1} : DEFAULT_DAILY_LOGIN_POLICY.ticketCaps);
    if (!credited || (!value.claimed && (credited.ranked !== 0 || credited.hint !== 0))) return null;
    return { ...state, claimed: value.claimed, credited };
}

/**
 * The future database functions own the UTC clock, row locking, 7-day tier,
 * balance caps, and idempotency. The browser never sends a date, amount, or ID.
 * Both RPCs must be service_role-only and return one JSON object.
 */
export function createDailyLoginStore(
    client: SupabaseClient,
    verifyUser: DailyLoginStore['verifyUser'],
    blocked: DailyLoginStore['blocked'],
): DailyLoginStore {
    async function call(name: 'daily_login_reward_status' | 'claim_daily_login_reward', userId: string): Promise<unknown> {
        const { data, error } = await client.rpc(name, { p_user_id: userId })
            .abortSignal(AbortSignal.timeout(5000));
        if (error || !record(data) || data.userId !== userId || data.enabled !== true) {
            throw new Error('REWARD_UNAVAILABLE');
        }
        return data;
    }
    return {
        verifyUser, blocked,
        hasCurrentTerms: id => hasCurrentTicketTerms(client, id),
        async read(userId) {
            const state = parseDailyLoginState(await call('daily_login_reward_status', userId));
            if (!state) throw new Error('REWARD_UNAVAILABLE');
            return state;
        },
        async claim(userId) {
            const result = parseDailyLoginClaim(await call('claim_daily_login_reward', userId));
            if (!result) throw new Error('REWARD_UNAVAILABLE');
            return result;
        },
    };
}
