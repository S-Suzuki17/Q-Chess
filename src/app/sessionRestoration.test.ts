import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
// Deterministic Home effect harness. The browser fixture additionally mounts the
// real React tree; auth/store/HTTP races below run without a browser dependency.
const h=vi.hoisted(()=>({slots:[] as any[],cursor:0,effects:[] as (()=>void)[],cleanups:new Map<number,()=>void>(),auth:new Set<(event:string,session:any)=>void>(),session:vi.fn(),user:vi.fn(),initialize:vi.fn(),lookup:vi.fn(),callback:{kind:'none',failed:false}}));
vi.mock('react',async original=>{const actual=await original<typeof import('react')>();const mocked={...actual,
useState(initial:any){const i=h.cursor++;if(!(i in h.slots))h.slots[i]=typeof initial==='function'?initial():initial;return [h.slots[i],(v:any)=>{h.slots[i]=typeof v==='function'?v(h.slots[i]):v;}];},
useRef(initial:any){const i=h.cursor++;if(!(i in h.slots))h.slots[i]={current:initial};return h.slots[i];},
// Each deterministic render reads the current access snapshot; settle() drives subscriptions.
useSyncExternalStore(_subscribe:unknown,getSnapshot:()=>unknown){h.cursor++;return getSnapshot();},
useEffect(effect:()=>void|(()=>void),deps:any[]){const i=h.cursor++,prev=h.slots[i];if(!prev||deps.some((v,j)=>v!==prev[j])){h.slots[i]=deps;h.effects.push(()=>{h.cleanups.get(i)?.();const cleanup=effect();if(cleanup)h.cleanups.set(i,cleanup);else h.cleanups.delete(i);});}}
};return {...mocked,default:mocked};});
vi.mock('../lib/supabaseClient',()=>({oauthCallbackAtStartup:h.callback,supabase:{auth:{initialize:h.initialize,getSession:h.session,getUser:h.user,onAuthStateChange:(fn:any)=>{h.auth.add(fn);return {data:{subscription:{unsubscribe:()=>h.auth.delete(fn)}}};},signOut:async()=>({error:null})},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{name:'OAuth'},error:null})})})})}}));
vi.mock('@capacitor/core',async original=>({...await original<typeof import('@capacitor/core')>(),Capacitor:{isNativePlatform:()=>false,getPlatform:()=> 'web'}}));
vi.mock('../lib/googleAccount',()=>({readGoogleAccount:h.lookup,wantsGooglePasswordReset:()=>false,clearGooglePasswordReset:()=>{},GoogleLoginError:class extends Error {constructor(public code:string){super(code);}}}));
vi.mock('../components/GoogleAccountSetup',()=>({GoogleAccountSetup:()=>null}));
vi.mock('../lib/SoundService',()=>({soundManager:{getConfig:()=>({bgmVolume:0,seVolume:0}),resumeBGM(){},playBGM(){},stopBGM(){},subscribe:()=>()=>{}}}));
vi.mock('../lib/engagementMetrics',()=>({recordVisit:()=>{}}));
vi.mock('../lib/oauthAdmission',()=>({requireOAuthAdmission:vi.fn(async()=>{})}));
vi.mock('../lib/SocketContext',()=>({SocketProvider:()=>null}));
vi.mock('../hooks/useAppPlatform',()=>({useAppPlatform:()=>({android:false,webContent:false})}));
vi.mock('../hooks/useNativeAuthLinks',()=>({useNativeAuthLinks:()=>({failed:false,dismiss:()=>{}})}));
vi.mock('../hooks/useCampaignProgress',()=>({useCampaignProgress:()=>({progress:{music:'standard'},loaded:true,update:()=>{}})}));
vi.mock('../hooks/useFoundersRewards',()=>({useFoundersRewards:()=>({available:false})}));
vi.mock('../hooks/useCampaignCloud',()=>({useCampaignCloud:()=>({userId:null})}));
vi.mock('../components/GameBoard',()=>({default:()=>null,GameBoard:()=>null}));
vi.mock('../components/NativeRewardSettings',()=>({default:()=>null,NativeRewardSettings:()=>null}));
vi.mock('../components/FoundersSettings',()=>({default:()=>null,FoundersSettings:()=>null}));
vi.mock('../components/SiteInformation',()=>({default:()=>null,SiteLinks:()=>null,SiteIntroduction:()=>null}));
vi.mock('../components/AppSupportLinks',()=>({default:()=>null,AppSupportLinks:()=>null}));
vi.mock('../components/SystemStatusBanner',()=>({default:()=>null,SystemStatusBanner:()=>null}));
vi.mock('../components/TitleScreen',()=>({default:()=>null,TitleScreen:()=>null}));
vi.mock('../components/LevelSelect',()=>({default:()=>null,LevelSelect:()=>null}));
vi.mock('../components/SettingsDialog',()=>({default:()=>null,SettingsDialog:()=>null}));
vi.mock('../components/CampaignMode',()=>({default:()=>null,CampaignMode:()=>null}));
vi.mock('../components/OptionalMetricsSettings',()=>({default:()=>null,OptionalMetricsSettings:()=>null}));
vi.mock('../components/ReplayBoard',()=>({default:()=>null,ReplayBoard:()=>null}));
vi.mock('../components/RankedMatchmakingManager',()=>({default:()=>null,RankedMatchmakingManager:()=>null}));
vi.mock('../components/TermsGate',()=>({default:()=>null,TermsGate:()=>null}));
vi.mock('../components/DailyLoginClaimController',()=>({default:()=>null,DailyLoginClaimController:()=>null}));
vi.mock('../components/MemberTicketsPanel',()=>({default:()=>null,MemberTicketClaimController:()=>null}));
vi.mock('../components/CosmeticsSettings',()=>({default:()=>null,CosmeticsSettings:()=>null}));
vi.mock('../components/CampaignCloudPanel',()=>({default:()=>null,CampaignCloudPanel:()=>null}));
import Home from './page';
import {TitleScreen} from '../components/TitleScreen';
import {LevelSelect} from '../components/LevelSelect';
import GameBoard from '../components/GameBoard';
import {circuitAccess} from '../lib/circuitAccess';
import {beginOAuthLoginIntent,clearOAuthLoginIntent} from '../lib/oauthLoginIntent';
import {clearRankedSession} from '../lib/rankedSession';
const local=new Map<string,string>(),tab=new Map<string,string>(),key='qg_ranked_session_v1';
const storage=(data:Map<string,string>)=>({getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v),removeItem:(k:string)=>data.delete(k)});
const account={authId:'oauth-user',userId:'Alice',username:'Alice',name:'Alice'};
const proof={userId:'Alice',token:'ranked_'+'a'.repeat(43),expiresAt:Date.now()+60000};
const oauth={access_token:'fixture-oauth-token',user:{id:'oauth-user',is_anonymous:false,user_metadata:{name:'OAuth'}}};
const response=()=>new Response(JSON.stringify({userId:proof.userId,expiresAt:proof.expiresAt,serverNow:Date.now()}));
let tree:any;
function render(){h.cursor=0;tree=Home();h.effects.splice(0).forEach(fn=>fn());return tree;}
function props(type:any,node:any=tree):any {if(!node)return null;if(Array.isArray(node)){for(const child of node){const found=props(type,child);if(found)return found;}return null;}if(node.type===type)return node.props;return node.props?.children?props(type,node.props.children):null;}
async function settle(){for(let i=0;i<12;i++){await Promise.resolve();render();}await vi.advanceTimersByTimeAsync(0);for(let i=0;i<8;i++){await Promise.resolve();render();}}
function emit(event:string,session:any){h.auth.forEach(fn=>fn(event,session));}
const unmount=()=>{h.cleanups.forEach(fn=>fn());h.cleanups.clear();h.slots=[];h.effects=[];};
beforeEach(()=>{
vi.useFakeTimers();vi.clearAllMocks();h.slots=[];h.effects=[];h.auth.clear();local.clear();tab.clear();
vi.stubGlobal('window',Object.assign(new EventTarget(),{location:{search:'',hash:''}}));vi.stubGlobal('document',{documentElement:{lang:'en'},addEventListener(){},removeEventListener(){}});
vi.stubGlobal('navigator',{language:'en'});vi.stubGlobal('localStorage',storage(local));vi.stubGlobal('sessionStorage',storage(tab));
vi.stubGlobal('fetch',vi.fn().mockImplementation(()=>Promise.resolve(response())));
Object.assign(h.callback,{kind:'none',failed:false});h.initialize.mockResolvedValue({error:null});
h.lookup.mockResolvedValue(account);h.session.mockResolvedValue({data:{session:null}});h.user.mockResolvedValue({data:{user:oauth.user},error:null});
clearRankedSession();clearOAuthLoginIntent();circuitAccess.revoke();
});
afterEach(()=>{unmount();vi.useRealTimers();vi.unstubAllGlobals();});

