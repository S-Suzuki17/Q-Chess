import {beforeEach,afterEach,expect,it,vi} from 'vitest';
let value:string|null=null;
beforeEach(()=>{vi.resetModules();value=null;vi.stubGlobal('window',new EventTarget());vi.stubGlobal('sessionStorage',{getItem:()=>value,setItem:(_key:string,v:string)=>{value=v;},removeItem:()=>{value=null;}});});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
it('survives only a bounded callback reload and never treats malformed/future markers as intent',async()=>{
    vi.spyOn(Date,'now').mockReturnValue(1000000);let m=await import('./oauthLoginIntent');m.beginOAuthLoginIntent();expect(m.hasOAuthLoginIntent()).toBe(true);
    vi.resetModules();m=await import('./oauthLoginIntent');expect(m.hasOAuthLoginIntent()).toBe(true);expect(m.hasOAuthLoginIntent(1600000)).toBe(false);expect(m.hasOAuthLoginIntent(999999)).toBe(false);
    value='{"version":1,"createdAt":"1000000"}';expect(m.hasOAuthLoginIntent()).toBe(false);
});
it('clears cancellation/logout/new-login intent, including same-tab storage failure',async()=>{
    const m=await import('./oauthLoginIntent');m.beginOAuthLoginIntent();m.clearOAuthLoginIntent();expect(m.hasOAuthLoginIntent()).toBe(false);expect(value).toBeNull();
    m.beginOAuthLoginIntent();sessionStorage.removeItem=()=>{throw new Error('Blocked');};m.clearOAuthLoginIntent();expect(m.hasOAuthLoginIntent()).toBe(false);
});
it('does not start an OAuth handoff when the intent marker cannot be stored',async()=>{
    const m=await import('./oauthLoginIntent');sessionStorage.setItem=()=>{throw new Error('Blocked');};expect(()=>m.beginOAuthLoginIntent()).toThrow();expect(m.hasOAuthLoginIntent()).toBe(false);
});
it('captures only callback shape and requires successful SDK consumption',async()=>{
    const {captureOAuthCallback,completedOAuthCallback}=await import('./oauthLoginIntent');
    const implicit=captureOAuthCallback({search:'',hash:'#access_token=synthetic-secret&refresh_token=synthetic-other'} as Location);
    expect(implicit).toEqual({kind:'implicit',failed:false});expect(JSON.stringify(implicit)).not.toContain('synthetic');
    Object.assign(window,{location:{search:'',hash:''}});expect(completedOAuthCallback(implicit,null)).toBe(true);
    expect(completedOAuthCallback(implicit,new Error('Denied'))).toBe(false);
    expect(completedOAuthCallback({kind:'none',failed:false},null)).toBe(false);
    const failed=captureOAuthCallback({search:'',hash:'#error=access_denied&error_description=synthetic'} as Location);
    expect(completedOAuthCallback(failed,null)).toBe(false);
    Object.assign(window.location,{search:'?code=synthetic'});expect(completedOAuthCallback({kind:'pkce',failed:false},null)).toBe(false);
});

it.each(['provider-error','no-callback','unconsumed-code'] as const)('real auth-js never makes an older session evidence of callback success (%s)',async kind=>{
    const {GoTrueClient}=await import('@supabase/auth-js');
    const {captureOAuthCallback,completedOAuthCallback}=await import('./oauthLoginIntent');
    const suffix=kind==='provider-error'?'#error=access_denied&error_description=User+cancelled':kind==='unconsumed-code'?'?code=synthetic-unconsumed':'';
    const location=new URL('https://fixture.invalid/'+suffix);
    vi.stubGlobal('window',{location});vi.stubGlobal('document',{});vi.stubGlobal('BroadcastChannel',undefined);
    const cached={access_token:'synthetic-old-token',refresh_token:'synthetic-old-refresh',token_type:'bearer',expires_in:3600,
        expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'previous-oauth-Bob',is_anonymous:false}};
    const storageKey='fixture-auth-'+kind,values=new Map([[storageKey,JSON.stringify(cached)]]);
    const blocked=vi.fn(async()=>{throw new Error('No network permitted');});
    const initial=captureOAuthCallback();
    const client=new GoTrueClient({url:'https://fixture.invalid/auth/v1',storageKey,persistSession:true,autoRefreshToken:false,
        detectSessionInUrl:true,storage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>{values.set(k,v);},removeItem:k=>{values.delete(k);}},fetch:blocked});
    const initialized=await client.initialize(),session=await client.getSession();
    expect(session.data.session?.user.id).toBe('previous-oauth-Bob');expect(session.error).toBeNull();expect(blocked).not.toHaveBeenCalled();
    if(kind==='provider-error')expect(initialized.error).not.toBeNull();else expect(initialized.error).toBeNull();
    expect(completedOAuthCallback(initial,initialized.error)).toBe(false);await client.dispose();
});

it('real auth-js successful implicit callback consumes its parameters and verifies the returned user through a synthetic transport',async()=>{
    const {GoTrueClient}=await import('@supabase/auth-js');
    const {captureOAuthCallback,completedOAuthCallback}=await import('./oauthLoginIntent');
    const location=new URL('https://fixture.invalid/#access_token=synthetic-new-token&refresh_token=synthetic-refresh&expires_in=3600&token_type=bearer');
    vi.stubGlobal('window',{location});vi.stubGlobal('document',{});vi.stubGlobal('BroadcastChannel',undefined);
    const user={id:'new-oauth-Alice',is_anonymous:false,aud:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
    const values=new Map<string,string>();
    const transport=vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>{
        expect(String(url)).toBe('https://fixture.invalid/auth/v1/user');
        expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer synthetic-new-token');
        return new Response(JSON.stringify(user),{headers:{'Content-Type':'application/json'}});
    });
    const initial=captureOAuthCallback();
    const client=new GoTrueClient({url:'https://fixture.invalid/auth/v1',storageKey:'fixture-auth-success',persistSession:true,
        autoRefreshToken:false,detectSessionInUrl:true,storage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>{values.set(k,v);},removeItem:k=>{values.delete(k);}},fetch:transport});
    const initialized=await client.initialize(),session=await client.getSession();
    expect(initialized.error).toBeNull();expect(session.data.session?.user.id).toBe('new-oauth-Alice');expect(transport).toHaveBeenCalledOnce();
    expect(location.hash).toBe('');expect(completedOAuthCallback(initial,initialized.error)).toBe(true);await client.dispose();
});
