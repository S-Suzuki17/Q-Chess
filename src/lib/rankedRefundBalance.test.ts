import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRankedRefundApi, parseRankedRefundBalance, readRankedRefundBalance as disabledRead, RANKED_REFUND_BALANCE_ENABLED } from './rankedRefundBalance';
const mocks = vi.hoisted(() => ({ session: vi.fn(), proof: vi.fn(), origin: vi.fn(), from: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { auth: { getSession: mocks.session }, from: mocks.from } }));
vi.mock('./rankedSession', () => ({ gameServerUrl: mocks.origin, readRankedSession: mocks.proof }));
const read = createRankedRefundApi(() => true);
const balance = { userId: 'Alice', enabled: true, freeRankedRefunds: 45, paidRankedRefunds: 73 };
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
beforeEach(() => { vi.clearAllMocks(); mocks.origin.mockReturnValue('https://game.example'); mocks.proof.mockReturnValue({ token: 'legacy-proof' }); mocks.session.mockResolvedValue({ data: { session: null }, error: null }); });
afterEach(() => vi.unstubAllGlobals());

it('has a hard OFF default without authentication or network requests', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect(RANKED_REFUND_BALANCE_ENABLED).toBe(false);
    await expect(disabledRead('Alice')).rejects.toThrow('DISABLED');
    expect(fetcher).not.toHaveBeenCalled(); expect(mocks.proof).not.toHaveBeenCalled(); expect(mocks.session).not.toHaveBeenCalled();
});
it('reads only the authenticated API without clamping or client-selected identity', async () => {
    const fetcher = vi.fn().mockResolvedValue(reply(balance)); vi.stubGlobal('fetch', fetcher);
    expect(await read('Alice')).toEqual(balance);
    const [url, options] = fetcher.mock.calls[0];
    expect(url.pathname).toBe('/tickets/ranked-refunds'); expect(url.search).toBe(''); expect(options.body).toBeUndefined();
    expect(options).toMatchObject({ method: 'GET', headers: { Authorization: 'Bearer legacy-proof' }, credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(parseRankedRefundBalance({ ...balance, paidRankedRefunds: 0 }, 'Alice').paidRankedRefunds).toBe(0);
    expect(parseRankedRefundBalance({ ...balance, freeRankedRefunds: Number.MAX_SAFE_INTEGER }, 'Alice').freeRankedRefunds).toBe(Number.MAX_SAFE_INTEGER);
});
it('rejects malformed, negative, fractional, unsafe or another-account counts', () => {
    for (const count of [-1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, '21', null, undefined]) {
        for (const key of ['freeRankedRefunds', 'paidRankedRefunds']) expect(() => parseRankedRefundBalance({ ...balance, [key]: count }, 'Alice')).toThrow('UNAVAILABLE');
    }
    for (const value of [null, [], { ...balance, userId: 'Bob' }, { ...balance, enabled: false }]) expect(() => parseRankedRefundBalance(value, 'Alice')).toThrow('UNAVAILABLE');
});
it('requires matching verified account sessions', async () => {
    const fetcher = vi.fn().mockResolvedValue(reply(balance)); vi.stubGlobal('fetch', fetcher); mocks.proof.mockReturnValue(null);
    for (const session of [null, { user: { id: 'Bob' }, access_token: 'jwt' }, { user: { id: 'Alice', is_anonymous: true }, access_token: 'jwt' }, { user: { id: 'Alice' }, access_token: 'jwt', expires_at: 1 }]) {
        mocks.session.mockResolvedValue({ data: { session }, error: null }); await expect(read('Alice')).rejects.toThrow('AUTH_REQUIRED');
    }
    for (const id of ['', 'GUEST-Alice', 'anon_Alice', 'cpu-Alice', 'ai:match']) await expect(read(id)).rejects.toThrow('AUTH_REQUIRED');
    expect(fetcher).not.toHaveBeenCalled();
    mocks.session.mockResolvedValue({ data: { session: { user: { id: 'Alice' }, access_token: 'valid.jwt.token' } }, error: null });
    await read('Alice'); expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer valid.jwt.token');
});
it('distinguishes feature OFF, service outage, auth failure and abort', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    fetcher.mockResolvedValue(reply({ code: 'FEATURE_DISABLED', enabled: false }, 503)); await expect(read('Alice')).rejects.toThrow('DISABLED');
    for (const code of [401, 403, 404, 423, 429, 503]) {
        fetcher.mockResolvedValue(reply({}, code)); await expect(read('Alice')).rejects.toThrow([401, 403].includes(code) ? 'AUTH_REQUIRED' : 'UNAVAILABLE');
    }
    mocks.origin.mockReturnValue('http://game.example'); await expect(read('Alice')).rejects.toThrow('UNAVAILABLE');
    const controller = new AbortController(); controller.abort(); await expect(read('Alice', controller.signal)).rejects.toBeDefined();
    expect(fetcher).toHaveBeenCalledTimes(7);
});
