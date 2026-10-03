import { describe, expect, it } from 'vitest';
import { DEFAULT_DAILY_LOGIN_POLICY, DailyLoginInputError, decideDailyLoginClaim, type DailyLoginPolicy, type DailyLoginState } from './DailyLoginStreak';

const policy: DailyLoginPolicy = {
    rewardsByStreak: [{ ranked: 1, hint: 2 }, { ranked: 2, hint: 3 }, { ranked: 3, hint: 4 }],
    maxStreakDays: 3,
    ticketCaps: { ranked: 5, hint: 6 },
};
const fresh = (): DailyLoginState => ({ lastClaimUtcDay: null, streakDays: 0, tickets: { ranked: 0, hint: 0 } });
const now = (value: string) => new Date(value);

describe('daily login streak ticket decision', () => {
    it('uses the agreed seven-day schedule with a 20-ticket cap in each category', () => {
        expect(DEFAULT_DAILY_LOGIN_POLICY).toEqual({
            rewardsByStreak: [
                { ranked: 1, hint: 2 }, { ranked: 1, hint: 2 }, { ranked: 1, hint: 3 },
                { ranked: 2, hint: 3 }, { ranked: 2, hint: 4 }, { ranked: 2, hint: 4 },
                { ranked: 3, hint: 5 },
            ],
            maxStreakDays: 7,
            ticketCaps: { ranked: 20, hint: 20 },
        });
    });

    it('holds at day seven and only credits room below each 20-ticket balance cap', () => {
        let state = fresh();
        const credited = [];
        for (let day = 0; day < 10; day++) {
            const instant = new Date(Date.UTC(2026, 8, 1 + day));
            const claim = decideDailyLoginClaim(state, DEFAULT_DAILY_LOGIN_POLICY, instant);
            expect(claim.claimed).toBe(true);
            expect(claim.state.streakDays).toBe(Math.min(day + 1, 7));
            credited.push(claim.credited);
            state = claim.state;
        }
        expect(credited).toEqual([
            { ranked: 1, hint: 2 }, { ranked: 1, hint: 2 }, { ranked: 1, hint: 3 },
            { ranked: 2, hint: 3 }, { ranked: 2, hint: 4 }, { ranked: 2, hint: 4 },
            { ranked: 3, hint: 2 }, { ranked: 3, hint: 0 }, { ranked: 3, hint: 0 },
            { ranked: 2, hint: 0 },
        ]);
        expect(state.tickets).toEqual({ ranked: 20, hint: 20 });
    });

    it('restarts the default reward tier after one missed UTC day', () => {
        const state: DailyLoginState = {
            lastClaimUtcDay: '2026-09-22', streakDays: 7, tickets: { ranked: 0, hint: 0 },
        };
        const claim = decideDailyLoginClaim(state, DEFAULT_DAILY_LOGIN_POLICY, now('2026-09-24T00:00:00Z'));
        expect(claim.state.streakDays).toBe(1);
        expect(claim.credited).toEqual({ ranked: 1, hint: 2 });
    });

    it('grants day one using the UTC day and does not mutate input', () => {
        const state = fresh();
        const result = decideDailyLoginClaim(state, policy, now('2026-09-30T23:59:59.000Z'));
        expect(result).toEqual({
            claimed: true,
            state: { lastClaimUtcDay: '2026-09-30', streakDays: 1, tickets: { ranked: 1, hint: 2 } },
            credited: { ranked: 1, hint: 2 },
        });
        expect(state).toEqual(fresh());
    });

    it('makes a second claim on the same UTC day idempotent', () => {
        const first = decideDailyLoginClaim(fresh(), policy, now('2026-09-30T23:59:59Z'));
        const again = decideDailyLoginClaim(first.state, policy, now('2026-09-30T23:59:59.999Z'));
        expect(again).toEqual({ claimed: false, state: first.state, credited: { ranked: 0, hint: 0 } });
        expect(again.state).not.toBe(first.state);
        expect(again.state.tickets).not.toBe(first.state.tickets);
    });

    it('progresses at UTC midnight and clamps the streak at its configured maximum', () => {
        const first = decideDailyLoginClaim(fresh(), policy, now('2026-09-30T23:59:59Z'));
        const second = decideDailyLoginClaim(first.state, policy, now('2026-10-01T00:00:00Z'));
        expect(second.state.streakDays).toBe(2);
        expect(second.credited).toEqual({ ranked: 2, hint: 3 });
        const third = decideDailyLoginClaim(second.state, policy, now('2026-10-02T00:00:00Z'));
        const fourth = decideDailyLoginClaim(third.state, policy, now('2026-10-03T00:00:00Z'));
        expect(third.state.streakDays).toBe(3);
        expect(fourth.state.streakDays).toBe(3);
        expect(fourth.state.tickets).toEqual({ ranked: 5, hint: 6 });
        expect(fourth.credited).toEqual({ ranked: 0, hint: 0 });
    });

    it('resets after a missed UTC day, including across a year boundary', () => {
        const previous: DailyLoginState = {
            lastClaimUtcDay: '2025-12-31', streakDays: 3, tickets: { ranked: 0, hint: 0 },
        };
        expect(decideDailyLoginClaim(previous, policy, now('2026-01-01T00:00:00Z')).state.streakDays).toBe(3);
        const missed = decideDailyLoginClaim(previous, policy, now('2026-01-02T00:00:00Z'));
        expect(missed.state.streakDays).toBe(1);
        expect(missed.credited).toEqual({ ranked: 1, hint: 2 });
    });

    it('uses the final configured reward tier until the maximum streak', () => {
        const shortPolicy: DailyLoginPolicy = { ...policy, rewardsByStreak: [{ ranked: 0, hint: 1 }] };
        const state: DailyLoginState = { lastClaimUtcDay: '2026-09-29', streakDays: 1, tickets: { ranked: 0, hint: 0 } };
        const result = decideDailyLoginClaim(state, shortPolicy, now('2026-09-30T00:00:00Z'));
        expect(result.state.streakDays).toBe(2);
        expect(result.credited).toEqual({ ranked: 0, hint: 1 });
    });

    it('credits only remaining cap room, with no unsafe integer addition', () => {
        const p: DailyLoginPolicy = {
            rewardsByStreak: [{ ranked: Number.MAX_SAFE_INTEGER, hint: Number.MAX_SAFE_INTEGER }],
            maxStreakDays: 1,
            ticketCaps: { ranked: Number.MAX_SAFE_INTEGER, hint: Number.MAX_SAFE_INTEGER },
        };
        const state: DailyLoginState = { ...fresh(), tickets: { ranked: Number.MAX_SAFE_INTEGER - 1, hint: 0 } };
        const result = decideDailyLoginClaim(state, p, now('2026-09-30T00:00:00Z'));
        expect(result.credited).toEqual({ ranked: 1, hint: Number.MAX_SAFE_INTEGER });
        expect(result.state.tickets).toEqual(p.ticketCaps);
    });

    it('fails closed on invalid dates, future claims, balances, schedules and counts', () => {
        const invalid = [
            [fresh(), policy, new Date('invalid')],
            [{ ...fresh(), lastClaimUtcDay: '2026-02-30', streakDays: 1 }, policy, now('2026-09-30T00:00:00Z')],
            [{ ...fresh(), lastClaimUtcDay: '2026-10-01', streakDays: 1 }, policy, now('2026-09-30T00:00:00Z')],
            [{ ...fresh(), streakDays: 2 }, policy, now('2026-09-30T00:00:00Z')],
            [{ ...fresh(), tickets: { ranked: -1, hint: 0 } }, policy, now('2026-09-30T00:00:00Z')],
            [{ ...fresh(), tickets: { ranked: 6, hint: 0 } }, policy, now('2026-09-30T00:00:00Z')],
            [fresh(), { ...policy, rewardsByStreak: [] }, now('2026-09-30T00:00:00Z')],
            [fresh(), { ...policy, rewardsByStreak: [{ ranked: Number.NaN, hint: 1 }] }, now('2026-09-30T00:00:00Z')],
            [fresh(), { ...policy, rewardsByStreak: new Array(1) }, now('2026-09-30T00:00:00Z')],
            [fresh(), { ...policy, maxStreakDays: 0 }, now('2026-09-30T00:00:00Z')],
        ] as const;
        for (const [state, p, date] of invalid) {
            expect(() => decideDailyLoginClaim(state as DailyLoginState, p as DailyLoginPolicy, date)).toThrow(DailyLoginInputError);
        }
    });
});
