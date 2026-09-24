import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ session: vi.fn(), proof: vi.fn(), base: 'https://local-fixture.invalid' }));
vi.mock('./supabaseClient', () => ({ supabase: { auth: { getSession: h.session } } }));
vi.mock('./rankedSession', () => ({ gameServerUrl: () => h.base, readRankedSession: h.proof }));
import { accountDeletionAvailable, clearDeletedAccountDeviceData, deleteOwnAccount } from './accountDeletion';
class MemoryStorage {
    values = new Map<string, string>();
    get length() { return this.values.size; }
    key(index: number) { return [...this.values.keys()][index] ?? null; }
    getItem(key: string) { return this.values.get(key) ?? null; }
    setItem(key: string, value: string) { this.values.set(key, value); }
    removeItem(key: string) { this.values.delete(key); }
}
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
    vi.clearAllMocks(); h.base = 'https://local-fixture.invalid';
    h.proof.mockReturnValue({ token: 'fixture-legacy-proof', userId: 'Alice' });
    h.session.mockResolvedValue({ data: { session: null }, error: null });
    vi.stubGlobal('sessionStorage', new MemoryStorage()); vi.stubGlobal('localStorage', new MemoryStorage());
    fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
});
afterEach(() => vi.unstubAllGlobals());
describe('account erasure client boundary', () => {
    it('capability check is read-only and fails closed for old servers', async () => {
        fetcher.mockResolvedValueOnce(response({ available: true })).mockResolvedValueOnce(response({}, 404));
        expect(await accountDeletionAvailable()).toBe(true); expect(await accountDeletionAvailable()).toBe(false);
        expect(fetcher.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
        expect(sessionStorage.length).toBe(0);
    });
    it('persists a random retry ticket before sending a confirmed request and never supplies an owner ID', async () => {
        fetcher.mockImplementation(async (url, options) => {
            const saved = JSON.parse(sessionStorage.getItem('qg_account_deletion_v1')!);
            expect(saved.userId).toBe('Alice'); expect(saved.ticket).toMatch(/^delete_[a-f0-9]{64}$/);
            expect(options.credentials).toBe('omit'); expect(options.redirect).toBe('error');
            const payload = JSON.parse(options.body); expect(payload.userId).toBeUndefined();
            expect(payload.confirmation).toBe('DELETE');
            if (fetcher.mock.calls.length === 1) return response({}, 401);
            if (String(url).endsWith('/complete')) return response({ phase: 'completed' });
            expect(options.headers.Authorization).toBe('Bearer fixture-legacy-proof');
            return response({ phase: 'pending' }, 202);
        });
        await expect(deleteOwnAccount('Alice')).resolves.toBeUndefined(); expect(fetcher).toHaveBeenCalledTimes(3);
    });
    it('resumes a completed deletion without requiring the now-deleted Auth session', async () => {
        const ticket = 'delete_' + 'b'.repeat(64); sessionStorage.setItem('qg_account_deletion_v1', JSON.stringify({ userId: 'Alice', ticket }));
        h.proof.mockReturnValue(null); fetcher.mockResolvedValue(response({ phase: 'completed' }));
        await deleteOwnAccount('Alice');
        expect(fetcher).toHaveBeenCalledOnce(); expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer ' + ticket);
        expect(h.session).not.toHaveBeenCalled();
    });
    it('does not send any request when saving the retry ticket is blocked', async () => {
        vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => { throw new Error('blocked'); } });
        await expect(deleteOwnAccount('Alice')).rejects.toThrow(); expect(fetcher).not.toHaveBeenCalled();
    });
    it('does not treat a storage/auth/network failure as successful erasure', async () => {
        fetcher.mockResolvedValue(response({ phase: 'pending' }, 503));
        await expect(deleteOwnAccount('Alice')).rejects.toMatchObject({ code: 'UNAVAILABLE' });
        expect(sessionStorage.getItem('qg_account_deletion_v1')).not.toBeNull();
    });
    it.each(['GUEST-alice', 'CPU_1', 'anon-user', ''])('rejects a non-account before calling the server: %s', async id => {
        await expect(deleteOwnAccount(id)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' }); expect(fetcher).not.toHaveBeenCalled();
    });
    it('refuses an OAuth identity that differs from the displayed account', async () => {
        h.proof.mockReturnValue(null); h.session.mockResolvedValue({ data: { session: { user: { id: 'Bob' }, access_token: 'fixture' } }, error: null });
        fetcher.mockResolvedValue(response({}, 401));
        await expect(deleteOwnAccount('Alice')).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
        expect(fetcher).toHaveBeenCalledOnce();
    });
    it('blocks insecure remote endpoints', async () => {
        h.base = 'http://remote.invalid';
        expect(await accountDeletionAvailable()).toBe(false); expect(fetcher).not.toHaveBeenCalled();
    });
    it('clears only Q-Gambit keys and does not misreport a completed deletion when one store is blocked', () => {
        for (const storage of [localStorage, sessionStorage]) {
            storage.setItem('qg_campaign_v1', 'progress'); storage.setItem('qchess_profile', 'profile'); storage.setItem('unrelated', 'keep');
        }
        expect(clearDeletedAccountDeviceData()).toBe(true);
        expect(localStorage.getItem('unrelated')).toBe('keep'); expect(sessionStorage.length).toBe(1);
        sessionStorage.setItem('qg_retry', 'remove');
        vi.stubGlobal('localStorage', { get length() { throw new Error('blocked'); } });
        expect(clearDeletedAccountDeviceData()).toBe(false); expect(sessionStorage.getItem('qg_retry')).toBeNull();
    });
    it.each(['null', '[]', '{bad'])('replaces malformed local retry metadata safely (%s)', async saved => {
        sessionStorage.setItem('qg_account_deletion_v1', saved); fetcher.mockResolvedValue(response({ phase: 'completed' }));
        await expect(deleteOwnAccount('Alice')).resolves.toBeUndefined();
    });
});
