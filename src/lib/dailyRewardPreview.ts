import type { DailyLoginStatus, DailyTicketAmounts } from '../lib/dailyLoginRewards';

const DAY_MS = 86_400_000;
const legacyRewards: readonly DailyTicketAmounts[] = [
    { ranked: 1, hint: 2 }, { ranked: 1, hint: 2 }, { ranked: 1, hint: 3 },
    { ranked: 2, hint: 3 }, { ranked: 2, hint: 4 }, { ranked: 2, hint: 4 }, { ranked: 3, hint: 5 },
];

export const DAILY_REWARDS_V2: readonly DailyTicketAmounts[] = [
    { ranked: 1, hint: 0 }, { ranked: 1, hint: 0 }, { ranked: 2, hint: 0 },
    { ranked: 2, hint: 0 }, { ranked: 3, hint: 0 }, { ranked: 3, hint: 0 }, { ranked: 3, hint: 1 },
];

/** Display forecast only. The claim RPC owns the clock and actual credit. */
export function dailyRewardPreview(status: DailyLoginStatus, now = new Date()) {
    const today = status.currentUtcDay ?? now.toISOString().slice(0, 10);
    const todayMs = Date.parse(`${today}T00:00:00Z`);
    const lastMs = status.lastClaimUtcDay === null ? null : Date.parse(`${status.lastClaimUtcDay}T00:00:00Z`);
    const claimedToday = lastMs === todayMs;
    const day = claimedToday ? new Date(todayMs + DAY_MS).toISOString().slice(0, 10) : today;
    const version2 = status.rewardPolicyVersion === 2;
    const streakDays = lastMs === todayMs || lastMs === todayMs - DAY_MS
        ? (version2 ? status.streakDays % 7 + 1 : Math.min(7, status.streakDays + 1)) : 1;
    const rewards = version2 ? DAILY_REWARDS_V2 : legacyRewards;
    const reward = rewards[streakDays - 1];
    const overflow = version2 && (status.tickets.ranked > Number.MAX_SAFE_INTEGER - reward.ranked || status.tickets.hint > Number.MAX_SAFE_INTEGER - reward.hint);
    return { claimedToday, day, streakDays, reward, credit: {
        ranked: overflow ? 0 : Math.min(reward.ranked, (version2 ? Number.MAX_SAFE_INTEGER : 20) - status.tickets.ranked),
        hint: overflow ? 0 : Math.min(reward.hint, (version2 ? Number.MAX_SAFE_INTEGER : 20) - status.tickets.hint),
    } };
}
