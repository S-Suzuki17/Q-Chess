import { expect, it } from 'vitest';
import { dailyRewardPreview } from './dailyRewardPreview';
import type { DailyLoginStatus } from './dailyLoginRewards';

const state: DailyLoginStatus = { userId: 'Alice', enabled: true, streakDays: 2, tickets: { ranked: 19, hint: 20 }, lastClaimUtcDay: '2026-10-03' };
it('shows tomorrow’s tier and only the credit that fits when today was claimed', () => {
    expect(dailyRewardPreview(state, new Date('2026-10-03T23:59:59Z'))).toEqual({ claimedToday: true, day: '2026-10-04', streakDays: 3, reward: { ranked: 1, hint: 3 }, credit: { ranked: 1, hint: 0 } });
});
it('uses the server’s UTC day rather than the device date when present', () => {
    expect(dailyRewardPreview({ ...state, currentUtcDay: '2026-10-04' }, new Date('2026-09-01'))).toMatchObject({ claimedToday: false, day: '2026-10-04', streakDays: 3 });
});
it('resets after a missed UTC day and keeps day seven repeating', () => {
    expect(dailyRewardPreview(state, new Date('2026-10-05T00:00:00Z'))).toMatchObject({ streakDays: 1, reward: { ranked: 1, hint: 2 } });
    expect(dailyRewardPreview({ ...state, streakDays: 7 }, new Date('2026-10-04'))).toMatchObject({ streakDays: 7, reward: { ranked: 3, hint: 5 } });
    expect(dailyRewardPreview({ ...state, lastClaimUtcDay: null, streakDays: 0 }, new Date('2026-10-03'))).toMatchObject({ streakDays: 1 });
});
