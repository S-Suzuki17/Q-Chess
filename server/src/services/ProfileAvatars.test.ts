import {describe,it,expect,vi} from 'vitest';
import sharp from 'sharp';
import {normalizeAvatarPhoto,avatarOwnerPath,knownCircuitIcon,createProfileAvatarStore,AVATAR_MAX_BYTES} from './ProfileAvatars';
describe('safe avatar rasters',()=>{
 it.each(['png','jpeg','webp']as const)('decodes %s, crops to 512 WebP and strips metadata',async format=>{
  const input=await sharp({create:{width:32,height:16,channels:3,background:'#be9972'}}).withMetadata({orientation:6}).toFormat(format).toBuffer();
  const output=await normalizeAvatarPhoto(input,'image/'+format),info=await sharp(output).metadata();
  expect(info.format).toBe('webp');expect(info.width).toBe(512);expect(info.height).toBe(512);expect(info.exif).toBeUndefined();expect(info.xmp).toBeUndefined();expect(info.orientation).toBeUndefined();
 });
 it('rejects SVG, mismatched MIME, truncated raster and dimensions over cap',async()=>{
  const valid=await sharp({create:{width:8,height:8,channels:3,background:'#fff'}}).png().toBuffer();
  for(const [bytes,type]of [[Buffer.from('<svg/>'),'image/svg+xml'],[valid,'image/jpeg'],[valid.subarray(0,24),'image/png'],[Buffer.alloc(AVATAR_MAX_BYTES+1),'image/png']]as const)await expect(normalizeAvatarPhoto(bytes,type)).rejects.toThrow();
  const wide=await sharp({create:{width:4097,height:1,channels:3,background:'#fff'}}).png().toBuffer();await expect(normalizeAvatarPhoto(wide,'image/png')).rejects.toThrow();
 });
 it('requires exact known IDs and non-traversable owner namespaces',()=>{
  expect(knownCircuitIcon('circuit-01')).toBe(true);expect(knownCircuitIcon('circuit-15')).toBe(true);
  for(const id of ['circuit-00','circuit-16','circuit-1','../circuit-01','/avatars/circuit-01.svg'])expect(knownCircuitIcon(id)).toBe(false);
  expect(avatarOwnerPath('../bob')).toMatch(/^u\/[a-f0-9]{64}$/);expect(avatarOwnerPath('alice')).not.toBe(avatarOwnerPath('bob'));
 });
 it('updates only owner avatar_url, does not delete old files or accept arbitrary URL',async()=>{
  const updates:any[]=[],where:any[]=[],uploaded:any[]=[];
  const chain:any={update:(v:any)=>{updates.push(v);return chain;},eq:(...v:any[])=>{where.push(v);return chain;},select:()=>chain,abortSignal:()=>chain,single:async()=>({data:{id:'alice',avatar_url:updates.at(-1).avatar_url},error:null})};
  const bucket={upload:vi.fn(async(...args:any[])=>{uploaded.push(args);return{error:null};}),getPublicUrl:(p:string)=>({data:{publicUrl:'https://project.supabase.co/storage/v1/object/public/avatars/'+p}})};
  const client:any={from:vi.fn(()=>chain),storage:{from:vi.fn(()=>bucket)}};const store=createProfileAvatarStore(client,async()=>null);
  expect(await store.setIcon('alice','circuit-03')).toBe('/avatars/circuit-03.svg');expect(updates[0]).toEqual({avatar_url:'/avatars/circuit-03.svg'});expect(where[0]).toEqual(['id','alice']);
  await expect(store.setIcon('alice','https://attacker.example')).rejects.toThrow();expect(updates).toHaveLength(1);
  await store.setPhoto('alice',Buffer.from('already-normalized-webp'));expect(uploaded[0][0]).toMatch(new RegExp('^'+avatarOwnerPath('alice')+'/[a-f0-9-]{36}\\.webp$'));expect(uploaded[0][2]).toEqual({contentType:'image/webp',cacheControl:'3600',upsert:false});expect(where[1]).toEqual(['id','alice']);
 });
});
