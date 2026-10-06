import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
// Deterministic Home effect harness. The browser fixture additionally mounts the
// real React tree; auth/store/HTTP races below run without a browser dependency.
const h=vi.hoisted(()=>({slots:[] as any[],cursor:0,effects:[] as (()=>void)[],cleanups:new Map<number,()=>void>(),auth:new Set<(event:string,session:any)=>void>(),session:vi.fn(),user:vi.fn(),initialize:vi.fn(),callback:{kind:'none',failed:false}}));
vi.mock('react',async original=>{const actual=await original<typeof import('react')>();const mocked={...actual,
useState(initial:any){const i=h.cursor++;if(!(i in h.slots))h.slots[i]=typeof initial==='function'?initial():initial;return [h.slots[i],(v:any)=>{h.slots[i]=typeof v==='function'?v(h.slots[i]):v;}];},
useRef(initial:any){const i=h.cursor++;if(!(i in h.slots))h.slots[i]={current:initial};return h.slots[i];},
useEffect(effect:()=>void|(()=>void),deps:any[]){const i=h.cursor++,prev=h.slots[i];if(!prev||deps.some((v,j)=>v!==prev[j])){h.slots[i]=deps;h.effects.push(()=>{h.cleanups.get(i)?.();const cleanup=effect();if(cleanup)h.cleanups.set(i,cleanup);else h.cleanups.delete(i);});}}
};return {...mocked,default:mocked};});
vi.mock('../lib/supabaseClient',()=>({oauthCallbackAtStartup:h.callback,supabase:{auth:{initialize:h.initialize,getSession:h.session,getUser:h.user,onAuthStateChange:(fn:any)=>{h.auth.add(fn);return {data:{subscription:{unsubscribe:()=>h.auth.delete(fn)}}};},signOut:async()=>({error:null})},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{name:'OAuth'},error:null})})})})}}));
vi.mock('../lib/SoundService',()=>({soundManager:{getConfig:()=>({bgmVolume:0,seVolume:0}),resumeBGM(){},playBGM(){},stopBGM(){},subscribe:()=>()=>{}}}));
vi.mock('../lib/engagementMetrics',()=>({recordVisit:()=>{}}));
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
vi.mock('../components/DevDiaryTimeline',()=>({default:()=>null,DevDiaryTimeline:()=>null}));
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
import {clearRankedSession,requestRankedSession} from '../lib/rankedSession';
const local=new Map<string,string>(),tab=new Map<string,string>(),key='qg_ranked_session_v1';
const storage=(data:Map<string,string>)=>({getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v),removeItem:(k:string)=>data.delete(k)});
const proof={userId:'Alice',token:'ranked_'+'a'.repeat(43),expiresAt:Date.now()+60000};
const oauth={user:{id:'oauth-user',is_anonymous:false,user_metadata:{name:'OAuth'}}};
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
h.session.mockResolvedValue({data:{session:null}});h.user.mockResolvedValue({data:{user:oauth.user},error:null});
clearRankedSession();clearOAuthLoginIntent();circuitAccess.revoke();
});
afterEach(()=>{unmount();vi.useRealTimers();vi.unstubAllGlobals();});
// Explicit login resets the module's same-tab revoked flag; then reload the Home
// component while retaining storage and without granting cached Circuit access.
async function seed(){vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify(proof))));await requestRankedSession('Alice','synthetic',true);local.set('qg_last_user',JSON.stringify({id:'Alice',name:'Cached Alice',type:'registered'}));vi.stubGlobal('fetch',vi.fn().mockImplementation(()=>Promise.resolve(response())));}
describe('Home bootstrap ownership and navigation',()=>{
it('restores a legacy account once and preserves its saved active match',async()=>{await seed();local.set('qg_active_online_match',JSON.stringify({userId:'Alice',roomId:'m1',role:'white',matchMode:'ranked',tc:'3m',timestamp:Date.now()}));render();await settle();expect(circuitAccess.getSnapshot().userId).toBe('Alice');expect(props(GameBoard)).toMatchObject({roomId:'m1',user:{id:'Alice'}});emit('SIGNED_IN',oauth);await settle();expect(props(GameBoard)?.roomId).toBe('m1');expect(circuitAccess.getSnapshot().userId).toBe('Alice');});
it('does not restore a registered profile without a verified token',async()=>{local.set('qg_last_user',JSON.stringify({id:'Alice',type:'registered'}));render();await settle();expect(circuitAccess.getSnapshot().userId).toBeNull();expect(props(TitleScreen)).toBeTruthy();expect(props(LevelSelect)).toBeNull();});
it('retains the saved candidate on 503, then retries without password entry',async()=>{await seed();vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response('',{status:503})).mockImplementation(()=>Promise.resolve(response())));render();await settle();expect(circuitAccess.getSnapshot().userId).toBeNull();expect(local.has(key)).toBe(true);const findRetry=(node:any):any=>!node?null:Array.isArray(node)?node.map(findRetry).find(Boolean):node.type==='button'&&node.props.children==='Retry'?node.props:findRetry(node.props?.children);expect(findRetry(tree)).toBeTruthy();findRetry(tree).onClick();await settle();expect(props(LevelSelect)?.user.id).toBe('Alice');});
it('a new explicit legacy login wins over delayed restoration and late background OAuth',async()=>{await seed();let resolve!:(r:Response)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(done=>{resolve=done;})));render();const attempt=circuitAccess.beginAuthentication();props(TitleScreen).onLogin({id:'Bob',name:'Bob',type:'registered'},attempt);resolve(response());await settle();emit('SIGNED_IN',oauth);await settle();expect(props(LevelSelect)?.user.id).toBe('Bob');expect(circuitAccess.getSnapshot().userId).toBe('Bob');});
it('cross-tab identity invalidation cancels a delayed result',async()=>{await seed();let resolve!:(r:Response)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(done=>{resolve=done;})));render();const event=new Event('storage');Object.assign(event,{key:'qg_last_user',oldValue:local.get('qg_last_user'),newValue:null});window.dispatchEvent(event);resolve(response());await settle();expect(props(LevelSelect)).toBeNull();expect(circuitAccess.getSnapshot().userId).toBeNull();});
it('an explicit redirected OAuth choice supersedes saved legacy only after verification',async()=>{await seed();beginOAuthLoginIntent();h.callback.kind='implicit';h.session.mockResolvedValue({data:{session:oauth}});render();await settle();expect(circuitAccess.getSnapshot().userId).toBe('oauth-user');expect(props(LevelSelect)?.user.id).toBe('oauth-user');expect(local.get(key)).toBeUndefined();expect(tab.get('qg_oauth_login_intent_v1')).toBeUndefined();});
it('canceled OAuth and a newer legacy login cannot be replaced by a delayed OAuth event',async()=>{render();await settle();beginOAuthLoginIntent();props(TitleScreen).onOAuthStart();props(TitleScreen).onOAuthCancel();emit('SIGNED_IN',oauth);await settle();expect(circuitAccess.getSnapshot().userId).toBeNull();const attempt=circuitAccess.beginAuthentication();props(TitleScreen).onLogin({id:'Bob',name:'Bob',type:'registered'},attempt);emit('SIGNED_IN',oauth);await settle();expect(props(LevelSelect)?.user.id).toBe('Bob');});
it('logout prevents pending OAuth verification from restoring an identity',async()=>{h.session.mockResolvedValue({data:{session:oauth}});let resolve!:(v:any)=>void;h.user.mockReturnValue(new Promise(done=>{resolve=done;}));render();await vi.advanceTimersByTimeAsync(0);await settle();circuitAccess.revoke();resolve({data:{user:oauth.user},error:null});await settle();expect(props(LevelSelect)).toBeNull();expect(circuitAccess.getSnapshot().userId).toBeNull();});
});

