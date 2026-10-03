import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { User } from '../types/game';

const harness = vi.hoisted(() => ({
    slots: [] as Array<{ deps: unknown[]; cleanup?: () => void } | undefined>,
    cursor: 0,
    allowed: false,
    revision: 1,
    enabled: true,
    claim: vi.fn(),
    canPlay: vi.fn(),
}));
vi.mock('react', async original => ({
    ...await original<typeof import('react')>(),
    useEffect(effect: () => void | (() => void), deps: unknown[]) {
        const index = harness.cursor++;
        const previous = harness.slots[index];
        if (!previous || deps.some((value, key) => value !== previous.deps[key])) {
            previous?.cleanup?.();
            harness.slots[index] = { deps, cleanup: effect() || undefined };
        }
    },
}));
vi.mock('../hooks/useCircuitAccess', () => ({
    useCircuitAccess: () => ({ allowed: harness.allowed, revision: harness.revision }),
}));
vi.mock('../lib/circuitAccess', () => ({ circuitAccess: { canPlay: harness.canPlay } }));
vi.mock('../lib/dailyLoginRewards', () => ({
    get DAILY_LOGIN_REWARDS_ENABLED() { return harness.enabled; },
    DAILY_LOGIN_REWARD_CHANGED_EVENT: 'qg-daily-login-reward-changed',
    claimDailyLoginReward: harness.claim,
}));

import { DailyLoginClaimController } from './DailyLoginClaimController';

const account: User = { id: 'Alice', name: 'Alice', type: 'registered' };
const guest: User = { id: 'GUEST-Alice', name: 'Guest', type: 'guest' };
const render = (user: User | null, termsReady: boolean) => {
    harness.cursor = 0;
    DailyLoginClaimController({ user, termsReady });
};
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

beforeEach(() => {
    harness.slots = []; harness.cursor = 0; harness.allowed = false; harness.revision = 1;
    harness.enabled = true;
    harness.claim.mockReset().mockResolvedValue({});
    harness.canPlay.mockReset().mockReturnValue(true);
    vi.stubGlobal('window', new EventTarget());
});
afterEach(() => {
    for (const slot of harness.slots) slot?.cleanup?.();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

it('claims only after verified registered access and current terms readiness', async () => {
    render(account, false);
    harness.allowed = true; render(account, false);
    render(guest, true);
    expect(harness.claim).not.toHaveBeenCalled();

    const events: string[] = [];
    window.addEventListener('qg-daily-login-reward-changed', event => {
        events.push((event as CustomEvent<{ userId: string }>).detail.userId);
    });
    render(account, true);
    render(account, true);
    expect(harness.claim).toHaveBeenCalledExactlyOnceWith('Alice', expect.any(AbortSignal));
    await flush();
    expect(events).toEqual(['Alice']);
});

it('does not claim or announce rewards while OFF even for a verified account', async () => {
    harness.enabled = false; harness.allowed = true;
    const events: Event[] = [];
    window.addEventListener('qg-daily-login-reward-changed', event => events.push(event));
    render(account, true);
    await flush();
    expect(harness.claim).not.toHaveBeenCalled();
    expect(events).toHaveLength(0);
});

it('aborts a stale login and never announces its claim after access is revoked', async () => {
    let finish!: (value: unknown) => void;
    harness.claim.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    harness.allowed = true;
    const events: Event[] = [];
    window.addEventListener('qg-daily-login-reward-changed', event => events.push(event));
    render(account, true);
    const signal = harness.claim.mock.calls[0][1] as AbortSignal;
    harness.allowed = false; harness.revision++;
    render(account, true);
    expect(signal.aborted).toBe(true);
    finish({}); await flush();
    expect(events).toHaveLength(0);
});

it('does not expose a successful result when server validation loses access', async () => {
    harness.allowed = true;
    harness.canPlay.mockReturnValue(false);
    const events: Event[] = [];
    window.addEventListener('qg-daily-login-reward-changed', event => events.push(event));
    render(account, true);
    await flush();
    expect(harness.claim).not.toHaveBeenCalled();
    expect(events).toHaveLength(0);
});
it('reclaims after the next UTC day while open, without duplicate claims on the same day', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-03T23:59:59Z'));
    harness.allowed = true; render(account, true); await flush();
    expect(harness.claim).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1100);
    expect(harness.claim).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5000);
    expect(harness.claim).toHaveBeenCalledTimes(2);
});

it('retries the current UTC day only for the newly consenting owner', async () => {
    harness.allowed=true;render(account,true);await flush();expect(harness.claim).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new CustomEvent('qg-current-terms-accepted',{detail:{userId:'Bob'}}));await flush();expect(harness.claim).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new CustomEvent('qg-current-terms-accepted',{detail:{userId:'Alice'}}));await flush();expect(harness.claim).toHaveBeenCalledTimes(2);
});
