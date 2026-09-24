import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {accountRecoveryText} from '../locales/accountRecoveryText';
import {LANGUAGES} from '../locales/dict';
const proof=vi.hoisted(()=>vi.fn());
vi.mock('./rankedSession',()=>({gameServerUrl:()=> 'https://example.test',readRankedSession:proof}));
import {recoveryAvailable,startRecovery,completeRecovery} from './accountRecovery';
beforeEach(()=>{proof.mockReturnValue({token:'ranked-local-test'});});
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
it('has all recovery labels and help in every supported language',()=>{
    const en=accountRecoveryText('en');for(const {code} of LANGUAGES){const copy=accountRecoveryText(code);expect(Object.keys(copy)).toEqual(Object.keys(en));expect(Object.values(copy).every(value=>typeof value==='string'&&value.length>0)).toBe(true);}
});
it('does not expose credentials in URLs, cookies, persistent storage or redirects',async()=>{
    const fetch=vi.fn(async()=>new Response(JSON.stringify({ticket:'a'.repeat(64)})));vi.stubGlobal('fetch',fetch);
    await startRecovery('Alice','alice@example.test','current-password');
    const [url,options]=fetch.mock.calls[0] as unknown as [URL,RequestInit];expect(url.search).toBe('');expect(options.credentials).toBe('omit');expect(options.redirect).toBe('error');
    expect(options.cache).toBe('no-store');expect(options.headers).toHaveProperty('Authorization','Bearer ranked-local-test');expect(JSON.parse(options.body as string).password).toBe('current-password');
});
it('requires a fresh login proof for enrollment but not forgotten-password recovery',async()=>{
    proof.mockReturnValue(null);const fetch=vi.fn(async()=>new Response(JSON.stringify({ticket:'a'.repeat(64)})));vi.stubGlobal('fetch',fetch);
    await expect(startRecovery('Alice','alice@example.test','password')).rejects.toHaveProperty('code','AUTH_REQUIRED');expect(fetch).not.toHaveBeenCalled();
    await startRecovery('Alice','alice@example.test');expect(fetch).toHaveBeenCalledOnce();
});
it('fails closed for old servers and malformed success responses',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('Not found',{status:404})));expect(await recoveryAvailable()).toBe(false);
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('{}')));await expect(completeRecovery('a'.repeat(64),'123456','new-password-123')).rejects.toHaveProperty('code','UNAVAILABLE');
});
