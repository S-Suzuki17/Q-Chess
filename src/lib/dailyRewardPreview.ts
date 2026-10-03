import type { DailyLoginStatus, DailyTicketAmounts } from '../lib/dailyLoginRewards';

const DAY_MS = 86_400_000;
const rewards: readonly DailyTicketAmounts[] = [
    { ranked: 1, hint: 2 }, { ranked: 1, hint: 2 }, { ranked: 1, hint: 3 },
    { ranked: 2, hint: 3 }, { ranked: 2, hint: 4 }, { ranked: 2, hint: 4 }, { ranked: 3, hint: 5 },
];

/** Display forecast only. The claim RPC owns the clock and actual credit. */
export function dailyRewardPreview(status: DailyLoginStatus, now = new Date()) {
    const today = status.currentUtcDay ?? now.toISOString().slice(0, 10);
    const todayMs = Date.parse(`${today}T00:00:00Z`);
    const lastMs = status.lastClaimUtcDay === null ? null : Date.parse(`${status.lastClaimUtcDay}T00:00:00Z`);
    const claimedToday = lastMs === todayMs;
    const day = claimedToday ? new Date(todayMs + DAY_MS).toISOString().slice(0, 10) : today;
    const streakDays = lastMs === todayMs || lastMs === todayMs - DAY_MS ? Math.min(7, status.streakDays + 1) : 1;
    const reward = rewards[streakDays - 1];
    return { claimedToday, day, streakDays, reward, credit: {
        ranked: Math.min(reward.ranked, 20 - status.tickets.ranked),
        hint: Math.min(reward.hint, 20 - status.tickets.hint),
    } };
}