const deferred=<T>()=>{let resolve!:(v:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};};
function button(label:string,node:any=tree):any {if(!node)return null;if(Array.isArray(node))return node.map(n=>button(label,n)).find(Boolean);if(node.type==='button'&&node.props.children===label)return node.props;return node.props?.children?button(label,node.props.children):null;}
function seed(){local.set(key,JSON.stringify(proof));local.set('qg_last_user',JSON.stringify({id:'Alice',name:'Cached Alice',type:'registered'}));h.session.mockResolvedValue({data:{session:oauth}});}
function seedMatch(){local.set('qg_active_online_match',JSON.stringify({userId:'Alice',roomId:'m1',role:'white',matchMode:'ranked',tc:'3m',timestamp:Date.now()}));}
describe('Home Google bootstrap ownership and navigation',()=>{
it('hides login during verification and restores the server-mapped account and saved match',async()=>{
 seed();seedMatch();const lookup=deferred<any>();h.lookup.mockReturnValue(lookup.promise);render();await settle();
 expect(props(TitleScreen)).toBeNull();expect(props(GameBoard)).toBeNull();expect(circuitAccess.getSnapshot().userId).toBeNull();
 lookup.resolve(account);await settle();expect(props(GameBoard)).toMatchObject({roomId:'m1',user:{id:'Alice'}});expect(circuitAccess.getSnapshot().userId).toBe('Alice');
 emit('TOKEN_REFRESHED',oauth);await settle();expect(props(GameBoard)?.roomId).toBe('m1');expect(h.lookup).toHaveBeenCalledOnce();
});
it('does not restore a profile from legacy proof or display cache without Google',async()=>{
 seed();h.session.mockResolvedValue({data:{session:null}});render();await settle();
 expect(circuitAccess.getSnapshot().userId).toBeNull();expect(props(TitleScreen)).toBeTruthy();expect(props(LevelSelect)).toBeNull();expect(h.lookup).not.toHaveBeenCalled();
});
it('retains a saved Google session during an outage and retries without login',async()=>{
 seed();h.lookup.mockRejectedValueOnce(new Error('offline'));render();await settle();
 expect(circuitAccess.getSnapshot().userId).toBeNull();expect(button('Retry')).toBeTruthy();button('Retry').onClick();await settle();
 expect(props(LevelSelect)?.user.id).toBe('Alice');expect(local.has(key)).toBe(false);
});
it('cancel and guest entry win over a delayed Google response and late auth events',async()=>{
 seed();const lookup=deferred<any>();h.lookup.mockReturnValue(lookup.promise);render();await settle();button('Cancel').onClick();await settle();
 props(TitleScreen).onLogin({id:'GUEST-1',name:'Guest',type:'guest'});lookup.resolve(account);emit('SIGNED_IN',oauth);await settle();
 expect(props(LevelSelect)?.user.id).toBe('GUEST-1');expect(circuitAccess.getSnapshot().userId).toBeNull();
});
it('remote sign-out cancels pending verification and clears the mapped user',async()=>{
 seed();const lookup=deferred<any>();h.lookup.mockReturnValue(lookup.promise);render();await settle();emit('SIGNED_OUT',null);lookup.resolve(account);await settle();
 expect(props(TitleScreen)).toBeTruthy();expect(props(LevelSelect)).toBeNull();expect(circuitAccess.getSnapshot().userId).toBeNull();
});
it('reload after Google verification cannot revive a legacy password session',async()=>{
 seed();beginOAuthLoginIntent();h.callback.kind='implicit';render();await settle();
 expect(local.has(key)).toBe(false);expect(tab.has('qg_oauth_login_intent_v1')).toBe(false);expect(circuitAccess.getSnapshot().userId).toBe('Alice');
 unmount();render();await settle();expect(props(LevelSelect)?.user.id).toBe('Alice');expect(h.lookup).toHaveBeenCalledTimes(2);
});
it('circuit access invalidation fences a delayed identity response',async()=>{
 seed();const lookup=deferred<any>();h.lookup.mockReturnValue(lookup.promise);render();await settle();circuitAccess.revoke();lookup.resolve(account);await settle();
 expect(props(LevelSelect)).toBeNull();expect(circuitAccess.getSnapshot().userId).toBeNull();
});
it.each(['old-first','new-first'])('a newer explicit Google attempt owns in-flight work (%s)',async order=>{
 render();await settle();const old=deferred<any>(),next=deferred<any>();h.lookup.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
 beginOAuthLoginIntent();props(TitleScreen).onOAuthStart();emit('SIGNED_IN',oauth);await settle();button('Cancel').onClick();await settle();
 const second={access_token:'second-token',user:{id:'google-b',is_anonymous:false}};
 beginOAuthLoginIntent();props(TitleScreen).onOAuthStart();emit('SIGNED_IN',second);await settle();
 if(order==='old-first'){old.resolve(account);await settle();expect(circuitAccess.getSnapshot().userId).toBeNull();}
 next.resolve({authId:'google-b',userId:'Bob',username:'Bob',name:'Bob'});await settle();
 if(order==='new-first'){old.resolve(account);await settle();}
 expect(props(LevelSelect)?.user.id).toBe('Bob');expect(circuitAccess.getSnapshot().userId).toBe('Bob');
});
it.each(['provider-error','exchange-error','no-callback','unconsumed-code'] as const)('failed interactive Google callback never adopts an older session (%s)',async failure=>{
 seed();const saved=local.get(key);beginOAuthLoginIntent();
 h.callback.kind=failure==='no-callback'?'none':failure==='unconsumed-code'?'pkce':'implicit';h.callback.failed=failure==='provider-error';
 if(failure==='exchange-error')h.initialize.mockResolvedValue({error:{message:'Synthetic exchange failure'}});
 if(failure==='unconsumed-code')Object.assign(window.location,{search:'?code=synthetic-code'});
 render();emit('SIGNED_IN',oauth);await settle();emit('SIGNED_IN',oauth);await settle();
 expect(circuitAccess.getSnapshot().userId).toBeNull();expect(props(LevelSelect)).toBeNull();expect(h.lookup).not.toHaveBeenCalled();expect(local.get(key)).toBe(saved);
 if(button('Cancel')){button('Cancel').onClick();await settle();}
 beginOAuthLoginIntent();props(TitleScreen).onOAuthStart();emit('SIGNED_IN',oauth);await settle();expect(props(LevelSelect)?.user.id).toBe('Alice');
});
});
