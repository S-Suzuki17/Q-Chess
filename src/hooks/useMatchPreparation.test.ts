import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Socket } from 'socket.io-client';
const h = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[], effects: [] as Array<() => void>, cleanups: new Map<number, () => void>() }));
vi.mock('react', async original => {
    const react = await original<typeof import('react')>();
    return { ...react,
        useState(initial: unknown) { const i = h.cursor++; if (!(i in h.slots)) h.slots[i] = initial; return [h.slots[i], (value: unknown) => { h.slots[i] = value; }]; },
        useEffect(effect: () => void | (() => void), deps: unknown[]) {
            const i = h.cursor++, previous = h.slots[i] as unknown[] | undefined;
            if (!previous || deps.some((value, j) => value !== previous[j])) {
                h.slots[i] = deps; h.effects.push(() => { h.cleanups.get(i)?.(); const cleanup = effect(); if (cleanup) h.cleanups.set(i, cleanup); else h.cleanups.delete(i); });
            }
        },
    };
});
import { matchPreparationReason, useMatchPreparation } from './useMatchPreparation';
class Transport {
    connected = true;
    handlers = new Map<string, (data: unknown) => void>();
    on(event: string, listener: (data: unknown) => void) { this.handlers.set(event, listener); }
    off(event: string, listener: (data: unknown) => void) { if (this.handlers.get(event) === listener) this.handlers.delete(event); }
    emit = vi.fn();
    receive(event: string, data: unknown) { this.handlers.get(event)?.(data); }
}
let socket: Transport;
let latestSnapshot: { current: { matchId: string; version: number } | null };
function render(roomId = 'match-a', userId = 'Alice') {
    h.cursor = 0; const state = useMatchPreparation(socket as unknown as Socket, roomId, userId, latestSnapshot);
    h.effects.splice(0).forEach(effect => effect()); return state;
}
const unmount = () => { h.cleanups.forEach(cleanup => cleanup()); h.cleanups.clear(); };
const preparing = (reason = 'admitting', matchId = 'match-a') => socket.receive('match_preparing', { matchId, reason });
beforeEach(() => { vi.useFakeTimers(); h.cursor = 0; h.slots = []; h.effects = []; socket = new Transport(); latestSnapshot = { current: null }; });
afterEach(() => { unmount(); vi.useRealTimers(); });

it('maps every T1 reason and safely handles future reasons without showing server strings', () => {
    for (const [reason, expected] of [['admitting', 'admitting'], ['voiding', 'recovering'], ['owner_recovery', 'recovering'], ['owner_unavailable', 'recovering'], ['recovery_unavailable', 'unavailable'], ['private internal message', 'checking']]) {
        expect(matchPreparationReason({ matchId: 'match-a', reason }, 'match-a')).toBe(expected);
    }
    for (const data of [null, {}, { matchId: 'other', reason: 'admitting' }, { matchId: 'match-a', reason: 3 }]) expect(matchPreparationReason(data, 'match-a')).toBeNull();
});
it('polls only the same pending match, never queues, and stops after a valid start/sync', async () => {
    render(); preparing(); expect(render()).toBe('admitting');
    await vi.advanceTimersByTimeAsync(5000); expect(socket.emit).toHaveBeenCalledExactlyOnceWith('request_sync', { matchId: 'match-a' });
    socket.receive('match_start', { matchId: 'other', version: 0 }); expect(render()).toBe('admitting');
    socket.receive('match_start', { matchId: 'match-a', version: 0 }); expect(render()).toBeNull();
    await vi.advanceTimersByTimeAsync(10000); expect(socket.emit).toHaveBeenCalledTimes(1);
    preparing('owner_unavailable'); expect(render()).toBe('recovering');
    socket.receive('sync_state', { matchId: 'match-a', version: 1 }); expect(render()).toBeNull();
});
it('keeps recovery active on a delayed or malformed snapshot', () => {
    render(); socket.receive('sync_state', { matchId: 'match-a', version: 10 }); preparing('voiding');
    socket.receive('sync_state', { matchId: 'match-a', version: 9 }); expect(render()).toBe('recovering');
    socket.receive('sync_state', { matchId: 'match-a' }); expect(render()).toBe('recovering');
});
it('shares the board version guard after replacing the socket so an older snapshot cannot resume play', () => {
    latestSnapshot.current = { matchId: 'match-a', version: 10 };
    render(); socket = new Transport(); render(); preparing('owner_recovery');
    socket.receive('sync_state', { matchId: 'match-a', version: 9 }); expect(render()).toBe('recovering');
    socket.receive('sync_state', { matchId: 'match-a', version: 10 }); expect(render()).toBeNull();
});
it('clears on cancellation and ignores a delayed preparing message afterward', async () => {
    render(); preparing('owner_recovery'); socket.receive('match_cancelled', { matchId: 'other' }); expect(render()).toBe('recovering');
    socket.receive('match_cancelled', { matchId: 'match-a' }); preparing(); expect(render()).toBeNull();
    await vi.advanceTimersByTimeAsync(5000); expect(socket.emit).not.toHaveBeenCalled();
});
it('clears only for a verified saved result for this account and match', () => {
    const receipt = { matchId: 'match-a', userId: 'Alice', before: 1000, after: 1004, delta: 4, timeControl: 600 };
    render(); preparing('recovery_unavailable');
    socket.receive('rating_settled', { ...receipt, userId: 'Bob' }); expect(render()).toBe('unavailable');
    socket.receive('rating_settled', { ...receipt, delta: 999 }); expect(render()).toBe('unavailable');
    socket.receive('rating_settled', receipt); preparing(); expect(render()).toBeNull();
});
it('does not regress a completed game snapshot into preparation', () => {
    render(); socket.receive('sync_state', { matchId: 'match-a', version: 9, gameOver: 'WHITE' }); preparing(); expect(render()).toBeNull();
});
it('does not leak state across room/account/socket changes or retain listeners after unmount', async () => {
    render(); preparing(); expect(render('match-b')).toBeNull();
    preparing('admitting', 'match-a'); expect(render('match-b')).toBeNull();
    preparing('admitting', 'match-b'); expect(render('match-b', 'Bob')).toBeNull();
    const previous = socket; socket = new Transport(); expect(render('match-b', 'Bob')).toBeNull();
    expect(previous.handlers.size).toBe(0);
    preparing('admitting', 'match-b'); unmount(); await vi.advanceTimersByTimeAsync(5000);
    expect(socket.handlers.size).toBe(0); expect(socket.emit).not.toHaveBeenCalled();
});
it('keeps the recovery label while disconnected without queueing buffered sync requests', async () => {
    render(); preparing('owner_recovery'); socket.connected = false; await vi.advanceTimersByTimeAsync(10000);
    expect(render()).toBe('recovering'); expect(socket.emit).not.toHaveBeenCalled();
});
