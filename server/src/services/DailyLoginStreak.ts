/** Pure policy calculation. Persistence, identity and the authoritative clock belong to the caller. */
export interface TicketAmounts {
    ranked: number;
    hint: number;
}

export interface DailyLoginState {
    rewardPolicyVersion?: 1 | 2;
    lastClaimUtcDay: string | null;
    streakDays: number;
    tickets: TicketAmounts;
}

export interface DailyLoginPolicy {
    /** Index 0 is day one. The final tier repeats until maxStreakDays. */
    rewardsByStreak: readonly TicketAmounts[];
    maxStreakDays: number;
    ticketCaps: TicketAmounts;
}

/**
 * UTC consecutive days 1–7: ranked tickets 1,1,1,2,2,2,3;
 * CPU hint tickets 2,2,3,3,4,4,5. Day 7 repeats thereafter.
 * Each unspent ticket balance is capped at 20; a missed day restarts at day 1.
 */
export const DEFAULT_DAILY_LOGIN_POLICY: DailyLoginPolicy = {
    rewardsByStreak: [
        { ranked: 1, hint: 2 },
        { ranked: 1, hint: 2 },
        { ranked: 1, hint: 3 },
        { ranked: 2, hint: 3 },
        { ranked: 2, hint: 4 },
        { ranked: 2, hint: 4 },
        { ranked: 3, hint: 5 },
    ],
    maxStreakDays: 7,
    ticketCaps: { ranked: 20, hint: 20 },
};

export interface DailyLoginDecision {
    claimed: boolean;
    state: DailyLoginState;
    credited: TicketAmounts;
}

export class DailyLoginInputError extends Error {
    constructor() { super('INVALID_DAILY_LOGIN_INPUT'); }
}

const DAY_MS = 86_400_000;
const validCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const validAmounts = (value: unknown): value is TicketAmounts => {
    if (!value || typeof value !== 'object') return false;
    const amounts = value as Partial<TicketAmounts>;
    return validCount(amounts.ranked) && validCount(amounts.hint);
};
const validRewards = (value: unknown): value is readonly TicketAmounts[] => {
    if (!Array.isArray(value) || value.length < 1 || value.length > 366) return false;
    for (let index = 0; index < value.length; index++) {
        if (!validAmounts(value[index])) return false;
    }
    return true;
};

function utcDayNumber(day: string): number {
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new DailyLoginInputError();
    const [year, month, date] = day.split('-').map(Number);
    if (year < 1970 || year > 9999) throw new DailyLoginInputError();
    const time = Date.UTC(year, month - 1, date);
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== day) {
        throw new DailyLoginInputError();
    }
    return time / DAY_MS;
}

/**
 * Decide one daily claim without writing state. The caller must serialize claims per account
 * in a transaction and use server time; this function alone cannot prevent concurrent grants.
 */
export function decideDailyLoginClaim(
    state: DailyLoginState,
    policy: DailyLoginPolicy,
    now: Date,
): DailyLoginDecision {
    if (!(now instanceof Date) || !Number.isFinite(now.getTime()) ||
        !state || typeof state !== 'object' || !policy || typeof policy !== 'object' ||
        !Number.isSafeInteger(policy.maxStreakDays) || policy.maxStreakDays < 1 ||
        !validAmounts(policy.ticketCaps) || !validAmounts(state.tickets) ||
        state.tickets.ranked > policy.ticketCaps.ranked ||
        state.tickets.hint > policy.ticketCaps.hint ||
        !validRewards(policy.rewardsByStreak) ||
        policy.rewardsByStreak.length > policy.maxStreakDays ||
        !validCount(state.streakDays) || state.streakDays > policy.maxStreakDays ||
        (state.lastClaimUtcDay === null ? state.streakDays !== 0 : state.streakDays < 1)) {
        throw new DailyLoginInputError();
    }

    const today = now.toISOString().slice(0, 10);
    const todayNumber = utcDayNumber(today);
    const lastNumber = state.lastClaimUtcDay === null ? null : utcDayNumber(state.lastClaimUtcDay);
    if (lastNumber !== null && lastNumber > todayNumber) throw new DailyLoginInputError();

    if (lastNumber === todayNumber) {
        return {
            claimed: false,
            state: { lastClaimUtcDay: state.lastClaimUtcDay, streakDays: state.streakDays, tickets: { ...state.tickets } },
            credited: { ranked: 0, hint: 0 },
        };
    }

    const streakDays = lastNumber === todayNumber - 1
        ? Math.min(state.streakDays + 1, policy.maxStreakDays)
        : 1;
    const reward = policy.rewardsByStreak[Math.min(streakDays, policy.rewardsByStreak.length) - 1];
    const credited = {
        ranked: Math.min(reward.ranked, policy.ticketCaps.ranked - state.tickets.ranked),
        hint: Math.min(reward.hint, policy.ticketCaps.hint - state.tickets.hint),
    };
    return {
        claimed: true,
        state: {
            lastClaimUtcDay: today,
            streakDays,
            tickets: {
                ranked: state.tickets.ranked + credited.ranked,
                hint: state.tickets.hint + credited.hint,
            },
        },
        credited,
    };
}
