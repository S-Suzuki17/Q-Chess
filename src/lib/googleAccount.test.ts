import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const h=vi.hoisted(()=>({get:vi.fn(),signIn:vi.fn(),open:vi.fn(),native:false,begin:vi.fn(),clear:vi.fn()}));
vi.mock('./supabaseClient',()=>({supabase:{auth:{getSession:h.get,signInWithOAuth:h.signIn}}}));
vi.mock('./rankedSession',()=>({gameServerUrl:()=> 'https://game.example'}));
vi.mock('@capacitor/core',()=>({Capacitor:{isNativePlatform:()=>h.native}}));
vi.mock('@capacitor/browser',()=>({Browser:{open:h.open}}));
vi.mock('./oauthLoginIntent',()=>({beginOAuthLoginIntent:h.begin,clearOAuthLoginIntent:h.clear}));
import {startGoogleSignIn,completeGoogleAccount,confirmGooglePassword,readGoogleAccount} from './googleAccount';
import {rememberGoogleAccount,forgetGoogleAccount} from './googleAccountIdentity';
import {CURRENT_TERMS_VERSION} from '../config/currentTerms';
const account={authId:'google',userId:'LegacyAlice',username:'Alice',name:'Alice'};
beforeEach(()=>{
 vi.clearAllMocks();h.native=false;forgetGoogleAccount();
 h.get.mockResolvedValue({data:{session:{user:{id:'google',is_anonymous:false},access_token:'current-google-token'}},error:null});
 h.signIn.mockResolvedValue({data:{url:'https://accounts.google.com/authorized-fixture'},error:null});
 const values=new Map();vi.stubGlobal('sessionStorage',{setItem:(k:string,v:string)=>values.set(k,v),getItem:(k:string)=>values.get(k)??null,removeItem:(k:string)=>values.delete(k)});
 vi.stubGlobal('window',{location:{origin:'https://q-gambit.com'}});
});
afterEach(()=>vi.unstubAllGlobals());
it('starts Google only on Web and uses the registered native callback in the app',async()=>{
 await startGoogleSignIn();
 expect(h.signIn).toHaveBeenLastCalledWith({provider:'google',options:{redirectTo:'https://q-gambit.com',skipBrowserRedirect:false}});
 h.native=true;await startGoogleSignIn(true);
 expect(h.signIn).toHaveBeenLastCalledWith({provider:'google',options:{redirectTo:'qgambit://login-callback',skipBrowserRedirect:true,queryParams:{prompt:'select_account'}}});
 expect(h.open).toHaveBeenCalledWith({url:'https://accounts.google.com/authorized-fixture'});
});
it('sends explicit setup and consent under the authenticated identity without storing credentials',async()=>{
 const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({authId:'google',account})));
 vi.stubGlobal('fetch',fetcher);
 expect(await completeGoogleAccount('google','Alice','SyntheticPassword123','OldPassword')).toEqual(account);
 expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({username:'Alice',password:'SyntheticPassword123',legacyPassword:'OldPassword',accepted:true,termsVersion:CURRENT_TERMS_VERSION});
 expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer current-google-token');
 expect(sessionStorage.getItem('password')).toBeNull();
});
it('rejects a mismatched Auth session and mismatched account response',async()=>{
 const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({authId:'another',account,termsVersion:CURRENT_TERMS_VERSION})));
 vi.stubGlobal('fetch',fetcher);
 await expect(readGoogleAccount('google')).rejects.toThrow('AUTH_UNAVAILABLE');
 await expect(readGoogleAccount('another')).rejects.toThrow('GOOGLE_REQUIRED');expect(fetcher).toHaveBeenCalledOnce();
});
it('binds action confirmation to the stable mapped account and exact access token',async()=>{
 const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({authId:'google',proof:'a'.repeat(64)})));vi.stubGlobal('fetch',fetcher);
 await expect(confirmGooglePassword('LegacyAlice','password','delete')).rejects.toThrow('GOOGLE_REQUIRED');
 rememberGoogleAccount(account);
 expect(await confirmGooglePassword('LegacyAlice','password','delete')).toEqual({proof:'a'.repeat(64),token:'current-google-token'});
 expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({password:'password',action:'delete'});
});
