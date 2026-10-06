import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CPU_FALLBACK_MS, MatchmakingService } from './MatchmakingService';

function fixture() {
    const io = { emit: vi.fn(), to: vi.fn(() => ({ emit: vi.fn() })), sockets: { sockets: new Map() } };
    const mm = new MatchmakingService(io as any);
    const register = (id: string, socket = `socket:${id}`) => {
        io.sockets.sockets.set(socket, { emit: vi.fn() });
        mm.registerSocket(id, socket, `Name ${id}`);
    };
    return { io, mm, register };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_000_000); vi.spyOn(Math, 'random').mockReturnValue(0.8); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('ranked matchmaking fallback', () => {
    it('waits the full 10 seconds and reserves exactly one CPU match', () => {
        const { mm, register } = fixture(); register('human');
        expect(mm.joinQueue('human', 600, 'Human', 'ranked', 1264).success).toBe(true);
        vi.advanceTimersByTime(9_999);
        expect(mm.takeCpuFallbacks()).toEqual([]);
        vi.advanceTimersByTime(1);
        const [match] = mm.takeCpuFallbacks();
        expect(match).toMatchObject({ mode: 'ranked', timeControl: 600, state: 'CONNECTING', players: { host: 'human' }, cpu: { side: 'joiner', profile: { rating: 1300 } } });
        expect(match.cpu!.id).toBe(`ai:${match.matchId}`);
        expect(match.cpu!.id).not.toContain('GUEST');
        expect(mm.getPlayerSession('human')?.currentMatchId).toBe(match.matchId);
        expect(mm.takeCpuFallbacks()).toEqual([]);
        expect(mm.getQueueStats()).toEqual({});
    });

    it('matches an available human before the fallback deadline', () => {
        const { mm, register } = fixture(); register('first'); register('second');
        mm.joinQueue('first', 180, undefined, 'ranked', 1200);
        vi.advanceTimersByTime(CPU_FALLBACK_MS - 1);
        const matched = mm.joinQueue('second', 180, undefined, 'ranked', 1500);
        expect(matched.match?.players).toEqual({ host: 'first', joiner: 'second' });
        expect(matched.match?.cpu).toBeUndefined();
        vi.advanceTimersByTime(1);
        expect(mm.takeCpuFallbacks()).toEqual([]);
    });

    it('cancels queueing without a later CPU match, including socket disconnect', () => {
        const { mm, register } = fixture(); register('cancel'); register('disconnect');
        mm.joinQueue('cancel', 600, undefined, 'ranked', 1000);
        mm.joinQueue('disconnect', 180, undefined, 'ranked', 1000);
        mm.leaveQueue('cancel'); mm.removeSocket('socket:disconnect');
        vi.advanceTimersByTime(CPU_FALLBACK_MS);
        expect(mm.takeCpuFallbacks()).toEqual([]);
        expect(mm.getPlayerSession('cancel')?.state).toBe('IDLE');
        expect(mm.getPlayerSession('disconnect')?.state).toBe('IDLE');
    });

    it('separates ranked, random and time-control queues and never falls random back to CPU', () => {
        const { mm, register } = fixture();
        for (const id of ['ranked600', 'random600', 'ranked180', 'partner600']) register(id);
        mm.joinQueue('ranked600', 600, undefined, 'ranked', 1000);
        mm.joinQueue('random600', 600, undefined, 'random');
        mm.joinQueue('ranked180', 180, undefined, 'ranked', 1000);
        expect(mm.getMatches()).toHaveLength(0);
        expect(mm.joinQueue('partner600', 600, undefined, 'ranked', 1100).match?.players)
            .toEqual({ host: 'ranked600', joiner: 'partner600' });
        vi.advanceTimersByTime(CPU_FALLBACK_MS);
        const fallback = mm.takeCpuFallbacks();
        expect(fallback).toHaveLength(1);
        expect(Object.values(fallback[0].players)).toContain('ranked180');
        expect(mm.getPlayerSession('random600')?.state).toBe('WAITING');
    });

    it('preserves queue age and opening ratings across duplicate joins and reconnections', () => {
        const { mm, register } = fixture(); register('human');
        mm.joinQueue('human', 10, 'Original', 'ranked', 1375);
        vi.advanceTimersByTime(CPU_FALLBACK_MS / 2);
        const queuedAt = mm.getPlayerSession('human')?.queuedAt;
        register('human', 'new-socket');
        mm.removeSocket('socket:human');
        expect(mm.joinQueue('human', 600, 'Changed', 'ranked', 2200).success).toBe(false);
        expect(mm.getPlayerSession('human')?.queuedAt).toBe(queuedAt);
        vi.advanceTimersByTime(CPU_FALLBACK_MS / 2);
        const [match] = mm.takeCpuFallbacks();
        const first = mm.connectMatch('human', match.matchId, 'Original', undefined, undefined, 1, 2200);
        const again = mm.connectMatch('human', match.matchId, 'Original', undefined, undefined, 1, 2300);
        expect(again.engine).toBe(first.engine);
        expect(first.engine!.getPublicState('human').playerRatings).toEqual({ host: 1375, joiner: 1400 });
        expect(first.engine!.getPublicState('human')).toMatchObject({ mode: 'ranked', cpu: { side: 'joiner', rating: 1400, level: 5 }, introPending: true });
        expect(first.engine!.acknowledgeIntro('human')).toBe(true);
        expect(first.engine!.getPublicState('human').introPending).toBe(false);
        expect(mm.takeCpuFallbacks()).toEqual([]);
    });

    it('requires a real rating for ranked queueing and bounds allowed clock values', () => {
        const { mm, register } = fixture(); register('GUEST-unknown'); register('unknown');
        for (const rating of [undefined, NaN, Infinity, -1]) {
            expect(mm.joinQueue('unknown', 600, undefined, 'ranked', rating).success).toBe(false);
        }
        expect(mm.joinQueue('GUEST-unknown', 600, undefined, 'ranked').success).toBe(false);
        expect(mm.joinQueue('unknown', 60, undefined, 'ranked', 1000).success).toBe(false);
        vi.advanceTimersByTime(CPU_FALLBACK_MS);
        expect(mm.takeCpuFallbacks()).toEqual([]);
    });

    it('caps active CPU matches at four and releases capacity after a match finishes', () => {
        const { mm, register } = fixture();
        const created = [];
        for (let i = 0; i < 5; i++) {
            register(`human${i}`);
            mm.joinQueue(`human${i}`, 600, undefined, 'ranked', 1000);
            // Shift the clock without firing unrelated connection-expiry timers.
            vi.setSystemTime(Date.now() + CPU_FALLBACK_MS);
            created.push(...mm.takeCpuFallbacks());
        }
        expect(created).toHaveLength(4);
        expect(mm.getPlayerSession('human4')?.state).toBe('WAITING');
        mm.finishMatch(created[0]);
        expect(mm.takeCpuFallbacks()).toHaveLength(1);
        expect(mm.getPlayerSession('human4')?.state).toBe('CONNECTING');
    });
});