it('reload after a verified explicit OAuth switch cannot revive the old legacy account',async()=>{
    await seed();beginOAuthLoginIntent();h.callback.kind='implicit';h.session.mockResolvedValue({data:{session:oauth}});render();await settle();
    expect(local.has(key)).toBe(false);expect(circuitAccess.getSnapshot().userId).toBe('oauth-user');
    unmount();render();await settle();expect(props(LevelSelect)?.user.id).toBe('oauth-user');expect(circuitAccess.getSnapshot().userId).toBe('oauth-user');
});
it('interrupted OAuth leaves the prior legacy proof intact and ignores the late verified reply',async()=>{
    await seed();beginOAuthLoginIntent();h.callback.kind='implicit';h.session.mockResolvedValue({data:{session:oauth}});
    let resolve!:(v:any)=>void;h.user.mockReturnValue(new Promise(done=>{resolve=done;}));
    render();await settle();props(TitleScreen).onOAuthCancel();resolve({data:{user:oauth.user},error:null});await settle();
    expect(JSON.parse(local.get(key)!)).toEqual(proof);expect(circuitAccess.getSnapshot().userId).toBeNull();
});
it('an appearance-only cache event preserves the verified identity and active match',async()=>{
    await seed();local.set('qg_active_online_match',JSON.stringify({userId:'Alice',roomId:'m1',role:'white',matchMode:'ranked',timestamp:Date.now()}));render();await settle();
    const event=new Event('storage');Object.assign(event,{key:'qg_last_user',oldValue:JSON.stringify({id:'Alice',type:'registered',name:'Before'}),newValue:JSON.stringify({id:'Alice',type:'registered',name:'After'})});window.dispatchEvent(event);await settle();
    expect(circuitAccess.getSnapshot().userId).toBe('Alice');expect(props(GameBoard)?.roomId).toBe('m1');
});
it('a Supabase sign-out cancels pending OAuth verification without affecting legacy logins',async()=>{
    h.session.mockResolvedValue({data:{session:oauth}});let resolve!:(v:any)=>void;h.user.mockReturnValue(new Promise(done=>{resolve=done;}));render();await settle();
    emit('SIGNED_OUT',null);resolve({data:{user:oauth.user},error:null});await settle();expect(circuitAccess.getSnapshot().userId).toBeNull();
});

