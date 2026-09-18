import { expect, it, vi } from 'vitest';
import { ReplaySaveSession } from './replaySave';
import type { GameRecord } from './gameRecordService';
const record: GameRecord = { mode: 'cpu', moves: [], total_moves: 0, white_player: 'A', black_player: 'CPU', winner: 'white_wins', white_id: 'owner' };
it('coalesces Strict Mode/in-flight duplicate saves and acknowledges success once', async () => {
    const createId = vi.fn(() => 'same-game'), persist = vi.fn(async () => 'saved');
    const session = new ReplaySaveSession(createId);
    const first = session.save(record, 'owner', persist);
    const second = session.save(record, 'owner', persist);
    expect(first).toBe(second);
    expect(await first).toBe('saved');
    expect(await session.save(record, 'owner', persist)).toBe('saved');
    expect(createId).toHaveBeenCalledOnce(); expect(persist).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledWith({ ...record, id: 'same-game' }, 'owner');
});
it('does not acknowledge failures and retries the same ID rather than creating another record', async () => {
    const persist = vi.fn().mockRejectedValueOnce(new Error('Network lost')).mockResolvedValueOnce(null).mockResolvedValueOnce('saved');
    const session = new ReplaySaveSession(() => 'same-game');
    expect(await session.save(record, 'owner', persist)).toBeNull();
    expect(await session.save(record, 'owner', persist)).toBeNull();
    expect(await session.save(record, 'owner', persist)).toBe('saved');
    expect(persist.mock.calls.map(([value]) => value.id)).toEqual(['same-game', 'same-game', 'same-game']);
});
it('never reuses one player’s saved-game acknowledgement after an account switch', async () => {
    const persist = vi.fn(async () => 'saved'), session = new ReplaySaveSession(() => 'same-game');
    await session.save(record, 'owner', persist);
    expect(await session.save(record, 'another-account', persist)).toBeNull();
    expect(persist).toHaveBeenCalledOnce();
});
