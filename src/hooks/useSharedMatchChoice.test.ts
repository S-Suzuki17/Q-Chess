import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ slots: [] as any[], cursor: 0, cleanups: new Set<() => void>() }));
vi.mock('react', () => ({
    useRef: (value: unknown) => { const i = h.cursor++; return h.slots[i] ??= { current: value }; },
    useState: (value: unknown) => {
        const i = h.cursor++;
        if (!(i in h.slots)) h.slots[i] = value;
        return [h.slots[i], (next: unknown) => { h.slots[i] = typeof next === 'function' ? next(h.slots[i]) : next; }];
    },
    useCallback: (fn: unknown) => fn,
    useMemo: (factory: () => unknown, deps: unknown[]) => {
        const i = h.cursor++, old = h.slots[i];
        if (!old || deps.some((d, j) => d !== old.deps[j])) h.slots[i] = { deps, value: factory() };
        return h.slots[i].value;
    },
    useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
        const i = h.cursor++, old = h.slots[i];
        if (!old || deps.some((d, j) => d !== old.deps[j])) {
            old?.cleanup?.();
            h.cleanups.delete(old?.cleanup);
            const cleanup = effect();
            h.slots[i] = { deps, cleanup, effect };
            if (cleanup) h.cleanups.add(cleanup);
        }
    },
}));
import { useSharedMatchChoice } from './useSharedMatchChoice';

const matchId = '10000000-0000-4000-8000-000000000001';
const nextId = '10000000-0000-4000-8000-000000000002';
const grantId = '20000000-0000-4000-8000-000000000001';
const offer = { matchId, dailyFreeMatches: 3, ticketCost: 1, verifiedAdMatches: 1, verifiedAdAvailable: false };
function makeSocket() {
    const listeners = new Map<string, (data: any) => void>();
    return {
        connected: true,
        emit: vi.fn(),
        on: (event: string, fn: (data: unknown) => void) => listeners.set(event, fn),
        off: (event: string, fn: (data: unknown) => void) => { if (listeners.get(event) === fn) listeners.delete(event); },
        receive: (event: string, data?: unknown) => listeners.get(event)?.(data),
        listeners,
    };
}
let socket: ReturnType<typeof makeSocket>;
const Render = (id: string | undefined = matchId, transport: typeof socket | null = socket) => {
    h.cursor = 0;
    return useSharedMatchChoice(transport as never, id);
};
beforeEach(() => { h.slots = []; h.cursor = 0; h.cleanups.clear(); socket = makeSocket(); });
afterEach(async () => { h.cleanups.forEach(fn => fn()); await Promise.resolve(); });

