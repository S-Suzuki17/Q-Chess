import { afterEach, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({ read: vi.fn(), claim: vi.fn() }));
vi.mock('react', async original => {
    const react = await original<typeof import('react')>();
    const hooks = { useState: () => [null, vi.fn()], useEffect: (effect: () => void) => effect() };
    return { ...react, ...hooks, default: { ...react, ...hooks } };
});
vi.mock('../hooks/useCircuitAccess', () => ({ useCircuitAccess: () => ({ allowed: true, revision: 1 }) }));
vi.mock('../lib/SocketContext', () => ({ useSocket: () => ({ sharedAdmissionEnabled: null }) }));
vi.mock('../lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('../lib/dailyLoginRewards', async original => ({
    ...await original<typeof import('../lib/dailyLoginRewards')>(),
    readDailyLoginStatus: calls.read, claimDailyLoginReward: calls.claim,
}));
import { DailyLoginClaimController } from './DailyLoginClaimController';
import { DailyLoginRewardsPanel } from './DailyLoginRewardsPanel';

afterEach(() => vi.unstubAllGlobals());

it('hides the actual OFF rewards UI and makes no status or claim request after login', () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const user = { id: 'Alice', name: 'Alice', type: 'registered' as const };
    expect(DailyLoginClaimController({ user, termsReady: true })).toBeNull();
    expect(DailyLoginRewardsPanel({ user, lang: 'ja' })).toBeNull();
    expect(calls.read).not.toHaveBeenCalled();
    expect(calls.claim).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
});
