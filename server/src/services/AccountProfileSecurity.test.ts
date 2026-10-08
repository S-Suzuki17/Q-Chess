import express from 'express';
import http from 'node:http';
import type {AddressInfo} from 'node:net';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {RankedAuth} from './RankedAuth';
import {AccountWriteGate} from './AccountDeletion';
import {createAccountSecurityRouter} from './AccountSecurityRoutes';
import {validRegistration,verifiedTokenSessionId,type AccountSecurityStore} from './AccountSecurity';
import {permittedAccountName} from './AccountNamePolicy';
let server:http.Server,base:string,auth:RankedAuth,gate:AccountWriteGate,token:string;
let store:{[K in keyof AccountSecurityStore]:ReturnType<typeof vi.fn>};
const disconnected=vi.fn();
const options=(token:string,body:unknown={})=>({method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
beforeEach(async()=>{
    vi.clearAllMocks();store={ready:vi.fn().mockResolvedValue(true),verifyUser:vi.fn().mockResolvedValue(null),restricted:vi.fn().mockResolvedValue(false),register:vi.fn().mockResolvedValue(true),signOutAll:vi.fn().mockResolvedValue(undefined)};
    auth=new RankedAuth(async()=>true);gate=new AccountWriteGate();token=(await auth.issueLegacySession('Alice','password'))!.token;
    const app=express();app.use(createAccountSecurityRouter(auth,store,gate,disconnected));app.get('/account/fixture',(_req,res)=>res.json({ok:true}));
    server=http.createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));vi.restoreAllMocks();});
it('requires strong bounded registration without rejecting international passwords',()=>{
    expect(validRegistration('Alice123','正しい horse battery 91')).toBe(true);
    for(const [id,pw] of [['Alice','short'],['a','correct-horse-123'],['Admin','correct-horse-123'],['GuestX','password123456'],['Alice','a'.repeat(73)],['Alice','𐀀'.repeat(20)],['Alice','abcdefghijkl\n']])expect(validRegistration(id,pw)).toBe(false);
});
it('normalizes impersonation checks without substring-blocking ordinary international names',()=>{
    for(const name of ['Q-Gambit','ｑｕｂｅ','QGambitOfficial','Admin','運営','shit'])expect(permittedAccountName(name)).toBe(false);
    for(const name of ['Shital','Adminson','太郎','தமிழ்','Élodie'])expect(permittedAccountName(name)).toBe(true);
});
it('sends only validated registration fields to storage and bounds attempts',async()=>{
    for(const bad of [{username:'Alice',password:'short'},{username:'Alice',password:'correct-horse-123',rating:9999}])expect((await fetch(base+'/auth/register',options('',bad))).status).toBe(400);
    const data={username:'Alice123',password:'correct-horse-123'};
    expect((await fetch(base+'/auth/register',options('',data))).status).toBe(201);expect(store.register).toHaveBeenCalledWith(data.username,data.password);
    for(let i=0;i<4;i++)await fetch(base+'/auth/register',options('',data));
    const blocked=await fetch(base+'/auth/register',options('',data));expect(blocked.status).toBe(429);expect(blocked.headers.get('retry-after')).toBe('3600');
    expect(store.register).toHaveBeenCalledTimes(5);
});
it('does not expose upstream errors or claim failed registration succeeded',async()=>{
    store.register.mockRejectedValue(new Error('secret password detail'));
    const response=await fetch(base+'/auth/register',options('',{username:'Alice123',password:'correct-horse-123'}));
    expect(response.status).toBe(503);expect(await response.text()).not.toContain('secret');
});
it('rejects forged tokens and another account selector before revocation',async()=>{
    for(const forged of ['','Alice','GUEST-Alice','bad.jwt.token'])expect((await fetch(base+'/account/sessions/revoke-all',options(forged))).status).toBe(401);
    expect((await fetch(base+'/account/sessions/revoke-all',options(token,{userId:'Bob'}))).status).toBe(400);
    expect((await auth.verifySession(token))?.userId).toBe('Alice');expect(disconnected).not.toHaveBeenCalled();
});
it('revokes every legacy proof of self but not other accounts and clears the gate',async()=>{
    const second=(await auth.issueLegacySession('Alice','password'))!.token,bob=(await auth.issueLegacySession('Bob','password'))!.token;
    const response=await fetch(base+'/account/sessions/revoke-all',options(token));expect(await response.json()).toEqual({userId:'Alice',revoked:true});
    expect(await auth.verifySession(token)).toBeNull();expect(await auth.verifySession(second)).toBeNull();expect((await auth.verifySession(bob))?.userId).toBe('Bob');
    expect(store.signOutAll).not.toHaveBeenCalled();expect(disconnected).toHaveBeenCalledExactlyOnceWith('Alice');expect(gate.blocked('Alice')).toBe(false);
});
it('revokes OAuth refresh sessions through the admin SDK with the verified bearer',async()=>{
    store.verifyUser.mockResolvedValue('OAuth');
    expect((await fetch(base+'/account/sessions/revoke-all',options('valid.jwt.token'))).status).toBe(200);
    expect(store.signOutAll).toHaveBeenCalledExactlyOnceWith('valid.jwt.token');expect(disconnected).toHaveBeenCalledWith('OAuth');
});
it('does not claim global signout if Auth is unavailable and does not steal an existing write lease',async()=>{
    const release=gate.enter('Alice')!;expect((await fetch(base+'/account/sessions/revoke-all',options(token))).status).toBe(409);release();
    expect(await auth.verifySession(token)).not.toBeNull();store.verifyUser.mockResolvedValue('OAuth');store.signOutAll.mockRejectedValue(new Error('secret'));
    const response=await fetch(base+'/account/sessions/revoke-all',options('valid.jwt.token'));expect(response.status).toBe(503);expect(await response.text()).not.toContain('secret');expect(gate.blocked('OAuth')).toBe(false);
});
it('refuses oversized/malformed bodies and direct account operations while restricted',async()=>{
    expect((await fetch(base+'/auth/register',options('',{username:'Alice',password:'x'.repeat(3000)}))).status).toBe(413);
    store.restricted.mockResolvedValue(true);
    expect((await fetch(base+'/account/fixture',{headers:{Authorization:`Bearer ${token}`}})).status).toBe(403);
    // Self logout is deliberately still allowed.
    expect((await fetch(base+'/account/sessions/revoke-all',options(token))).status).toBe(200);
});
it('decodes session IDs only for the independently verified subject',()=>{
    const token=`a.${Buffer.from(JSON.stringify({sub:'Alice',session_id:'00000000-0000-4000-8000-000000000001'})).toString('base64url')}.c`;
    expect(verifiedTokenSessionId(token,'Alice')).not.toBeNull();expect(verifiedTokenSessionId(token,'Bob')).toBeNull();expect(verifiedTokenSessionId('a.b.c','Alice')).toBeNull();
});