it.each(['old-first','new-first'])('a newer explicit OAuth attempt owns in-flight work (%s)',async order=>{
    render();await settle();let resolveOld!:(v:any)=>void,resolveNew!:(v:any)=>void;
    const second={user:{id:'second-oauth',is_anonymous:false,user_metadata:{name:'Second'}}};
    h.user.mockReturnValueOnce(new Promise(done=>{resolveOld=done;})).mockReturnValueOnce(new Promise(done=>{resolveNew=done;}));
    beginOAuthLoginIntent();props(TitleScreen).onOAuthStart();emit('SIGNED_IN',oauth);await settle();
    props(TitleScreen).onOAuthCancel();beginOAuthLoginIntent();props(TitleScreen).onOAuthStart();emit('SIGNED_IN',second);await settle();
    expect(h.user).toHaveBeenCalledTimes(2);
    if(order==='old-first'){
        resolveOld({data:{user:oauth.user},error:null});await settle();
        emit('SIGNED_IN',second);await settle();expect(h.user).toHaveBeenCalledTimes(2);
        expect(circuitAccess.getSnapshot().userId).toBeNull();
    }
    resolveNew({data:{user:second.user},error:null});await settle();expect(circuitAccess.getSnapshot().userId).toBe('second-oauth');
    if(order==='new-first'){resolveOld({data:{user:oauth.user},error:null});await settle();}
    expect(props(LevelSelect)?.user.id).toBe('second-oauth');
});

it.each(['provider-error','exchange-error','no-callback','unconsumed-code'] as const)('failed explicit OAuth bootstrap never adopts an older stored account (%s)',async failure=>{
    await seed();const saved=local.get(key);beginOAuthLoginIntent();h.session.mockResolvedValue({data:{session:oauth}});
    h.callback.kind=failure==='no-callback'?'none':failure==='unconsumed-code'?'pkce':'implicit';
    h.callback.failed=failure==='provider-error';
    if(failure==='exchange-error')h.initialize.mockResolvedValue({error:{message:'Synthetic exchange failure'}});
    if(failure==='unconsumed-code')Object.assign(window.location,{search:'?code=synthetic-code'});
    render();emit('SIGNED_IN',oauth);await settle();emit('SIGNED_IN',oauth);await settle();
    expect(circuitAccess.getSnapshot().userId).toBeNull();expect(props(LevelSelect)).toBeNull();expect(local.get(key)).toBe(saved);
    expect(tab.has('qg_oauth_login_intent_v1')).toBe(false);expect(h.user).not.toHaveBeenCalled();
    // A fresh explicit choice still works after rejecting the failed old callback.
    beginOAuthLoginIntent();props(TitleScreen).onOAuthStart();emit('SIGNED_IN',oauth);await settle();
    expect(circuitAccess.getSnapshot().userId).toBe('oauth-user');
});
