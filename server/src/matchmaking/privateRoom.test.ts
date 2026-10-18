import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DISCONNECT_GRACE_MS, MatchmakingService } from './MatchmakingService';

function fixture() {
    const emit = vi.fn(), leave = vi.fn(), io = { emit, to: () => ({ emit }), sockets: { sockets: new Map() } };
    const mm = new MatchmakingService(io as never);
    const register = (id: string) => { io.sockets.sockets.set(id, { emit, leave }); mm.registerSocket(id, id); };
    for (const id of ['host', 'joiner', 'other']) register(id);
    const create = (seconds = 180) => mm.reserveMatch('host', 'ROOM01', 'Host', { intent: 'create', timeControl: seconds })!;
    return { mm, emit, leave, register, create };
}
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('private room admission and release', () => {
    it.each(['join','reconnect',undefined] as const)('does not create or bind a player for an unknown %s request', intent => {
        const {mm} = fixture(), before = {...mm.getPlayerSession('joiner')};
        expect(mm.reserveMatch('joiner','TYPO01',undefined,intent ? {intent} : undefined)).toBeUndefined();
        expect(mm.getMatch('TYPO01')).toBeUndefined(); expect(mm.getPlayerSession('joiner')).toEqual(before);
        expect(mm.joinQueue('joiner',600,undefined,'random').success).toBe(true);
    });
    it.each([0,1,181,NaN,'180',undefined])('rejects invalid create time %s without a reservation', timeControl => {
        const {mm} = fixture();
        expect(mm.reserveMatch('host','ROOM01',undefined,{intent:'create',timeControl} as any)).toBeUndefined();
        expect(mm.getMatch('ROOM01')).toBeUndefined(); expect(mm.getPlayerSession('host')?.state).toBe('IDLE');
    });
    it('reserves host and joiner synchronously, admits one competing joiner and keeps creator time', () => {
        const {mm,create} = fixture(), match = create(10);
        expect(mm.getPlayerSession('host')).toMatchObject({state:'CONNECTING',currentMatchId:'ROOM01'});
        expect(mm.reserveMatch('joiner','ROOM01',undefined,{intent:'join'})).toBe(match);
        expect(mm.matchConnectionError('other','ROOM01',{intent:'join'})).toBe('ROOM_FULL');
        expect(mm.reserveMatch('other','ROOM01',undefined,{intent:'join'})).toBeUndefined();
        expect(mm.getPlayerSession('other')?.state).toBe('IDLE');
        expect(mm.reserveMatch('host','ROOM01',undefined,{intent:'create',timeControl:600})).toBe(match);
        expect(match.timeControl).toBe(10);
        mm.connectMatch('joiner','ROOM01'); const ready=mm.connectMatch('host','ROOM01');
        expect(ready.engine?.getPublicState('host').clock.timeControl).toBe(30000);
        expect(mm.cancelWaitingPrivateMatch('host','ROOM01')).toBe(false);
        expect(match.state).toBe('IN_GAME');
    });
    it('releases both an unconnected reservation and a connected waiter without trapping the next queue', () => {
        const {mm,create,emit} = fixture(), match=create();
        mm.reserveMatch('joiner','ROOM01',undefined,{intent:'join'});mm.connectMatch('host','ROOM01');
        expect(mm.cancelWaitingPrivateMatch('other','ROOM01')).toBe(false);
        expect(mm.cancelWaitingPrivateMatch('host','old-room')).toBe(false);
        expect(mm.cancelWaitingPrivateMatch('host','ROOM01')).toBe(true);
        expect(match.state).toBe('CANCELLED');expect(match.engine).toBeUndefined();
        for(const id of ['host','joiner'])expect(mm.getPlayerSession(id)).toMatchObject({state:'IDLE',currentMatchId:undefined});
        expect(mm.connectMatch('joiner','ROOM01').success).toBe(false);
        expect(mm.joinQueue('host',180,undefined,'ranked',1000).success).toBe(true);
        expect(emit).toHaveBeenCalledWith('match_cancelled',{matchId:'ROOM01',reason:'admission_cancelled'});
    });
    it('releases a disconnected waiting room at the fixed deadline and ignores an expired create retry', async () => {
        const {mm,create,register}=fixture(), match=create();mm.connectMatch('host','ROOM01');mm.removeSocket('host');
        await vi.advanceTimersByTimeAsync(DISCONNECT_GRACE_MS-1);expect(match.state).toBe('WAITING_FOR_JOINER');
        await vi.advanceTimersByTimeAsync(1);expect(match.state).toBe('CANCELLED');
        register('host');expect(mm.reserveMatch('host','ROOM01',undefined,{intent:'create',timeControl:180})).toBeUndefined();
        expect(mm.joinQueue('host',600,undefined,'random').success).toBe(true);
    });
    it('reconnects the existing waiting room before the deadline and never resets its time', async () => {
        const {mm,create,register}=fixture(), match=create(180);mm.connectMatch('host','ROOM01');mm.removeSocket('host');
        await vi.advanceTimersByTimeAsync(1000);register('host');
        expect(mm.reserveMatch('host','ROOM01',undefined,{intent:'reconnect'})).toBe(match);
        expect(mm.connectMatch('host','ROOM01').success).toBe(true);
        await vi.advanceTimersByTimeAsync(DISCONNECT_GRACE_MS);expect(match.state).toBe('WAITING_FOR_JOINER');expect(match.timeControl).toBe(180);
    });
});

it.each(['cancel', 'authentication'] as const)('releases only a waiting joiner on %s failure and leaves the creator available', reason => {
    const { mm, create, emit, leave } = fixture(), match = create(180);
    mm.connectMatch('host', 'ROOM01');
    mm.reserveMatch('joiner', 'ROOM01', 'Failed joiner', { intent: 'join' });
    match.appearances = { joiner: { avatar: 'old', intro: true, rating: 1200 } };
    emit.mockClear();
    if (reason === 'authentication') mm.authenticationUnavailable('joiner');
    else expect(mm.cancelWaitingPrivateMatch('joiner', 'ROOM01')).toBe(true);
    expect(match).toMatchObject({ state: 'WAITING_FOR_JOINER', timeControl: 180, players: { host: 'host', joiner: '' }, connected: { host: true, joiner: false } });
    expect(match.playerNames.joiner).toBeUndefined(); expect(match.appearances.joiner).toBeUndefined();
    expect(leave).toHaveBeenCalledWith('ROOM01');
    expect(mm.getPlayerSession('host')).toMatchObject({ state: 'CONNECTING', currentMatchId: 'ROOM01' });
    expect(mm.getPlayerSession('joiner')?.state).toBe('IDLE');
    expect(mm.getPlayerSession('joiner')?.currentMatchId).toBeUndefined();
    expect(mm.joinQueue('joiner', 600, undefined, 'random').success).toBe(true);
    expect(mm.reserveMatch('other', 'ROOM01', undefined, { intent: 'join' })).toBe(match);
    const ready = mm.connectMatch('other', 'ROOM01');
    expect(ready.engine?.getPublicState('host')).toMatchObject({ players: { joiner: 'other' }, clock: { timeControl: 180000 } });
});
