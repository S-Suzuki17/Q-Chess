import express from 'express';
import http from 'node:http';
import type {AddressInfo} from 'node:net';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {createGoogleAccountRouter} from './GoogleAccountRoutes';
import {AccountWriteGate} from './AccountDeletion';
import {CURRENT_TICKET_TERMS_VERSION} from './AccountCurrentTerms';
import type {GoogleAccountStore} from './GoogleAccounts';
describe('Google setup and sensitive action HTTP boundaries',()=>{
 let server:http.Server,base:string,clock:number,enabled:boolean;
 let store:{[K in keyof GoogleAccountStore]:ReturnType<typeof vi.fn>},admission:ReturnType<typeof vi.fn>;
 const authId='11111111-1111-4111-8111-111111111111',token='header.payload.signature';
 const account={authId,userId:'Alice',username:'Alice',name:'Alice'};
 const setup={username:'Alice',password:'SyntheticPassword123',accepted:true,termsVersion:CURRENT_TICKET_TERMS_VERSION};
 const post=(path:string,body:unknown={},proof?:string,bearer=token)=>fetch(base+path,{method:'POST',
  headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json',...(proof?{'X-QG-Confirmation':proof}:{})},body:JSON.stringify(body)});
 beforeEach(async()=>{
  clock=1000000;enabled=true;admission=vi.fn().mockResolvedValue(null);
  store={verify:vi.fn().mockImplementation(async value=>value===token?{authId,authenticatedAt:clock}:null),
   read:vi.fn().mockResolvedValue(null),setup:vi.fn().mockResolvedValue(account),password:vi.fn().mockResolvedValue(true),
   changePassword:vi.fn().mockResolvedValue(true)};
  const app=express();app.use(createGoogleAccountRouter(store,new AccountWriteGate(),{admission} as never,()=>enabled,()=>clock));
  app.post(['/auth/register','/auth/ranked-session','/auth/ranked-session/revoke','/account/deletion','/account/deletion/complete','/account/sessions/revoke-all'],(_req,res)=>res.json({reached:true}));
  server=http.createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 });
 afterEach(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});
 it('requires Google before reading an account, keeps incomplete setup separate',async()=>{
  expect((await fetch(base+'/auth/google/account')).status).toBe(401);
  const response=await fetch(base+'/auth/google/account',{headers:{Authorization:'Bearer '+token}});
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toEqual({authId,account:null,termsVersion:CURRENT_TICKET_TERMS_VERSION});
 });
 it('requires explicit current consent and valid setup, sends only a hash to storage',async()=>{
  for(const body of [{...setup,accepted:false},{...setup,termsVersion:'old'},{...setup,userId:'victim'},{...setup,password:'short'}])
   expect((await post('/auth/google/setup',body)).status).toBe(400);
  expect(store.setup).not.toHaveBeenCalled();
  expect((await post('/auth/google/setup',setup)).status).toBe(200);
  expect(store.setup).toHaveBeenCalledWith({authId,authenticatedAt:clock},'Alice',expect.stringMatching(/^scrypt-v1:/),CURRENT_TICKET_TERMS_VERSION,undefined);
  expect(store.setup.mock.calls[0][2]).not.toContain(setup.password);
 });
 it('rechecks revocation and maintenance after hashing before setup',async()=>{
  store.verify.mockResolvedValueOnce({authId,authenticatedAt:clock}).mockResolvedValue(null);
  expect((await post('/auth/google/setup',setup)).status).toBe(401);expect(store.setup).not.toHaveBeenCalled();
  store.verify.mockResolvedValue({authId,authenticatedAt:clock});
  admission.mockResolvedValueOnce(null).mockResolvedValue('MAINTENANCE');
  expect((await post('/auth/google/setup',setup)).status).toBe(503);expect(store.setup).not.toHaveBeenCalled();
 });
 it('retires password sign-in/registration without blocking session revocation',async()=>{
  for(const path of ['/auth/register','/auth/register/','/AUTH/RANKED-SESSION'])expect((await post(path)).status).toBe(409);
  expect((await post('/auth/ranked-session/revoke')).status).toBe(200);
  enabled=false;expect((await post('/auth/register')).status).toBe(200);
 });
 it('requires a password proof even with trailing slashes or changed case',async()=>{
  for(const path of ['/account/deletion','/account/deletion/','/ACCOUNT/SESSIONS/REVOKE-ALL/'])
   expect((await post(path)).status).toBe(403);
  expect((await post('/account/deletion/complete')).status).toBe(200);
 });
 it('binds single-use confirmation to action, exact session, and expiry',async()=>{
  const confirmation=await (await post('/auth/google/confirm-password',{password:'right',action:'delete'})).json();
  expect((await post('/account/sessions/revoke-all',{},confirmation.proof)).status).toBe(403);
  store.verify.mockResolvedValue({authId,authenticatedAt:clock});
  expect((await post('/account/deletion',{},confirmation.proof,'new.session.token')).status).toBe(403);
  expect((await post('/account/deletion/',{},confirmation.proof)).status).toBe(200);
  expect((await post('/account/deletion',{},confirmation.proof)).status).toBe(403);
  const expired=await (await post('/auth/google/confirm-password',{password:'right',action:'delete'})).json();
  clock+=120001;expect((await post('/account/deletion',{},expired.proof)).status).toBe(403);
 });
 it('requires recent Google OAuth to reset and invalidates existing confirmations',async()=>{
  store.verify.mockResolvedValue({authId,authenticatedAt:clock-300001});
  expect((await post('/auth/google/password',{password:setup.password})).status).toBe(401);
  expect(store.changePassword).not.toHaveBeenCalled();
  store.verify.mockResolvedValue({authId,authenticatedAt:clock});
  const proof=await (await post('/auth/google/confirm-password',{password:'right',action:'delete'})).json();
  expect((await post('/auth/google/password',{password:setup.password})).status).toBe(200);
  expect((await post('/account/deletion',{},proof.proof)).status).toBe(403);
 });
 it('throttles password guessing by verified account and rejects wrong passwords',async()=>{
  store.password.mockResolvedValue(false);
  for(let i=0;i<5;i++)expect((await post('/auth/google/confirm-password',{password:'wrong',action:'delete'})).status).toBe(403);
  expect((await post('/auth/google/confirm-password',{password:'wrong',action:'delete'})).status).toBe(429);
  expect(store.password).toHaveBeenCalledTimes(5);
 });
});
