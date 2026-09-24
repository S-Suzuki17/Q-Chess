import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { renameOwnProfile, readOwnFriends, changeOwnFriend, ensureOwnProfile } from './accountProfile';
import { accountProfileText } from '../locales/accountProfileText';
const mocks = vi.hoisted(() => ({ session: vi.fn(), proof: vi.fn(), origin: vi.fn(), from: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { auth: { getSession: mocks.session }, from: mocks.from } }));
vi.mock('./rankedSession', () => ({ gameServerUrl: mocks.origin, readRankedSession: mocks.proof }));
beforeEach(() => { vi.clearAllMocks(); mocks.origin.mockReturnValue('https://game.example'); mocks.proof.mockReturnValue({ token: 'proof' }); mocks.session.mockResolvedValue({ data: { session: null }, error: null }); });
afterEach(() => vi.unstubAllGlobals());
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
it('sends only allowlisted fields with a bearer, no caller-selected owner or rating', async () => {
    const fetcher = vi.fn().mockResolvedValue(reply({ userId: 'Alice', profile: { id: 'Alice', name: 'New' } })); vi.stubGlobal('fetch', fetcher);
    expect((await renameOwnProfile('Alice', 'New')).name).toBe('New');
    expect(fetcher.mock.calls[0][0].pathname).toBe('/account/profile/name');
    const options = fetcher.mock.calls[0][1];
    expect(JSON.parse(options.body)).toEqual({ name: 'New' }); expect(options.headers.Authorization).toBe('Bearer proof');
    expect(options).toMatchObject({ credentials: 'omit', redirect: 'error', cache: 'no-store' });
    expect(mocks.from).not.toHaveBeenCalled();
});
it('fails closed for no auth, another identity, anonymous/expired sessions and reserved IDs', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher); mocks.proof.mockReturnValue(null);
    for (const session of [null, { user: { id: 'Bob' }, access_token: 'jwt' }, { user: { id: 'Alice', is_anonymous: true }, access_token: 'jwt' }, { user: { id: 'Alice' }, access_token: 'jwt', expires_at: 1 }]) {
        mocks.session.mockResolvedValue({ data: { session }, error: null });
        await expect(renameOwnProfile('Alice', 'Name')).rejects.toThrow('AUTH_REQUIRED');
    }
    for (const id of ['GUEST-a', 'anon_a', 'cpu-a', 'ai:1', '']) await expect(readOwnFriends(id)).rejects.toThrow('AUTH_REQUIRED');
    expect(fetcher).not.toHaveBeenCalled();
});
it('accepts a matching OAuth bearer, never uses metadata for ownership', async () => {
    mocks.proof.mockReturnValue(null); mocks.session.mockResolvedValue({ data: { session: { user: { id: 'Alice', user_metadata: { id: 'Bob' } }, access_token: 'valid.jwt.token' } } });
    const fetcher = vi.fn().mockResolvedValue(reply({ userId: 'Alice', profile: { id: 'Alice', name: 'Name' } })); vi.stubGlobal('fetch', fetcher);
    await ensureOwnProfile('Alice', 'Name'); expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer valid.jwt.token');
});
it('checks response owner and never returns unrelated friends', async () => {
    const fetcher = vi.fn().mockResolvedValue(reply({ userId: 'Bob', friends: [] })); vi.stubGlobal('fetch', fetcher);
    await expect(readOwnFriends('Alice')).rejects.toThrow('UNAVAILABLE');
    fetcher.mockResolvedValue(reply({ userId: 'Alice', friends: [{ user_id: 'Alice', friend_id: 'Bob', status: 'pending' }, { user_id: 'Bob', friend_id: 'Carol', status: 'accepted' }] }));
    expect(await readOwnFriends('Alice')).toHaveLength(1);
    fetcher.mockResolvedValue(reply({ userId: 'Alice', profile: { id: 'Bob', name: 'Bad' } }));
    await expect(renameOwnProfile('Alice', 'Name')).rejects.toThrow('UNAVAILABLE');
});
it('does not fall back to database writes on transport/auth/rate/service failures', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    for (const status of [401, 403, 404, 423, 429, 503]) {
        fetcher.mockResolvedValue(reply({}, status)); await expect(changeOwnFriend('Alice', 'Bob', 'request')).rejects.toThrow(status === 401 || status === 403 ? 'AUTH_REQUIRED' : 'UNAVAILABLE');
    }
    fetcher.mockRejectedValue(new Error('secret')); await expect(renameOwnProfile('Alice', 'Name')).rejects.toThrow('UNAVAILABLE');
    expect(mocks.from).not.toHaveBeenCalled();
});
it('blocks cleartext remote endpoints', async () => {
    mocks.origin.mockReturnValue('http://game.example'); const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(readOwnFriends('Alice')).rejects.toThrow('UNAVAILABLE'); expect(fetcher).not.toHaveBeenCalled();
});
it('provides all errors in every supported language', () => {
    for (const lang of ['ja','en','zh','ru','fr','de','es','tr','pl','hi','pt','ta'] as const) for (const key of ['auth','failed','name'] as const) expect(accountProfileText(lang,key).length).toBeGreaterThan(5);
});
