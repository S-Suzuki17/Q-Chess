import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
    enabled: true, effect: null as null | (() => void | (() => void)), foreground: null as null | ((state: { isActive: boolean }) => void),
    subscriber: null as null | (() => void), loaded: false, progress: 0, owner: 'guest',
    remove: vi.fn(), unsubscribe: vi.fn(), sendProgress: vi.fn(), sendMatch: vi.fn(),
}));
vi.mock('react', () => ({ useEffect: (effect: typeof h.effect) => { h.effect = effect; } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn((_event, listener) => { h.foreground = listener; return Promise.resolve({ remove: h.remove }); }) } }));
vi.mock('../lib/playGameStats', () => ({ gameStatsAvailable: () => h.enabled, playGameStats: { progress: h.sendProgress, match: h.sendMatch } }));
vi.mock('../config/campaign', () => ({ totalCircuitStars: (progress: number) => progress }));
vi.mock('../lib/campaignStore', () => ({ campaignStore: {
    getSnapshot: () => ({ loaded: h.loaded, progress: h.progress }), getOwner: () => h.owner,
    subscribe: (listener: () => void) => { h.subscriber = listener; return h.unsubscribe; },
} }));
import { usePlayGameStatsProgress } from './usePlayGameStatsProgress';
import { usePlayGameStatsMatch } from './usePlayGameStatsMatch';
let cleanup: void | (() => void);
beforeEach(() => {
    vi.clearAllMocks(); h.enabled = true; h.loaded = false; h.progress = 0; h.owner = 'guest'; h.subscriber = null; h.foreground = null;
    h.sendProgress.mockResolvedValue('buffered'); h.sendMatch.mockResolvedValue('buffered');
});
const settle = () => new Promise<void>(resolve => setImmediate(resolve));
afterEach(async () => { cleanup?.(); cleanup = undefined; await settle(); });
const mountProgress = () => { usePlayGameStatsProgress(); cleanup = h.effect!(); };

it('waits for persisted progress and reports only progression/owner changes or foreground resumes', async () => {
    mountProgress(); expect(h.sendProgress).not.toHaveBeenCalled();
    h.loaded = true; h.subscriber!(); expect(h.sendProgress).toHaveBeenLastCalledWith(0);
    h.subscriber!(); expect(h.sendProgress).toHaveBeenCalledTimes(1);
    h.progress = 3; h.subscriber!(); expect(h.sendProgress).toHaveBeenLastCalledWith(3);
    h.foreground!({ isActive: false }); expect(h.sendProgress).toHaveBeenCalledTimes(2);
    h.foreground!({ isActive: true }); expect(h.sendProgress).toHaveBeenCalledTimes(3);
    h.owner = 'another-account'; h.subscriber!(); expect(h.sendProgress).toHaveBeenCalledTimes(4);
    cleanup?.(); cleanup = undefined; await settle();
    h.progress = 6; h.subscriber!(); h.foreground!({ isActive: true });
    expect(h.sendProgress).toHaveBeenCalledTimes(4); expect(h.remove).toHaveBeenCalledOnce(); expect(h.unsubscribe).toHaveBeenCalledOnce();
});
it('retries authentication failures on the next store notification', async () => {
    h.loaded = true; h.sendProgress.mockResolvedValueOnce('unauthenticated');
    mountProgress(); await Promise.resolve(); h.subscriber!(); expect(h.sendProgress).toHaveBeenCalledTimes(2);
});
it('keeps the web free of native listeners and reporting', () => {
    h.enabled = false; h.loaded = true; mountProgress();
    expect(h.sendProgress).not.toHaveBeenCalled(); expect(h.foreground).toBeNull(); expect(h.subscriber).toBeNull();
});
it('retries a completed match on foreground and releases the listener when the result closes', async () => {
    const stats = { matchKey: 'local:one', mode: 'practice' as const, timeControl: '10m' as const, result: 'win' as const, playerMoves: 3, captures: 1, checkmate: true };
    usePlayGameStatsMatch(stats); cleanup = h.effect!(); expect(h.sendMatch).toHaveBeenCalledExactlyOnceWith(stats);
    h.foreground!({ isActive: false }); expect(h.sendMatch).toHaveBeenCalledTimes(1);
    h.foreground!({ isActive: true }); expect(h.sendMatch).toHaveBeenCalledTimes(2);
    cleanup?.(); cleanup = undefined; await settle(); h.foreground!({ isActive: true });
    expect(h.sendMatch).toHaveBeenCalledTimes(2); expect(h.remove).toHaveBeenCalledOnce();
});
it('does not report unfinished matches', () => {
    usePlayGameStatsMatch(null); cleanup = h.effect!(); expect(h.sendMatch).not.toHaveBeenCalled(); expect(h.foreground).toBeNull();
});
