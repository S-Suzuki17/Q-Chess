import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createDailyLoginStore, parseDailyLoginClaim, parseDailyLoginState } from './DailyLoginStore';

const response = {
    userId: 'Alice', enabled: true, lastClaimUtcDay: '2026-09-30', streakDays: 3,
    tickets: { ranked: 4, hint: 6 }, claimed: true, credited: { ranked: 1, hint: 2 },
};

describe('daily login reward store', () => {
    it('validates calendar days, streak bounds, balances and replay credit', () => {
        expect(parseDailyLoginState(response)).toEqual({
            lastClaimUtcDay: '2026-09-30', streakDays: 3, tickets: { ranked: 4, hint: 6 },
        });
        expect(parseDailyLoginClaim(response)?.credited).toEqual({ ranked: 1, hint: 2 });
        expect(parseDailyLoginClaim({ ...response, claimed: false, credited: { ranked: 0, hint: 0 } })?.claimed).toBe(false);
        for (const invalid of [
            { ...response, lastClaimUtcDay: '2026-02-30' },
            { ...response, streakDays: 8 },
            { ...response, tickets: { ranked: 21, hint: 6 } },
            { ...response, tickets: { ranked: -1, hint: 6 } },
            { ...response, streakDays: 0 },
        ]) expect(parseDailyLoginState(invalid)).toBeNull();
        expect(parseDailyLoginClaim({ ...response, claimed: false })).toBeNull();
        expect(parseDailyLoginClaim({ ...response, credited: { ranked: 22, hint: 0 } })).toBeNull();
    });

    it('calls service-only status and claim RPCs without accepting a client date or amount', async () => {
        const rpc = vi.fn((_name: string, _args: unknown) => ({
            abortSignal: vi.fn().mockResolvedValue({ data: response, error: null }),
        }));
        const store = createDailyLoginStore({ rpc } as unknown as SupabaseClient,
            async () => 'Alice', async () => false);
        expect((await store.read('Alice')).tickets).toEqual({ ranked: 4, hint: 6 });
        expect((await store.claim('Alice')).credited).toEqual({ ranked: 1, hint: 2 });
        expect(rpc.mock.calls).toEqual([
            ['daily_login_reward_status', { p_user_id: 'Alice' }],
            ['claim_daily_login_reward', { p_user_id: 'Alice' }],
        ]);
    });

    it('fails closed on wrong owner, malformed payload or DB errors', async () => {
        let data: unknown = { ...response, userId: 'Bob' }, error: unknown = null;
        const rpc = vi.fn(() => ({ abortSignal: vi.fn().mockImplementation(async () => ({ data, error })) }));
        const store = createDailyLoginStore({ rpc } as unknown as SupabaseClient,
            async () => 'Alice', async () => false);
        await expect(store.read('Alice')).rejects.toThrow('REWARD_UNAVAILABLE');
        data = { ...response, enabled: false };
        await expect(store.claim('Alice')).rejects.toThrow('REWARD_UNAVAILABLE');
        data = response; error = { code: 'PGRST202' };
        await expect(store.read('Alice')).rejects.toThrow('REWARD_UNAVAILABLE');
    });
});
it('accepts only explicit v2 unlimited-safe balances and bounded v2 grant values', () => {
    const v2 = {...response,rewardPolicyVersion:2,tickets:{ranked:200,hint:300},credited:{ranked:2,hint:0}};
    expect(parseDailyLoginState(v2)).toMatchObject({rewardPolicyVersion:2,tickets:{ranked:200,hint:300}});
    expect(parseDailyLoginClaim(v2)?.credited).toEqual({ranked:2,hint:0});
    for (const invalid of [
        {...v2,rewardPolicyVersion:3}, {...v2,rewardPolicyVersion:'2'},
        {...v2,tickets:{ranked:Number.MAX_SAFE_INTEGER+1,hint:0}},
        {...v2,tickets:{ranked:1.1,hint:0}},
    ]) expect(parseDailyLoginState(invalid)).toBeNull();
    expect(parseDailyLoginClaim({...v2,credited:{ranked:4,hint:0}})).toBeNull();
    expect(parseDailyLoginClaim({...v2,credited:{ranked:3,hint:2}})).toBeNull();
});
