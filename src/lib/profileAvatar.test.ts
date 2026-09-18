import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {CIRCUIT_ICONS,circuitIcon,circuitIconFromUrl,circuitIconUnlocked} from '../config/circuitIcons';
import {AVATAR_FRAMES} from '../config/avatarFrames';
import {iconEditorText} from '../locales/iconEditorText';
import {MAX_AVATAR_BYTES,validateAvatarFile,isSafeSavedAvatar,saveProfileAvatar,prepareAvatarPhoto} from './profileAvatar';
const mocks=vi.hoisted(()=>({session:vi.fn(),proof:vi.fn()}));
vi.mock('./supabaseClient',()=>({supabase:{auth:{getSession:mocks.session}}}));
vi.mock('./rankedSession',()=>({gameServerUrl:()=> 'https://game.example',readRankedSession:mocks.proof}));
beforeEach(()=>{vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://project.supabase.co');mocks.proof.mockReturnValue({token:'opaque-local-proof'});mocks.session.mockResolvedValue({data:{session:null},error:null});});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.clearAllMocks();});
describe('circuit icons',()=>{
 it('pairs exactly 15 unique same-origin icons with frame unlock milestones',()=>{
  expect(CIRCUIT_ICONS).toHaveLength(15);
  expect(new Set(CIRCUIT_ICONS.map(x=>x.url)).size).toBe(15);
  CIRCUIT_ICONS.forEach((icon,i)=>{expect(icon.frameId).toBe(AVATAR_FRAMES[i].id);expect(icon.requiredWins).toBe(AVATAR_FRAMES[i].requiredWins);expect(circuitIconFromUrl(icon.url)).toEqual(icon);expect(circuitIconUnlocked(icon.id,icon.requiredWins-1)).toBe(false);expect(circuitIconUnlocked(icon.id,icon.requiredWins)).toBe(true);});
  expect(circuitIcon('circuit-16')).toBeUndefined();expect(circuitIconUnlocked('circuit-01',NaN)).toBe(false);
 });
 it('provides chooser, error and milestone copy in all 12 locales',()=>{
  for(const lang of ['ja','en','zh','ru','fr','de','es','tr','pl','hi','pt','ta']as const)for(const key of ['change','photo','earned','save','failed','auth','locked']as const)expect(iconEditorText(lang,key,6).length).toBeGreaterThan(2);
  expect(iconEditorText('ja','change')).toBe('アイコン変更');
  expect(iconEditorText('ja','locked',6)).toContain('6');
 });
 it('rejects SVG, empty and oversized source files',()=>{
  expect(()=>validateAvatarFile({type:'image/svg+xml',size:100})).toThrow('INVALID_PHOTO');
  expect(()=>validateAvatarFile({type:'image/png',size:0})).toThrow('INVALID_PHOTO');
  expect(()=>validateAvatarFile({type:'image/png',size:MAX_AVATAR_BYTES+1})).toThrow('TOO_LARGE');
  for(const type of ['image/png','image/jpeg','image/webp'])expect(()=>validateAvatarFile({type,size:120})).not.toThrow();
 });
 it('accepts only known builtins or owned-format photo URLs on configured origin',()=>{
  const photo='https://project.supabase.co/storage/v1/object/public/avatars/u/'+'a'.repeat(64)+'/00000000-0000-4000-8000-000000000001.webp';
  expect(isSafeSavedAvatar(photo)).toBe(true);
  for(const url of ['https://attacker.example/a.svg','/avatars/circuit-16.svg',photo+'?x=y',photo.replace('project.supabase.co','attacker.example'),'data:image/png;base64,AA','//evil.example/avatars/circuit-01.svg'])expect(isSafeSavedAvatar(url)).toBe(false);
  expect(isSafeSavedAvatar('/avatars/circuit-15.svg')).toBe(true);
 });
});
describe('owner-bound save',()=>{
 it('sends no client owner override and updates only after matching acknowledgement',async()=>{
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({userId:'alice',avatarUrl:'/avatars/circuit-01.svg'})));vi.stubGlobal('fetch',fetcher);
  expect(await saveProfileAvatar('alice',{iconId:'circuit-01'},new AbortController().signal)).toBe('/avatars/circuit-01.svg');
  const [url,options]=fetcher.mock.calls[0];expect(url.pathname).toBe('/profile/avatar/icon');expect(JSON.parse(options.body)).toEqual({iconId:'circuit-01'});expect(options.headers.Authorization).toBe('Bearer opaque-local-proof');expect(options.redirect).toBe('error');expect(options.credentials).toBe('omit');
 });
 it('rejects unauthenticated, mismatched, anonymous, expired and guest identities before fetch',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);mocks.proof.mockReturnValue(null);
  const cases=[null,{user:{id:'bob'},access_token:'jwt'},{user:{id:'alice',is_anonymous:true},access_token:'jwt'},{user:{id:'alice'},access_token:'jwt',expires_at:1}];
  for(const session of cases){mocks.session.mockResolvedValue({data:{session},error:null});await expect(saveProfileAvatar('alice',{iconId:'circuit-01'},new AbortController().signal)).rejects.toThrow('AUTH_REQUIRED');}
  for(const id of ['GUEST-x','anonymous-x','cpu-x','ai:1'])await expect(saveProfileAvatar(id,{iconId:'circuit-01'},new AbortController().signal)).rejects.toThrow('AUTH_REQUIRED');
  expect(fetcher).not.toHaveBeenCalled();
 });
 it('accepts a matching non-anonymous Supabase session',async()=>{
  mocks.proof.mockReturnValue(null);mocks.session.mockResolvedValue({data:{session:{user:{id:'alice'},access_token:'valid.jwt.token',expires_at:Date.now()/1000+60}},error:null});
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({userId:'alice',avatarUrl:'/avatars/circuit-02.svg'})));vi.stubGlobal('fetch',fetcher);
  await saveProfileAvatar('alice',{iconId:'circuit-02'},new AbortController().signal);expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer valid.jwt.token');
 });
 it('rejects a different account or attacker URL acknowledgement',async()=>{
  for(const data of [{userId:'bob',avatarUrl:'/avatars/circuit-01.svg'},{userId:'alice',avatarUrl:'https://attacker.example/x'}]){
   vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify(data))));await expect(saveProfileAvatar('alice',{iconId:'circuit-01'},new AbortController().signal)).rejects.toThrow('UNAVAILABLE');
  }
 });
 it('returns sanitized auth/unavailable errors',async()=>{
  for(const [status,code]of [[401,'AUTH_REQUIRED'],[413,'TOO_LARGE'],[503,'UNAVAILABLE']]as const){vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('secret server failure',{status})));await expect(saveProfileAvatar('alice',{iconId:'circuit-01'},new AbortController().signal)).rejects.toThrow(code);}
 });
 it('honors cancellation before network and after an ignored response',async()=>{
  const aborted=new AbortController();aborted.abort();const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  await expect(saveProfileAvatar('alice',{iconId:'circuit-01'},aborted.signal)).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
  const pending=new AbortController();vi.stubGlobal('fetch',vi.fn(async()=>{pending.abort();return new Response(JSON.stringify({userId:'alice',avatarUrl:'/avatars/circuit-01.svg'}));}));
  await expect(saveProfileAvatar('alice',{iconId:'circuit-01'},pending.signal)).rejects.toThrow();
 });
 it('center-crops to 512 and releases decoded bitmap without uploading',async()=>{
  const close=vi.fn(),drawImage=vi.fn(),canvas={width:0,height:0,getContext:()=>({drawImage}),toBlob:(cb:(b:Blob)=>void)=>cb(new Blob(['safe'],{type:'image/webp'}))};
  vi.stubGlobal('createImageBitmap',vi.fn(async()=>({width:1000,height:500,close})));vi.stubGlobal('document',{createElement:()=>canvas});
  const file=new File(['data'],'photo.jpg',{type:'image/jpeg'});const output=await prepareAvatarPhoto(file,new AbortController().signal);
  expect(output.type).toBe('image/webp');expect(drawImage.mock.calls[0].slice(1)).toEqual([250,0,500,500,0,0,512,512]);expect(close).toHaveBeenCalledOnce();
 });
});
