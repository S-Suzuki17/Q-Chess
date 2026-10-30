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

it('joins overlapping identical reads even when screens have separate abort signals, without caching results', async () => {
    const {requestAccountProfile}=await import('./accountProfile');
    let finish!:(value:Response)=>void;
    const fetcher=vi.fn(()=>new Promise<Response>(done=>{finish=done;}));vi.stubGlobal('fetch',fetcher);
    const first=new AbortController(),second=new AbortController();
    const a=requestAccountProfile('/learning','Alice',undefined,first.signal);
    const b=requestAccountProfile('/learning','Alice',undefined,second.signal);
    expect(fetcher).toHaveBeenCalledOnce();
    finish(reply({userId:'Alice',rows:[1]}));
    const [left,right]=await Promise.all([a,b]);(left.rows as number[]).push(2);
    expect(right.rows).toEqual([1]);
    const later=requestAccountProfile('/learning','Alice');expect(fetcher).toHaveBeenCalledTimes(2);
    finish(reply({userId:'Alice',rows:[3]}));expect((await later).rows).toEqual([3]);
});
it('cancels one reader independently and cancels transport only when every reader leaves', async () => {
    const {requestAccountProfile}=await import('./accountProfile');
    const finishes:Array<(value:Response)=>void>=[];
    const fetcher=vi.fn((_url:unknown,_options:any)=>new Promise<Response>(done=>{finishes.push(done);}));vi.stubGlobal('fetch',fetcher);
    const first=new AbortController(),second=new AbortController();
    const a=requestAccountProfile('/learning','Alice',undefined,first.signal).catch(error=>error.code);
    const b=requestAccountProfile('/learning','Alice',undefined,second.signal).catch(error=>error.code);
    first.abort();expect(await a).toBe('UNAVAILABLE');expect(fetcher.mock.calls[0][1].signal.aborted).toBe(false);
    second.abort();expect(await b).toBe('UNAVAILABLE');expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    const retry=requestAccountProfile('/learning','Alice');expect(fetcher).toHaveBeenCalledTimes(2);
    finishes[0](reply({userId:'Alice',old:true}));finishes[1](reply({userId:'Alice',fresh:true}));
    expect(await retry).toMatchObject({fresh:true});
});
it('does not join reads across users, bearers, or endpoints', async () => {
    const {requestAccountProfile}=await import('./accountProfile');
    const finishes:Array<(value:Response)=>void>=[];
    const fetcher=vi.fn(()=>new Promise<Response>(done=>{finishes.push(done);}));vi.stubGlobal('fetch',fetcher);
    const a=requestAccountProfile('/learning','Alice');
    mocks.proof.mockReturnValue({token:'new-proof'});
    const b=requestAccountProfile('/learning','Alice'),c=requestAccountProfile('/account/progress','Alice'),d=requestAccountProfile('/learning','Bob');
    expect(fetcher).toHaveBeenCalledTimes(4);
    finishes.forEach((done,i)=>done(reply({userId:i===3?'Bob':'Alice'})));await Promise.all([a,b,c,d]);
});
it('does not let reads from before or during a mutation satisfy a later refresh', async () => {
    const {requestAccountProfile}=await import('./accountProfile');
    const finishes:Array<(value:Response)=>void>=[];
    const fetcher=vi.fn(()=>new Promise<Response>(done=>{finishes.push(done);}));vi.stubGlobal('fetch',fetcher);
    const before=requestAccountProfile('/learning','Alice');
    const write=requestAccountProfile('/learning/complete','Alice',{kind:'tutorial'});
    const during=requestAccountProfile('/learning','Alice');expect(fetcher).toHaveBeenCalledTimes(3);
    finishes[1](reply({userId:'Alice',saved:true}));await write;
    const after=requestAccountProfile('/learning','Alice');expect(fetcher).toHaveBeenCalledTimes(4);
    finishes[0](reply({userId:'Alice',revision:0}));finishes[2](reply({userId:'Alice',revision:0}));finishes[3](reply({userId:'Alice',revision:1}));
    await Promise.all([before,during]);expect(await after).toMatchObject({revision:1});
});
it('releases a failed shared request so a retry really reaches the server', async () => {
    const {requestAccountProfile}=await import('./accountProfile');
    const fetcher=vi.fn().mockResolvedValueOnce(reply({},503)).mockResolvedValueOnce(reply({userId:'Alice'}));vi.stubGlobal('fetch',fetcher);
    const results=await Promise.allSettled([requestAccountProfile('/learning','Alice'),requestAccountProfile('/learning','Alice')]);
    expect(results.every(row=>row.status==='rejected')).toBe(true);expect(fetcher).toHaveBeenCalledOnce();
    expect(await requestAccountProfile('/learning','Alice')).toMatchObject({userId:'Alice'});expect(fetcher).toHaveBeenCalledTimes(2);
});
it('does not send a request for an already cancelled caller or combine mutation requests', async () => {
    const {requestAccountProfile}=await import('./accountProfile');
    const fetcher=vi.fn(async()=>reply({userId:'Alice'}));vi.stubGlobal('fetch',fetcher);
    const abort=new AbortController();abort.abort();
    await expect(requestAccountProfile('/learning','Alice',undefined,abort.signal)).rejects.toThrow('UNAVAILABLE');expect(fetcher).not.toHaveBeenCalled();
    await Promise.all([requestAccountProfile('/learning/complete','Alice',{}),requestAccountProfile('/learning/complete','Alice',{})]);
    expect(fetcher).toHaveBeenCalledTimes(2);
});

it('keeps the remaining screen request alive when another screen closes',async()=>{
    const {requestAccountProfile}=await import('./accountProfile');let finish!:(value:Response)=>void;
    const fetcher=vi.fn((_url:unknown,_options:any)=>new Promise<Response>(done=>{finish=done;}));vi.stubGlobal('fetch',fetcher);
    const closed=new AbortController(),open=new AbortController();
    const a=requestAccountProfile('/learning','Alice',undefined,closed.signal).catch(error=>error.code);
    const b=requestAccountProfile('/learning','Alice',undefined,open.signal);closed.abort();expect(await a).toBe('UNAVAILABLE');
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(false);finish(reply({userId:'Alice',weekly:[1]}));expect(await b).toMatchObject({weekly:[1]});
    expect(fetcher).toHaveBeenCalledOnce();
});
