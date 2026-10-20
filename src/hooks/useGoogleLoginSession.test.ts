import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const h=vi.hoisted(()=>({
 refs:[] as {current:any}[],states:[] as any[],effects:[] as (()=>(()=>void)|void)[],refIndex:0,stateIndex:0,
 initialize:vi.fn(),getSession:vi.fn(),read:vi.fn(),admit:vi.fn(),clear:vi.fn(),intent:false,reset:false,
 event:null as null|((event:string,session:any)=>void),unsubscribe:vi.fn(),
}));
vi.mock('react',()=>({
 useRef:(value:unknown)=>h.refs[h.refIndex++]??(h.refs[h.refIndex-1]={current:value}),
 useState:(value:unknown)=>{const index=h.stateIndex++;if(!(index in h.states))h.states[index]=value;
  return [h.states[index],(next:unknown)=>{h.states[index]=next;}];},
 useEffect:(effect:()=>void)=>{if(!h.effects.length)h.effects.push(effect);},
}));
vi.mock('@capacitor/core',()=>({Capacitor:{isNativePlatform:()=>false}}));
vi.mock('../lib/supabaseClient',()=>({oauthCallbackAtStartup:{kind:'pkce',failed:false},supabase:{auth:{
 initialize:h.initialize,getSession:h.getSession,onAuthStateChange:(fn:typeof h.event)=>{h.event=fn;return {data:{subscription:{unsubscribe:h.unsubscribe}}};},
}}}));
vi.mock('../lib/rankedSession',()=>({clearRankedSession:h.clear}));
vi.mock('../lib/oauthLoginIntent',()=>({clearOAuthLoginIntent:()=>{h.intent=false;},hasOAuthLoginIntent:()=>h.intent,completedOAuthCallback:()=>true}));
vi.mock('../lib/oauthAdmission',()=>({requireOAuthAdmission:h.admit}));
vi.mock('../lib/googleAccount',()=>({readGoogleAccount:h.read,wantsGooglePasswordReset:()=>h.reset,clearGooglePasswordReset:()=>{h.reset=false;},
 GoogleLoginError:class extends Error {constructor(public code:string){super(code);}}}));
import {useGoogleLoginSession} from './useGoogleLoginSession';
import {circuitAccess} from '../lib/circuitAccess';
import {googleAccountFor,forgetGoogleAccount} from '../lib/googleAccountIdentity';
const session=(id='google-a')=>({access_token:`token-${id}`,user:{id,is_anonymous:false}});
const account=(id='google-a')=>({authId:id,userId:id==='google-a'?'LegacyAlice':'Bob',username:'Alice',name:'Alice'});
const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};};
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
beforeEach(()=>{
 vi.clearAllMocks();h.refs=[];h.states=[];h.effects=[];h.refIndex=0;h.stateIndex=0;h.event=null;h.intent=false;h.reset=false;
 circuitAccess.revoke();forgetGoogleAccount();
 h.initialize.mockResolvedValue({error:null});h.getSession.mockResolvedValue({data:{session:session()},error:null});
 h.read.mockResolvedValue(account());h.admit.mockResolvedValue(undefined);
});
afterEach(()=>vi.useRealTimers());
function mount(){
 const ready=vi.fn(),out=vi.fn();
 const render=()=>{h.refIndex=0;h.stateIndex=0;return useGoogleLoginSession(ready,out);};
 const api=render();const cleanup=h.effects[0]();
 return {api,ready,out,render,cleanup};
}
describe('Google session lifecycle',()=>{
 it('keeps login hidden while restoring and grants only the server-mapped account',async()=>{
  const read=deferred<any>();h.read.mockReturnValue(read.promise);const f=mount();
  expect(f.api.state.status).toBe('checking');await flush();expect(f.ready).not.toHaveBeenCalled();
  read.resolve(account());await flush();expect(f.render().state.status).toBe('ready');
  expect(f.ready).toHaveBeenCalledWith({id:'LegacyAlice',name:'Alice',type:'registered'});
  expect(circuitAccess.getSnapshot().userId).toBe('LegacyAlice');expect(googleAccountFor('LegacyAlice')?.authId).toBe('google-a');f.cleanup?.();
 });
 it('does not grant access or call admission before setup and explicit completion',async()=>{
  h.read.mockResolvedValue(null);const f=mount();await flush();
  expect(f.render().state.status).toBe('setup');expect(f.ready).not.toHaveBeenCalled();expect(h.admit).not.toHaveBeenCalled();
  f.api.finish(account());expect(f.ready).toHaveBeenCalledOnce();f.cleanup?.();
 });
 it('cancel fences both initialization and a late account response',async()=>{
  const initialized=deferred<any>();h.initialize.mockReturnValue(initialized.promise);
  const f=mount();f.api.cancel();initialized.resolve({error:null});await flush();
  expect(f.render().state.status).toBe('signed-out');expect(h.read).not.toHaveBeenCalled();expect(f.ready).not.toHaveBeenCalled();f.cleanup?.();
 });
 it('cancelled or unmounted requests cannot restore a user',async()=>{
  const read=deferred<any>();h.read.mockReturnValue(read.promise);const f=mount();await flush();f.api.cancel();
  read.resolve(account());await flush();expect(f.ready).not.toHaveBeenCalled();expect(circuitAccess.getSnapshot().userId).toBeNull();f.cleanup?.();
 });
 it('keeps the saved session on temporary failure and supports retry',async()=>{
  h.read.mockRejectedValueOnce(new Error('offline'));const f=mount();await flush();expect(f.render().state.status).toBe('error');
  f.api.retry();await flush();expect(f.render().state.status).toBe('ready');f.cleanup?.();
 });
 it('does not reset an active match on a refresh and revokes on remote signout',async()=>{
  vi.useFakeTimers();const f=mount();await flush();const revision=circuitAccess.getSnapshot().revision;
  h.event?.('TOKEN_REFRESHED',session());await vi.runAllTimersAsync();
  expect(f.ready).toHaveBeenCalledOnce();expect(circuitAccess.getSnapshot().revision).toBe(revision);
  h.event?.('SIGNED_OUT',null);expect(f.out).toHaveBeenCalledOnce();expect(googleAccountFor('LegacyAlice')).toBeNull();
  expect(f.render().state.status).toBe('signed-out');f.cleanup?.();
 });
 it('revokes the previous owner before accepting a different Google account',async()=>{
  vi.useFakeTimers();const f=mount();await flush();h.read.mockResolvedValue(account('google-b'));
  h.event?.('SIGNED_IN',session('google-b'));await vi.runAllTimersAsync();
  expect(f.out).toHaveBeenCalledOnce();expect(circuitAccess.getSnapshot().userId).toBe('Bob');
  expect(googleAccountFor('LegacyAlice')).toBeNull();f.cleanup?.();
 });
 it('requires fresh admission for interactive sign-in and gates password reset',async()=>{
  h.intent=true;const f=mount();await flush();expect(h.admit).toHaveBeenCalledWith('token-google-a','LegacyAlice');f.cleanup?.();
 });
 it('never treats the reset intent alone as completed account access',async()=>{
  h.reset=true;const f=mount();await flush();expect(f.render().state.status).toBe('reset');
  expect(f.ready).not.toHaveBeenCalled();expect(circuitAccess.getSnapshot().userId).toBeNull();f.cleanup?.();
 });
});
