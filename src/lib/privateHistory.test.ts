import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ proof: vi.fn(), session: vi.fn(), fetch: vi.fn() }));
vi.mock('./rankedSession', () => ({ readRankedSession: mocks.proof, gameServerUrl: () => 'https://game.example.test' }));
vi.mock('./supabaseClient', () => ({ supabase: { auth: { getSession: mocks.session } } }));
import { readPrivateRecords, readPrivateRecord, readPrivateStats, savePrivateRecord } from './privateHistory';
import type { GameRecord } from './gameRecordService';
const record = (id = crypto.randomUUID()): GameRecord => ({ id, white_id: 'Alice', black_id: 'ai', white_player: 'Alice', black_player: 'CPU', mode: 'cpu', winner: 'white_wins', moves: [], total_moves: 0 });
beforeEach(() => {
    vi.clearAllMocks(); vi.stubGlobal('fetch', mocks.fetch);
    mocks.proof.mockReturnValue({ token: 'opaque-proof' });
    mocks.session.mockResolvedValue({ data: { session: null }, error: null });
});
afterEach(() => vi.unstubAllGlobals());
it('never falls back to global history for missing/guest IDs', async () => {
    expect(await readPrivateRecords()).toEqual([]);
    expect(await readPrivateRecords(10, 'GUEST-x')).toEqual([]);
    expect(mocks.fetch).not.toHaveBeenCalled();
});
it('clamps to ten and rejects unexpected foreign rows defensively', async () => {
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ records: [ ...Array.from({ length: 12 }, () => record()), { ...record(), white_id: 'Bob' } ] }) });
    expect(await readPrivateRecords(999, 'Alice')).toHaveLength(10);
    const [url, init] = mocks.fetch.mock.calls[0];
    expect(url.href).toBe('https://game.example.test/game-records?limit=10');
    expect(init.headers.Authorization).toBe('Bearer opaque-proof');
    expect(init.cache).toBe('no-store'); expect(init.redirect).toBe('error');
    expect(url.href).not.toContain('Alice');
});
it('does not expose by record ID outside the latest ten', async () => {
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ records: [record()] }) });
    expect(await readPrivateRecord(crypto.randomUUID(), 'Alice')).toBeNull();
});
it('requires proof and does not trust another OAuth identity', async () => {
    mocks.proof.mockReturnValue(null);
    mocks.session.mockResolvedValue({ data: { session: { user: { id: 'Bob' }, access_token: 'other' } } });
    await expect(readPrivateRecords(10, 'Alice')).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(mocks.fetch).not.toHaveBeenCalled();
});
it('uses matching non-anonymous OAuth proof', async () => {
    mocks.proof.mockReturnValue(null);
    mocks.session.mockResolvedValue({ data: { session: { user: { id: 'Alice', is_anonymous: false }, access_token: 'jwt' } } });
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ records: [] }) });
    await readPrivateRecords(10, 'Alice');
    expect(mocks.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer jwt');
});
it('distinguishes expired login from empty history and network failure', async () => {
    mocks.fetch.mockResolvedValueOnce({ ok: false, status: 401 });
    await expect(readPrivateRecords(10, 'Alice')).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    mocks.fetch.mockRejectedValueOnce(new Error('private upstream data'));
    await expect(readPrivateRecords(10, 'Alice')).rejects.toMatchObject({ message: 'UNAVAILABLE' });
});
it('preserves v2 authoritative deltas in local CPU uploads and stable IDs', async () => {
    const input = { ...record(), moves: [{ turn: 1, player: 'white', tokenId: 'w_17', from: [6, 0], to: [5, 0], possibleTypes: ['P'], replayVersion: 2, changes: [[17, 40, 1, 1, 0]] }] } as unknown as GameRecord;
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ id: 'server-id' }) });
    expect(await savePrivateRecord(input, 'Alice')).toBe('server-id');
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual(input);
    expect(await savePrivateRecord({ ...input, mode: 'ranked' }, 'Alice')).toBeNull();
    expect(await savePrivateRecord(input, 'Bob')).toBeNull();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
});
it('validates private aggregate response instead of reporting fake zeros', async () => {
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ stats: {} }) });
    await expect(readPrivateStats('Alice')).rejects.toMatchObject({ code: 'UNAVAILABLE' });
});
