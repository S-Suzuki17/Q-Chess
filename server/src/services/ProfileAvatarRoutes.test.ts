import {afterEach,describe,it,expect,vi} from 'vitest';
import express from 'express';
import type {Server} from 'node:http';
import sharp from 'sharp';
import {RankedAuth} from './RankedAuth';
import {createProfileAvatarRouter} from './ProfileAvatarRoutes';
const servers:Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(s=>new Promise<void>(resolve=>{s.closeAllConnections();s.close(()=>resolve());})));});
async function fixture(options:{ttl?:number;verify?:()=>Promise<string|null>}={}) {
 const auth=new RankedAuth(async()=>true,{sessionTtlMs:options.ttl??60000});
 const store={verifyUser:vi.fn(options.verify??(async()=>null)),setIcon:vi.fn(async(_id:string,icon:string)=>'/avatars/'+icon+'.svg'),setPhoto:vi.fn(async()=> 'https://project.supabase.co/storage/v1/object/public/avatars/photo.webp')};
 const app=express();app.use(createProfileAvatarRouter(auth,store));
 const server=await new Promise<Server>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});servers.push(server);
 const address=server.address();if(!address||typeof address==='string')throw new Error('No address');
 const base='http://127.0.0.1:'+address.port;
 const session=await auth.issueLegacySession('alice','fixture-only');
 const send=(path:string,token:string|null=session?.token??null,body:BodyInit=JSON.stringify({iconId:'circuit-01'}),type='application/json')=>fetch(base+path,{method:'POST',headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':type},body});
 return{auth,store,send};
}
describe('avatar write boundaries',()=>{
 it('requires real authentication before parsing or storing untrusted bodies',async()=>{
  const f=await fixture();
  for(const token of [null,'fake-proof'])expect((await f.send('/profile/avatar/icon',token,'{broken')).status).toBe(401);
  expect(f.store.setIcon).not.toHaveBeenCalled();expect(f.store.setPhoto).not.toHaveBeenCalled();
 });
 it('derives the only owner from verified legacy proof',async()=>{
  const f=await fixture(),response=await f.send('/profile/avatar/icon');
  expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({userId:'alice',avatarUrl:'/avatars/circuit-01.svg'});
  expect(f.store.setIcon).toHaveBeenCalledWith('alice','circuit-01');
 });
 it('uses verified Supabase JWT identity, and rejects guest identities',async()=>{
  const f=await fixture({verify:async()=> 'oauth-user'});
  expect((await f.send('/profile/avatar/icon','valid.jwt.token')).status).toBe(200);
  expect(f.store.setIcon).toHaveBeenCalledWith('oauth-user','circuit-01');
  f.store.verifyUser.mockResolvedValue('GUEST-forged');
  expect((await f.send('/profile/avatar/icon','valid.jwt.token')).status).toBe(401);
 });
 it('rejects expired proof and failed upstream auth without leaking details',async()=>{
  const f=await fixture({ttl:1,verify:async()=>{throw new Error('sensitive upstream token');}});
  await new Promise(r=>setTimeout(r,5));
  expect((await f.send('/profile/avatar/icon')).status).toBe(401);
  const response=await f.send('/profile/avatar/icon','valid.jwt.token');expect(response.status).toBe(401);expect(await response.text()).not.toContain('sensitive');
 });
 it('rejects owner overrides, arbitrary URLs, unknown IDs and query identity',async()=>{
  const f=await fixture();
  for(const body of [{iconId:'circuit-01',userId:'bob'},{avatarUrl:'https://evil.example'},{iconId:'circuit-16'}])expect((await f.send('/profile/avatar/icon',undefined,JSON.stringify(body))).status).toBe(400);
  expect((await f.send('/profile/avatar/icon?userId=bob')).status).toBe(400);expect(f.store.setIcon).not.toHaveBeenCalled();
 });
 it('never stores original bytes and returns only after photo update succeeds',async()=>{
  const f=await fixture(),input=await sharp({create:{width:18,height:12,channels:3,background:'#dfab85'}}).withMetadata().png().toBuffer();
  const response=await f.send('/profile/avatar/photo',undefined,new Uint8Array(input),'image/png');
  expect(response.status).toBe(200);expect(f.store.setPhoto).toHaveBeenCalledOnce();
  const [owner,bytes]=f.store.setPhoto.mock.calls[0]as unknown as[string,Buffer];
  expect(owner).toBe('alice');expect(bytes.equals(input)).toBe(false);
  const info=await sharp(bytes).metadata();expect(info.format).toBe('webp');expect(info.width).toBe(512);expect(info.exif).toBeUndefined();
 });
 it('fails closed on invalid photo or storage failure',async()=>{
  const f=await fixture();expect((await f.send('/profile/avatar/photo',undefined,'<svg/>','image/svg+xml')).status).toBe(415);
  expect((await f.send('/profile/avatar/photo',undefined,'not-png','image/png')).status).toBe(400);expect(f.store.setPhoto).not.toHaveBeenCalled();
  f.store.setIcon.mockRejectedValue(new Error('service-role-secret'));
  const response=await f.send('/profile/avatar/icon');expect(response.status).toBe(503);expect(await response.text()).not.toContain('secret');
 });
 it('bounds request size and per-owner writes',async()=>{
  const f=await fixture();expect((await f.send('/profile/avatar/icon',undefined,'x'.repeat(2048))).status).toBe(413);
  for(let n=0;n<5;n++)expect((await f.send('/profile/avatar/icon')).status).toBe(200);
  expect((await f.send('/profile/avatar/icon')).status).toBe(429);
 });
});
