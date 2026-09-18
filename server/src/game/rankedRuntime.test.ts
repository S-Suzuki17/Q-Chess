import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MatchmakingService, type MatchSession } from '../matchmaking/MatchmakingService';
import { RankedRuntime } from './RankedRuntime';
import type { RankCpuWorkerResponse } from './rankCpuWorker';

const openingMove = { pieceId: 1, toX: 0, toY: 2 };
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
function fixture(timeControl = 600) {
    const events: { room?: string; event: string; payload: any }[] = [];
    const humanSocket = { emit: vi.fn((event: string, payload: any) => events.push({ room: 'human-socket', event, payload })) };
    const io = {
        emit: vi.fn((event: string, payload: any) => events.push({ event, payload })),
        to: (room: string) => ({ emit: (event: string, payload: any) => events.push({ room, event, payload }) }),
        sockets: { sockets: new Map([['human-socket', humanSocket]]) },
    };
    const mm = new MatchmakingService(io as any);
    mm.registerSocket('human', 'human-socket', 'Human');
    mm.joinQueue('human', timeControl, 'Human', 'ranked', 1234);
    vi.advanceTimersByTime(60_000);
    const [match] = mm.takeCpuFallbacks();
    mm.connectMatch('human', match.matchId, 'Human', undefined, undefined, 1, 1234);
    match.engine!.acknowledgeIntro('human');
    vi.advanceTimersByTime(250);
    const result = { timeControl, black: { userId: 'human', before: 1234, after: 1218, delta: -16 } };
    return { io, mm, match, events, humanSocket, result };
}
function resign(match: MatchSession) {
    const state = match.engine!.getPublicState('human');
    expect(match.engine!.processAction({ actionId: 'resign-human', version: state.version, playerId: 'human', action: { type: 'RESIGN', payload: {} } }).success).toBe(true);
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_000_000); vi.spyOn(Math, 'random').mockReturnValue(0.2); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('ranked runtime', () => {
    it('applies a legal asynchronous CPU move once and includes it in the replay history', async () => {
        const { io, mm, match, result } = fixture();
        const cpu = deferred<RankCpuWorkerResponse>();
        const runCpu = vi.fn(() => cpu.promise);
        const settle = vi.fn(async () => result);
        const runtime = new RankedRuntime(io as any, mm, settle, runCpu);
        runtime.tick(); runtime.tick();
        expect(runCpu).toHaveBeenCalledTimes(1);
        cpu.resolve({ version: 0, move: openingMove }); await flush();
        expect(match.engine!.getPublicState('human')).toMatchObject({ version: 1, turn: 1, moveCount: 1 });
        runtime.tick(); expect(runCpu).toHaveBeenCalledTimes(1);
        resign(match); runtime.afterAction(match); await flush();
        expect(settle).toHaveBeenCalledTimes(1);
        expect(match.settlement).toBe('saved');
        expect(match.engine!.getHistory()).toEqual([{turn:1,player:'white',tokenId:'token_17',from:[6,0],to:[5,0],possibleTypes:expect.any(Array),replayVersion:2,changes:[[17,40,57,1,0]]}]);
    });

    it('discards a stale successful worker result after the authoritative version changes', async () => {
        const { io, mm, match } = fixture();
        const cpu = deferred<RankCpuWorkerResponse>();
        const runtime = new RankedRuntime(io as any, mm, vi.fn(), () => cpu.promise);
        runtime.tick();
        expect(match.engine!.processAction({ actionId: 'external-move', version: 0, playerId: match.cpu!.id, action: { type: 'MOVE', payload: openingMove } }).success).toBe(true);
        cpu.resolve({ version: 0, move: { pieceId: -1, toX: -1, toY: -1 } }); await flush();
        expect(match.state).toBe('IN_GAME');
        expect(match.engine!.getPublicState('human')).toMatchObject({ version: 1, moveCount: 1 });
    });

    it.each(['reject', 'no-move', 'illegal-move'])('voids %s CPU failures without recording rating changes', async kind => {
        const { io, mm, match, events } = fixture();
        const settle = vi.fn();
        const runCpu = vi.fn(async () => {
            if (kind === 'reject') throw new Error('worker failure');
            return { version: 0, move: kind === 'no-move' ? null : { pieceId: -1, toX: 0, toY: 0 } };
        });
        const runtime = new RankedRuntime(io as any, mm, settle, runCpu);
        runtime.tick(); await flush(); runtime.tick();
        expect(match.state).toBe('CANCELLED');
        expect(match.settlement).toBeUndefined();
        expect(settle).not.toHaveBeenCalled();
        expect(events).toContainEqual({ room: match.matchId, event: 'match_cancelled', payload: { matchId:match.matchId,reason: 'cpu_unavailable' } });
        expect(mm.getPlayerSession('human')?.state).toBe('IDLE');
    });

    it('settles an idle clock timeout exactly once even with concurrent ticks and an unfinished worker', async () => {
        const { io, mm, match, result } = fixture(10);
        const cpu = deferred<RankCpuWorkerResponse>();
        const save = deferred<typeof result>();
        const settle = vi.fn(() => save.promise);
        const runtime = new RankedRuntime(io as any, mm, settle, () => cpu.promise);
        runtime.tick();
        vi.advanceTimersByTime(10_001); runtime.tick(); runtime.tick(); runtime.afterAction(match);
        expect(match.engine!.getPublicState('human')).toMatchObject({ gameOver: 'BLACK', gameOverReason: 'timeout' });
        expect(match.state).toBe('FINISHED'); expect(settle).toHaveBeenCalledTimes(1);
        cpu.resolve({ version: 0, move: openingMove }); save.resolve(result); await flush(); runtime.tick();
        expect(match.settlement).toBe('saved'); expect(settle).toHaveBeenCalledTimes(1);
        expect(match.engine!.getPublicState('human').moveCount).toBe(0);
    });

    it('settles disconnect forfeit once and cancels old disconnect timers on reconnection', async () => {
        const { io, mm, match, result } = fixture();
        const settle = vi.fn(async () => result);
        const runtime = new RankedRuntime(io as any, mm, settle, vi.fn());
        mm.removeSocket('human-socket');
        vi.advanceTimersByTime(15_000);
        mm.registerSocket('human', 'replacement-socket');
        mm.connectMatch('human', match.matchId);
        vi.advanceTimersByTime(15_001);
        expect(match.engine!.getPublicState('human').gameOver).toBeNull();
        mm.removeSocket('replacement-socket'); mm.removeSocket('replacement-socket');
        vi.advanceTimersByTime(29_999); expect(settle).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1); await flush(); runtime.tick();
        expect(match.engine!.getPublicState('human')).toMatchObject({ gameOver: 'WHITE', gameOverReason: 'abandonment', version: 1 });
        expect(settle).toHaveBeenCalledTimes(1); expect(match.settlement).toBe('saved');
    });

    it('retries a lost DB acknowledgement with the same match and replays one saved rating result', async () => {
        const { io, mm, match, result, humanSocket, events } = fixture();
        const ledger = new Map<string, typeof result>();
        const settle = vi.fn(async (settled: MatchSession) => {
            if (ledger.has(settled.matchId)) return ledger.get(settled.matchId)!;
            ledger.set(settled.matchId, result); // DB committed, but its response was lost.
            return null;
        });
        const runtime = new RankedRuntime(io as any, mm, settle, vi.fn());
        resign(match); runtime.afterAction(match); runtime.afterAction(match); await flush();
        expect(settle).toHaveBeenCalledTimes(1); expect(match.settlement).toBe('pending');
        expect(events.some(event => event.event === 'rating_pending')).toBe(true);
        vi.advanceTimersByTime(4_999); runtime.tick(); await flush(); expect(settle).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(1); runtime.tick(); runtime.tick(); await flush();
        expect(settle).toHaveBeenCalledTimes(2); expect(ledger.size).toBe(1); expect(match.settlement).toBe('saved');
        expect(humanSocket.emit.mock.calls.filter(([event]) => event === 'rating_settled')).toHaveLength(1);
        const replay = vi.fn(); runtime.replaySettlement(match, 'human', replay);
        expect(replay).toHaveBeenCalledWith('rating_settled', { matchId: match.matchId, timeControl: 600, ...result.black });
        runtime.replaySettlement(match, 'stranger', replay); expect(replay).toHaveBeenCalledTimes(1);
        runtime.tick(); expect(settle).toHaveBeenCalledTimes(2);
    });
});
