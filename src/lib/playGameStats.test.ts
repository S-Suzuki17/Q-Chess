import { describe, expect, it, vi } from 'vitest';
import { createGameStatsReporter, type MatchStats } from './playGameStats';

const match: MatchStats = { matchKey: 'test:white', mode: 'practice', timeControl: '10m', result: 'win', playerMoves: 12, captures: 3, checkmate: true };
const bridge = () => ({ recordMatch: vi.fn().mockResolvedValue({ status: 'buffered' }), recordProgress: vi.fn().mockResolvedValue({ status: 'buffered' }) });

describe('Play game stats boundary', () => {
    it('does not call native services on web or when disabled', async () => {
        const native = bridge(), reporter = createGameStatsReporter(native, () => false);
        expect(await reporter.match(match)).toBe('disabled');
        expect(await reporter.progress(3)).toBe('disabled');
        expect(native.recordMatch).not.toHaveBeenCalled(); expect(native.recordProgress).not.toHaveBeenCalled();
    });
    it('shares in-flight completion and sends only approved properties', async () => {
        const native = bridge(), reporter = createGameStatsReporter(native, () => true);
        await Promise.all([reporter.match({ ...match, email: 'private@example.test' } as MatchStats), reporter.match(match)]);
        expect(native.recordMatch).toHaveBeenCalledExactlyOnceWith(match);
        // The next call consults native player-scoped deduplication, including after a Play account change.
        native.recordMatch.mockResolvedValue({ status: 'duplicate' });
        expect(await reporter.match(match)).toBe('duplicate');
    });
    it('can retry failed or unauthenticated calls without marking them recorded', async () => {
        const native = bridge(), reporter = createGameStatsReporter(native, () => true);
        native.recordMatch.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ status: 'unauthenticated' });
        expect(await reporter.match(match)).toBe('unavailable');
        expect(await reporter.match(match)).toBe('unauthenticated');
        expect(await reporter.match(match)).toBe('buffered');
    });
    it('rejects invalid counts and unknown enums before native calls', async () => {
        const native = bridge(), reporter = createGameStatsReporter(native, () => true);
        for (const value of [NaN, Infinity, -1, 0, 1.2, 10001]) expect(await reporter.match({ ...match, playerMoves: value })).toBe('unavailable');
        expect(await reporter.match({ ...match, captures: 17 })).toBe('unavailable');
        expect(await reporter.match({ ...match, matchKey: 123 as unknown as string })).toBe('unavailable');
        expect(await reporter.match({ ...match, mode: 'ads' as MatchStats['mode'] })).toBe('unavailable');
        for (const value of [-1, 301, NaN, 1.5]) expect(await reporter.progress(value)).toBe('unavailable');
        expect(native.recordMatch).not.toHaveBeenCalled(); expect(native.recordProgress).not.toHaveBeenCalled();
    });
    it('serializes progression changes and continues after a failure', async () => {
        let complete!: (value: { status: string }) => void;
        const native = bridge(), reporter = createGameStatsReporter(native, () => true);
        native.recordProgress.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; })).mockRejectedValueOnce(new Error('offline'));
        const first = reporter.progress(0), second = reporter.progress(3), third = reporter.progress(5);
        await Promise.resolve(); expect(native.recordProgress).toHaveBeenCalledTimes(1);
        complete({ status: 'buffered' });
        expect(await Promise.all([first, second, third])).toEqual(['buffered', 'unavailable', 'buffered']);
        expect(native.recordProgress.mock.calls).toEqual([[{ currentProgress: 0 }], [{ currentProgress: 3 }], [{ currentProgress: 5 }]]);
    });
});