it('never emits consent on offer, rerender, reconnect or unavailable ad click', () => {
    Render(); socket.receive('match_admission_choice_required', offer); Render(); Render().choose('verified_ad');
    socket.connected = false; socket.receive('disconnect'); Render();
    socket.connected = true; socket.receive('connect'); Render();
    expect(socket.emit).not.toHaveBeenCalled();
});
it('an explicit click binds one match and source and coalesces double clicks and re-offers', () => {
    Render(); socket.receive('match_admission_choice_required', offer); const choice = Render();
    choice.choose('ticket'); socket.receive('match_admission_choice_required', offer); choice.choose('ticket');
    expect(socket.emit).toHaveBeenCalledExactlyOnceWith('choose_match_admission', { matchId, source: 'ticket' });
    expect(Render().pending).toBe(true);
});
it('binds a valid verified grant only after an explicit ad choice', () => {
    Render(); socket.receive('match_admission_choice_required', { ...offer, verifiedAdAvailable: true, grantId: 'invalid' });
    expect(Render().offer).toBeNull();
    socket.receive('match_admission_choice_required', { ...offer, verifiedAdAvailable: true, grantId });
    expect(socket.emit).not.toHaveBeenCalled(); Render().choose('verified_ad');
    expect(socket.emit).toHaveBeenCalledExactlyOnceWith('choose_match_admission', { matchId, source: 'verified_ad', grantId });
});
it('wrong-match offers and errors cannot authorize spending or unlock a pending choice', () => {
    Render(); socket.receive('match_admission_choice_required', { ...offer, matchId: nextId }); Render().choose('ticket');
    expect(socket.emit).not.toHaveBeenCalled();
    socket.receive('match_admission_choice_required', offer); Render().choose('ticket');
    socket.receive('match_admission_choice_error', { matchId: nextId }); socket.receive('match_start', { matchId: nextId });
    expect(Render().pending).toBe(true); expect(Render().offer).toEqual(offer);
});
it('error allows retry only by a new click and terminal cancellation clears the offer', () => {
    Render(); socket.receive('match_admission_choice_required', offer); Render().choose('ticket');
    socket.receive('match_admission_choice_error', { matchId });
    expect(Render().pending).toBe(false); expect(Render().error).toBe(true); expect(socket.emit).toHaveBeenCalledTimes(1);
    Render().choose('ticket'); expect(socket.emit).toHaveBeenCalledTimes(2); expect(Render().error).toBe(false);
    socket.receive('match_cancelled', { matchId }); expect(Render().offer).toBeNull();
});
it('clears pending and error when a cancelled match is replaced on the same hook', () => {
    Render(); socket.receive('match_admission_choice_required', offer); Render().choose('ticket');
    expect(Render().pending).toBe(true); Render().cancel();
    expect(Render().pending).toBe(false); expect(Render().error).toBe(false);
    Render(nextId); socket.receive('match_admission_choice_required', { ...offer, matchId: nextId });
    const next = Render(nextId); expect(next.offer?.matchId).toBe(nextId); expect(next.pending).toBe(false); expect(next.error).toBe(false);
    next.choose('ticket'); expect(socket.emit).toHaveBeenLastCalledWith('choose_match_admission', { matchId: nextId, source: 'ticket' });
});
it('hides the old offer and error immediately when the match changes before a re-offer', () => {
    Render(); socket.receive('match_admission_choice_required', offer); Render().choose('ticket');
    socket.receive('match_admission_choice_error', { matchId }); expect(Render().error).toBe(true);
    const next = Render(nextId); expect(next.offer).toBeNull(); expect(next.error).toBe(false); expect(next.pending).toBe(false);
});
it('ignores queued callbacks and click closures from an old match after a newer choice is pending', () => {
    Render(); socket.receive('match_admission_choice_required', offer); const oldChoice = Render();
    const oldEvents = new Map(socket.listeners);
    Render(nextId); socket.receive('match_admission_choice_required', { ...offer, matchId: nextId }); Render(nextId).choose('ticket');
    oldEvents.get('match_admission_choice_error')!({ matchId }); oldEvents.get('match_start')!({ matchId });
    oldEvents.get('match_cancelled')!({ matchId }); oldEvents.get('disconnect')!({}); oldEvents.get('match_admission_choice_required')!(offer);
    oldChoice.choose('ticket'); oldChoice.cancel();
    const next = Render(nextId); expect(next.offer?.matchId).toBe(nextId); expect(next.pending).toBe(true); expect(next.error).toBe(false);
    expect(socket.emit).toHaveBeenCalledExactlyOnceWith('choose_match_admission', { matchId: nextId, source: 'ticket' });
});
it('socket/account replacement requires a fresh offer and isolates same-match old callbacks', async () => {
    Render(); socket.receive('match_admission_choice_required', offer); const oldChoice = Render(); oldChoice.choose('ticket');
    const oldEvents = new Map(socket.listeners), replacement = makeSocket();
    const empty = Render(matchId, replacement); expect(empty.offer).toBeNull(); expect(empty.pending).toBe(false);
    oldChoice.choose('ticket'); oldChoice.cancel();
    replacement.receive('match_admission_choice_required', offer); Render(matchId, replacement).choose('ticket');
    oldEvents.get('match_admission_choice_error')!({ matchId }); oldEvents.get('match_cancelled')!({ matchId }); oldEvents.get('disconnect')!({});
    oldEvents.get('match_admission_choice_required')!({ ...offer, verifiedAdAvailable: true, grantId });
    expect(Render(matchId, replacement).pending).toBe(true); expect(Render(matchId, replacement).offer).toEqual(offer);
    await Promise.resolve();
    expect(socket.emit).toHaveBeenCalledExactlyOnceWith('choose_match_admission', { matchId, source: 'ticket' });
    expect(replacement.emit).toHaveBeenCalledExactlyOnceWith('choose_match_admission', { matchId, source: 'ticket' });
});
it('cancel revokes a retained click closure and ignores late offers and replies', () => {
    Render(); socket.receive('match_admission_choice_required', offer); const choice = Render(); choice.cancel();
    choice.choose('ticket'); choice.cancel(); socket.receive('match_admission_choice_required', offer);
    socket.receive('match_admission_choice_error', { matchId });
    expect(Render().offer).toBeNull(); expect(Render().pending).toBe(false); expect(Render().error).toBe(false);
    expect(socket.emit).toHaveBeenCalledExactlyOnceWith('cancel_match_admission', { matchId });
});
it('disconnect revokes the old grant and reconnect needs a re-offer and a new explicit click', () => {
    Render(); socket.receive('match_admission_choice_required', { ...offer, verifiedAdAvailable: true, grantId });
    const choice = Render(); choice.choose('verified_ad'); socket.connected = false; socket.receive('disconnect');
    socket.receive('match_admission_choice_required', offer); expect(Render().offer).toBeNull();
    socket.connected = true; socket.receive('connect'); choice.choose('verified_ad'); expect(socket.emit).toHaveBeenCalledTimes(1);
    const nextGrant = '20000000-0000-4000-8000-000000000002';
    socket.receive('match_admission_choice_required', { ...offer, verifiedAdAvailable: true, grantId: nextGrant });
    expect(Render().pending).toBe(false); expect(socket.emit).toHaveBeenCalledTimes(1); Render().choose('verified_ad');
    expect(socket.emit).toHaveBeenLastCalledWith('choose_match_admission', { matchId, source: 'verified_ad', grantId: nextGrant });
});
it('null socket hides state, revokes callbacks and never buffers cancellation onto a disconnected socket', async () => {
    Render(); socket.receive('match_admission_choice_required', offer); const choice = Render(); choice.choose('ticket');
    socket.connected = false; const absent = Render(matchId, null); choice.choose('ticket'); choice.cancel();
    expect(absent.offer).toBeNull(); expect(absent.pending).toBe(false); expect(absent.error).toBe(false);
    await Promise.resolve(); expect(socket.emit).toHaveBeenCalledTimes(1);
});
it('StrictMode cleanup replay does not cancel the live scope; real unmount does', async () => {
    Render();
    const slot = h.slots.find(value => value?.effect);
    slot.cleanup(); h.cleanups.delete(slot.cleanup); slot.cleanup = slot.effect(); h.cleanups.add(slot.cleanup);
    await Promise.resolve(); expect(socket.emit).not.toHaveBeenCalled();
    socket.receive('match_admission_choice_required', offer); expect(Render().offer).toEqual(offer);
    slot.cleanup(); h.cleanups.delete(slot.cleanup); await Promise.resolve();
    expect(socket.emit).toHaveBeenCalledExactlyOnceWith('cancel_match_admission', { matchId });
});