it.each([1, 2])('does not report global signout before revocation %s settles or if it rejects', async blockedCall => {
    let reject!: (error: Error) => void;
    const revoke = vi.spyOn(auth, 'revokeUserSessions');
    if (blockedCall === 2) revoke.mockResolvedValueOnce(1);
    revoke.mockImplementationOnce(() => new Promise((_resolve, no) => { reject = no; }));
    let settled = false;
    const pending = fetch(base + '/account/sessions/revoke-all', options(token)).then(response => { settled = true; return response; });
    await vi.waitFor(() => expect(revoke).toHaveBeenCalledTimes(blockedCall));
    expect(settled).toBe(false); expect(gate.blocked('Alice')).toBe(true); expect(disconnected).not.toHaveBeenCalled();
    reject(new Error('private-password-and-token'));
    const response = await pending;
    expect(response.status).toBe(503); expect(await response.text()).not.toContain('private-password-and-token');
    expect(disconnected).not.toHaveBeenCalled(); expect(gate.blocked('Alice')).toBe(false);
});

it('validates and normalizes email registration without breaking legacy two-field clients',async()=>{
 const data={username:'EmailUser',password:'correct-horse-123',email:' Alice@Example.Test '};
 expect((await fetch(base+'/auth/register',options('',data))).status).toBe(201);
 expect(store.register).toHaveBeenCalledExactlyOnceWith('EmailUser','correct-horse-123','alice@example.test');
 for(const email of ['',null,'bad','x@y','x\n@y.test','x'.repeat(255)+'@example.test']){
  expect((await fetch(base+'/auth/register',options('',{...data,email}))).status).toBe(400);
 }
 expect((await fetch(base+'/auth/register',options('',{...data,role:'admin'}))).status).toBe(400);
 expect(store.register).toHaveBeenCalledOnce();
});

it('uses the email RPC only for new registration and fails closed on missing deployment schema',async()=>{
 const {createAccountSecurityStore}=await import('./AccountSecurity');
 const result=vi.fn().mockResolvedValue({data:true,error:null});
 const rpc=vi.fn(()=>({abortSignal:result}));
 const persistence=createAccountSecurityStore({rpc} as any,async()=>null);
 expect(await persistence.register('Alice123','correct-horse-123',' Alice@Example.Test ')).toBe(true);
 expect(rpc).toHaveBeenLastCalledWith('register_account_with_email',{p_id:'Alice123',p_password:'correct-horse-123',p_email:'alice@example.test'});
 expect(await persistence.register('Legacy123','correct-horse-123')).toBe(true);
 expect(rpc).toHaveBeenLastCalledWith('register_account_secure',{p_id:'Legacy123',p_password:'correct-horse-123'});
 result.mockResolvedValue({data:null,error:{message:'missing function private schema detail'}});
 await expect(persistence.register('Alice123','correct-horse-123','alice@example.test')).rejects.toThrow('UNAVAILABLE');
});