describe('absolute expiry between queue admission and game start',()=>{
    it('removes expired waiting players before human pairing or CPU fallback',()=>{
        const {mm,register}=fixture();register('expired');register('new');let expired=false;
        mm.canAdmitPlayer=id=>id!=='expired'||!expired;
        expect(mm.joinQueue('expired',600,undefined,'ranked',1000).success).toBe(true);expired=true;
        expect(mm.joinQueue('new',600,undefined,'ranked',1000).match).toBeUndefined();
        expect(mm.getPlayerSession('expired')?.state).toBe('IDLE');
        vi.advanceTimersByTime(CPU_FALLBACK_MS);expect(mm.takeCpuFallbacks().every(m=>Object.values(m.players).includes('new'))).toBe(true);
    });
    it('cancels a private room before start when its waiting host expires, without creating a game or forfeit',()=>{
        const {mm,register}=fixture();register('host');register('joiner');let expired=false;mm.canAdmitPlayer=id=>id!=='host'||!expired;
        mm.connectMatch('host','private-room');expired=true;mm.connectMatch('joiner','private-room');
        expect(mm.getMatch('private-room')?.state).toBe('CANCELLED');expect(mm.getMatch('private-room')?.engine).toBeUndefined();
    });
    it('requests the existing ranked void path if proof expires during durable admission',()=>{
        const io={emit:vi.fn(),to:()=>({emit:vi.fn()}),sockets:{sockets:new Map()}};
        const mm=new MatchmakingService(io as any,true);mm.registerSocket('a','a');mm.registerSocket('b','b');mm.canAdmitPlayer=()=>true;
        mm.joinQueue('a',600,undefined,'ranked',1000);const match=mm.joinQueue('b',600,undefined,'ranked',1000).match!;
        mm.connectMatch('a',match.matchId);mm.connectMatch('b',match.matchId);expect(match.state).toBe('ADMITTING');
        mm.onAdmissionCancel=vi.fn();mm.canAdmitPlayer=()=>false;expect(mm.activateMatch(match)).toBe(false);
        expect(mm.onAdmissionCancel).toHaveBeenCalledWith(match,'authentication_required');expect(match.engine).toBeUndefined();
    });
});
