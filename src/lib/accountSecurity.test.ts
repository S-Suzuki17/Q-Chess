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
    await registerAccount('Alice','correct-horse-123','alice@example.test');expect(fetcher.mock.calls[0][0].pathname).toBe('/auth/register');
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({username:'Alice',password:'correct-horse-123',email:'alice@example.test'});
    expect(fetcher.mock.calls[0][1]).toMatchObject({credentials:'omit',redirect:'error',cache:'no-store'});
    h.origin.mockReturnValue('http://game.example');await expect(registerAccount('Alice','password','alice@example.test')).rejects.toThrow();expect(fetcher).toHaveBeenCalledOnce();
});
it('fails closed for registration failures and never fabricates a session',async()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    for(const status of [400,409,429,503]){fetcher.mockResolvedValue(new Response('{}',{status}));await expect(registerAccount('Alice','correct-horse-123','alice@example.test')).rejects.toThrow();}
    fetcher.mockResolvedValue(new Response('{}'));await expect(registerAccount('Alice','correct-horse-123','alice@example.test')).rejects.toThrow();
});
it('global logout posts no selectable account and requires an acknowledged result',async()=>{
    h.request.mockResolvedValue({userId:'Alice',revoked:true});await revokeAllAccountSessions('Alice');
    expect(h.request).toHaveBeenCalledExactlyOnceWith('/account/sessions/revoke-all','Alice',{},undefined,undefined);
    h.request.mockResolvedValue({revoked:false});await expect(revokeAllAccountSessions('Alice')).rejects.toThrow();
});
it('provides security and support text in all twelve languages',()=>{
    for(const lang of ['ja','en','zh','ru','fr','de','es','tr','pl','hi','pt','ta'] as const)for(const key of ['logoutAll','confirm','explain','failed','registered','rules','copy','copied'] as const)expect(accountSecurityText(lang,key).length).toBeGreaterThan(1);
});

it('uses only allowlisted registration field/reason pairs from a 400 response',async()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    fetcher.mockResolvedValue(new Response(JSON.stringify({code:'INVALID_REGISTRATION',field:'password',reason:'weak',message:'private detail',password:'private input'}),{status:400}));
    let error=await registerAccount('Alice','correct-horse-123','alice@example.test').catch(e=>e);
    expect(error).toMatchObject({registrationCode:'INVALID_REQUEST',issue:{field:'password',reason:'weak'}});
    expect(JSON.stringify(error)).not.toContain('private');
    for(const body of [
        {code:'INVALID_REGISTRATION',field:'email',reason:'weak'},
        {code:'INVALID_REGISTRATION',field:'email',reason:'already_exists'},
        {code:'INVALID_REGISTRATION',field:'__proto__',reason:'format'},
        {code:'UPSTREAM_ERROR',field:'password',reason:'weak'},
        {code:'INVALID_REQUEST'},[],null,
    ]){
        fetcher.mockResolvedValue(new Response(JSON.stringify(body),{status:400}));
        error=await registerAccount('Alice','correct-horse-123','alice@example.test').catch(e=>e);
        expect(error.registrationCode).toBe('INVALID_REQUEST');expect(error.issue).toBeUndefined();
    }
    fetcher.mockResolvedValue(new Response('{',{status:400}));
    await expect(registerAccount('Alice','correct-horse-123','alice@example.test')).rejects.toMatchObject({registrationCode:'INVALID_REQUEST',issue:undefined});
});

it('distinguishes generic conflict, rate limiting and unavailable service without leaking response details',async()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    for(const [status,code] of [[409,'CONFLICT'],[429,'TRY_LATER'],[503,'UNAVAILABLE']] as const){
        fetcher.mockResolvedValue(new Response(JSON.stringify({field:'email',reason:'format',message:'private account detail'}),{status}));
        const error=await registerAccount('Alice','correct-horse-123','alice@example.test').catch(e=>e);
        expect(error.registrationCode).toBe(code);expect(error.issue).toBeUndefined();expect(JSON.stringify(error)).not.toContain('private');
    }
});
