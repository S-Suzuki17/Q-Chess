import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const h=vi.hoisted(()=>({request:vi.fn(),origin:vi.fn()}));
vi.mock('./accountProfile',()=>({requestAccountProfile:h.request,AccountProfileError:class extends Error{constructor(public code:string){super(code);}}}));
vi.mock('./rankedSession',()=>({gameServerUrl:h.origin}));
import {registerAccount,revokeAllAccountSessions} from './accountSecurity';
import {accountSecurityText} from '../locales/accountSecurityText';
beforeEach(()=>{vi.clearAllMocks();h.origin.mockReturnValue('https://game.example');});
afterEach(()=>vi.unstubAllGlobals());
it('registers only via the HTTPS API without retaining passwords',async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response('{"registered":true}',{status:201}));vi.stubGlobal('fetch',fetcher);
    await registerAccount('Alice','correct-horse-123');expect(fetcher.mock.calls[0][0].pathname).toBe('/auth/register');
    expect(fetcher.mock.calls[0][1]).toMatchObject({credentials:'omit',redirect:'error',cache:'no-store'});
    h.origin.mockReturnValue('http://game.example');await expect(registerAccount('Alice','password')).rejects.toThrow();expect(fetcher).toHaveBeenCalledOnce();
});
it('fails closed for registration failures and never fabricates a session',async()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    for(const status of [400,409,429,503]){fetcher.mockResolvedValue(new Response('{}',{status}));await expect(registerAccount('Alice','correct-horse-123')).rejects.toThrow();}
    fetcher.mockResolvedValue(new Response('{}'));await expect(registerAccount('Alice','correct-horse-123')).rejects.toThrow();
});
it('global logout posts no selectable account and requires an acknowledged result',async()=>{
    h.request.mockResolvedValue({userId:'Alice',revoked:true});await revokeAllAccountSessions('Alice');
    expect(h.request).toHaveBeenCalledExactlyOnceWith('/account/sessions/revoke-all','Alice',{});
    h.request.mockResolvedValue({revoked:false});await expect(revokeAllAccountSessions('Alice')).rejects.toThrow();
});
it('provides security and support text in all twelve languages',()=>{
    for(const lang of ['ja','en','zh','ru','fr','de','es','tr','pl','hi','pt','ta'] as const)for(const key of ['logoutAll','confirm','explain','failed','registered','rules','copy','copied'] as const)expect(accountSecurityText(lang,key).length).toBeGreaterThan(1);
});
