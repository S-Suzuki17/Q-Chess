import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDailyLoginApi, claimDailyLoginReward as disabledClaim, DAILY_LOGIN_REWARDS_ENABLED, readDailyLoginStatus as disabledRead } from './dailyLoginRewards';
import { DAILY_LOGIN_REWARDS_RELEASE_READY } from '../../server/src/services/TicketFeatureGates';
const { claimDailyLoginReward, readDailyLoginStatus } = createDailyLoginApi(() => true);

const mocks = vi.hoisted(() => ({ session: vi.fn(), proof: vi.fn(), origin: vi.fn(), from: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { auth: { getSession: mocks.session }, from: mocks.from } }));
vi.mock('./rankedSession', () => ({ gameServerUrl: mocks.origin, readRankedSession: mocks.proof }));

const status = { userId: 'Alice', enabled: true, streakDays: 2, tickets: { ranked: 3, hint: 5 }, lastClaimUtcDay: '2026-09-30' };
const reply = (value: unknown, code = 200) => new Response(JSON.stringify(value), { status: code });

beforeEach(() => {
    vi.clearAllMocks();
    mocks.origin.mockReturnValue('https://game.example');
    mocks.proof.mockReturnValue({ token: 'legacy-proof' });
    mocks.session.mockResolvedValue({ data: { session: null }, error: null });
});
afterEach(() => vi.unstubAllGlobals());

it('keeps account claims and balance UI OFF until the release is verified', () => {
    expect(DAILY_LOGIN_REWARDS_ENABLED).toBe(false);
    expect(DAILY_LOGIN_REWARDS_ENABLED).toBe(DAILY_LOGIN_REWARDS_RELEASE_READY);
});
it('blocks even direct status and claim requests while the Web gate is OFF', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(disabledRead('Alice')).rejects.toThrow('DISABLED');
    await expect(disabledClaim('Alice')).rejects.toThrow('DISABLED');
    expect(fetcher).not.toHaveBeenCalled(); expect(mocks.session).not.toHaveBeenCalled();
});
it('separates server feature OFF from temporary 503 failure and validates its UTC day', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    fetcher.mockResolvedValue(reply({code:'FEATURE_DISABLED',enabled:false},503));
    await expect(readDailyLoginStatus('Alice')).rejects.toThrow('DISABLED');
    fetcher.mockResolvedValue(reply({code:'REWARD_UNAVAILABLE'},503));
    await expect(readDailyLoginStatus('Alice')).rejects.toThrow('UNAVAILABLE');
    fetcher.mockResolvedValue(reply({...status,currentUtcDay:'2026-10-03'}));
    expect((await readDailyLoginStatus('Alice')).currentUtcDay).toBe('2026-10-03');
    for (const currentUtcDay of ['2026-02-30','2026-09-29',123]) {
        fetcher.mockResolvedValue(reply({...status,currentUtcDay}));
        await expect(readDailyLoginStatus('Alice')).rejects.toThrow('UNAVAILABLE');
    }
});

it('reads the authenticated owner balance without claiming or sending identity in the URL/body', async () => {
    const fetcher = vi.fn().mockResolvedValue(reply(status)); vi.stubGlobal('fetch', fetcher);
    expect(await readDailyLoginStatus('Alice')).toEqual(status);
    const [url, options] = fetcher.mock.calls[0];
    expect(url.pathname).toBe('/rewards/daily-login');
    expect(url.search).toBe('');
    expect(options.method).toBe('GET');
    expect(options.body).toBeUndefined();
    expect(options.headers.Authorization).toBe('Bearer legacy-proof');
    expect(options).toMatchObject({ credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' });
    expect(mocks.from).not.toHaveBeenCalled();
});

it('has a separate, explicit POST claim with no caller-selected day or ticket amount', async () => {
    const fetcher = vi.fn().mockResolvedValue(reply({ ...status, credited: { ranked: 1, hint: 2 } })); vi.stubGlobal('fetch', fetcher);
    expect((await claimDailyLoginReward('Alice')).credited).toEqual({ ranked: 1, hint: 2 });
    const [url, options] = fetcher.mock.calls[0];
    expect(url.pathname).toBe('/rewards/daily-login/claim');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(options.body)).toEqual({});
    expect(mocks.from).not.toHaveBeenCalled();
});

it('requires a matching, non-anonymous, non-expired session if there is no legacy proof', async () => {
    mocks.proof.mockReturnValue(null);
    const fetcher = vi.fn().mockResolvedValue(reply(status)); vi.stubGlobal('fetch', fetcher);
    for (const session of [null, { user: { id: 'Bob' }, access_token: 'jwt' },
        { user: { id: 'Alice', is_anonymous: true }, access_token: 'jwt' },
        { user: { id: 'Alice' }, access_token: 'jwt', expires_at: 1 }]) {
        mocks.session.mockResolvedValue({ data: { session }, error: null });
        await expect(readDailyLoginStatus('Alice')).rejects.toThrow('AUTH_REQUIRED');
    }
    for (const id of ['', 'GUEST-a', 'anon_a', 'cpu-a', 'ai:match', 'supabase-test']) {
        await expect(readDailyLoginStatus(id)).rejects.toThrow('AUTH_REQUIRED');
    }
    expect(fetcher).not.toHaveBeenCalled();
    mocks.session.mockResolvedValue({ data: { session: { user: { id: 'Alice', user_metadata: { id: 'Bob' } }, access_token: 'valid.jwt.token' } }, error: null });
    await readDailyLoginStatus('Alice');
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer valid.jwt.token');
});

it('rejects malformed or other-account responses and invalid UTC dates', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    for (const value of [
        { ...status, userId: 'Bob' }, { ...status, tickets: { ranked: -1, hint: 1 } },
        { ...status, streakDays: 1.5 }, { ...status, streakDays: 8 },
        { ...status, streakDays: 0 }, { ...status, lastClaimUtcDay: null },
        { ...status, tickets: { ranked: 21, hint: 1 } },
        { ...status, lastClaimUtcDay: '2026-02-30' },
        { ...status, enabled: false }, { ...status, enabled: 'true' },
    ]) {
        fetcher.mockResolvedValue(reply(value));
        await expect(readDailyLoginStatus('Alice')).rejects.toThrow('UNAVAILABLE');
    }
    fetcher.mockResolvedValue(reply({ ...status, credited: { ranked: -1, hint: 1 } }));
    await expect(claimDailyLoginReward('Alice')).rejects.toThrow('UNAVAILABLE');
});

it('fails closed for insecure transport, auth failure, missing API, and abort', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    mocks.origin.mockReturnValue('http://game.example');
    await expect(readDailyLoginStatus('Alice')).rejects.toThrow('UNAVAILABLE');
    expect(fetcher).not.toHaveBeenCalled();
    mocks.origin.mockReturnValue('https://game.example');
    for (const code of [401, 403, 404, 423, 429, 503]) {
        fetcher.mockResolvedValue(reply({}, code));
        await expect(readDailyLoginStatus('Alice')).rejects.toThrow(code === 401 || code === 403 ? 'AUTH_REQUIRED' : 'UNAVAILABLE');
    }
    const controller = new AbortController(); controller.abort();
    await expect(readDailyLoginStatus('Alice', controller.signal)).rejects.toBeDefined();
    expect(fetcher).toHaveBeenCalledTimes(6);
});
