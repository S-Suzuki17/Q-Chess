import {afterEach,describe,expect,it,vi} from 'vitest';
import express from 'express';
import type {Server} from 'node:http';
import {RankedAuth} from './RankedAuth';
import {AccountWriteGate} from './AccountDeletion';
import {createAccountRecoveryRouter} from './AccountRecoveryRoutes';
import {RecoveryChallenges,recoveryEmail,recoveryPassword,type RecoveryBinding,type RecoveryStore} from './AccountRecovery';
const servers:Server[]=[];
afterEach(async()=>{vi.useRealTimers();await Promise.all(servers.splice(0).map(server=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());})));});
async function fixture(enabled=true){
    const binding:RecoveryBinding={user_id:'Alice',email:'alice@example.test',auth_user_id:'00000000-0000-4000-8000-000000000001'};
    const store={
        ready:vi.fn(async()=>true),blocked:vi.fn(async(_id:string)=>false),verifyPassword:vi.fn(async(_id:string,password:string)=>password==='old-password'),
        binding:vi.fn(async(id:string):Promise<RecoveryBinding|null>=>id==='Alice'?binding:null),
        sendCode:vi.fn(async(_email:string,_create:boolean)=>{}),verifyCode:vi.fn(async(_email:string,code:string):Promise<string|null>=>code==='123456'?binding.auth_user_id:null),
        enroll:vi.fn(async(_id:string,_email:string,_authId:string)=>{}),reset:vi.fn(async(_binding:RecoveryBinding,_password:string)=>{}),
    } satisfies RecoveryStore;
    const auth=new RankedAuth(store.verifyPassword),gate=new AccountWriteGate(),busy=vi.fn(()=>false),disconnect=vi.fn();
    const alice=(await auth.issueLegacySession('Alice','old-password'))!,bob=(await auth.issueLegacySession('Bob','old-password'))!;
    const app=express();app.use(createAccountRecoveryRouter(auth,store,gate,busy,disconnect,enabled));
    const server=await new Promise<Server>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});servers.push(server);
    const address=server.address();if(!address||typeof address==='string')throw Error('No local address');
    const base='http://127.0.0.1:'+address.port;
    const post=(path:string,body:unknown,token?:string)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
    const start=async(userId='Alice',email='alice@example.test')=>(await (await post('/auth/recovery/start',{userId,email})).json()).ticket as string;
    return {store,auth,gate,busy,disconnect,base,alice,bob,post,start,binding};
}
describe('verified legacy account recovery',()=>{
    it('fails closed until both server feature and database are ready',async()=>{
        const f=await fixture(false);expect(await (await fetch(f.base+'/account/recovery/capabilities')).json()).toEqual({available:false});
        expect((await f.post('/auth/recovery/start',{userId:'Alice',email:'alice@example.test'})).status).toBe(503);expect(f.store.sendCode).not.toHaveBeenCalled();
    });
    it('requires an owner proof AND the current password for enrollment',async()=>{
        const f=await fixture();const body={userId:'Alice',email:'alice@example.test',password:'old-password'};
        for(const token of [undefined,'Alice','GUEST-Alice',f.bob.token])expect((await f.post('/account/recovery/start',body,token)).status).toBe(401);
        expect((await f.post('/account/recovery/start',{...body,password:'wrong'},f.alice.token)).status).toBe(401);
        expect(f.store.sendCode).not.toHaveBeenCalled();
        const response=await f.post('/account/recovery/start',body,f.alice.token);expect(response.status).toBe(202);expect(f.store.sendCode).toHaveBeenCalledWith(body.email,true);
        const {ticket}=await response.json();expect((await f.post('/account/recovery/complete',{ticket,code:'123456'},f.alice.token)).status).toBe(200);
        expect(f.store.enroll).toHaveBeenCalledWith('Alice',body.email,f.binding.auth_user_id);
    });
    it('does not recover unverified legacy emails or enumerate unknown addresses',async()=>{
        const f=await fixture();
        const ticket=await f.start('unknown','alice@example.test');expect(ticket).toMatch(/^[a-f0-9]{64}$/);expect(f.store.sendCode).not.toHaveBeenCalled();
        expect((await f.post('/auth/recovery/complete',{ticket,code:'123456',password:'new-password-123'})).status).toBe(400);
        expect(f.store.verifyCode).not.toHaveBeenCalled();expect(f.store.reset).not.toHaveBeenCalled();
    });
    it('verifies the email identity, changes only the bound account and invalidates previous proofs',async()=>{
        const f=await fixture(),ticket=await f.start();
        const response=await f.post('/auth/recovery/complete',{ticket,code:'123456',password:'new-password-123'});
        expect(response.status).toBe(200);expect(await response.json()).toEqual({completed:true});
        expect(f.store.reset).toHaveBeenCalledWith(f.binding,'new-password-123');expect(f.auth.verifySession(f.alice.token)).toBeNull();
        expect(f.auth.verifySession(f.bob.token)?.userId).toBe('Bob');expect(f.disconnect).toHaveBeenCalledWith('Alice');expect(f.gate.blocked('Alice')).toBe(false);
        expect((await f.post('/auth/recovery/complete',{ticket,code:'123456',password:'other-password'})).status).toBe(400);expect(f.store.reset).toHaveBeenCalledOnce();
    });
    it('rejects a verified but different Auth identity',async()=>{
        const f=await fixture(),ticket=await f.start();f.store.verifyCode.mockResolvedValue('different-auth-id');
        expect((await f.post('/auth/recovery/complete',{ticket,code:'123456',password:'new-password-123'})).status).toBe(400);expect(f.store.reset).not.toHaveBeenCalled();
    });
    it('blocks reset during a match, pending save, deletion or avatar write',async()=>{
        const f=await fixture(),ticket=await f.start();const body={ticket,code:'123456',password:'new-password-123'};
        f.busy.mockReturnValue(true);expect((await f.post('/auth/recovery/complete',body)).status).toBe(409);f.busy.mockReturnValue(false);
        const release=f.gate.enter('Alice')!;expect((await f.post('/auth/recovery/complete',body)).status).toBe(409);release();
        f.store.blocked.mockResolvedValue(true);expect((await f.post('/auth/recovery/complete',body)).status).toBe(409);expect(f.store.verifyCode).not.toHaveBeenCalled();
    });
    it('bounds wrong-code attempts and rejects wrong endpoint reuse',async()=>{
        const f=await fixture(),ticket=await f.start();
        for(let i=0;i<6;i++)expect((await f.post('/auth/recovery/complete',{ticket,code:'000000',password:'new-password-123'})).status).toBe(400);
        expect(f.store.verifyCode).toHaveBeenCalledTimes(5);expect(f.store.reset).not.toHaveBeenCalled();
        const another=await f.start();expect((await f.post('/account/recovery/complete',{ticket:another,code:'123456'},f.alice.token)).status).toBe(400);
    });
    it('rejects weak/oversized passwords before consuming an OTP',async()=>{
        const f=await fixture(),ticket=await f.start();
        for(const password of ['short','あ'.repeat(25),'a'.repeat(73)])expect((await f.post('/auth/recovery/complete',{ticket,code:'123456',password})).status).toBe(400);
        expect(f.store.verifyCode).not.toHaveBeenCalled();
    });
    it.each([true,false])('handles an uncertain password-write response without admitting an old login (%s)',async persisted=>{
        const f=await fixture(),ticket=await f.start();f.store.reset.mockRejectedValue(new Error('private upstream data'));
        f.store.verifyPassword.mockResolvedValue(persisted);
        const result=await f.post('/auth/recovery/complete',{ticket,code:'123456',password:'new-password-123'});
        expect(result.status).toBe(persisted?200:503);expect(f.gate.blocked('Alice')).toBe(!persisted);
        expect(f.auth.verifySession(f.alice.token)).toBeNull();expect(JSON.stringify(await result.json())).not.toContain('private upstream');
    });
    it('rejects oversized JSON, owner overrides and query injection',async()=>{
        const f=await fixture();
        expect((await f.post('/auth/recovery/start',{userId:'Alice',email:'alice@example.test',authId:'forged'})).status).toBe(400);
        expect((await f.post('/auth/recovery/start?token=forged',{userId:'Alice',email:'alice@example.test'})).status).toBe(400);
        expect((await f.post('/auth/recovery/start',{x:'x'.repeat(4000)})).status).toBe(400);expect(f.store.sendCode).not.toHaveBeenCalled();
    });
    it('serializes duplicate completion without releasing the first request lock',async()=>{
        const f=await fixture(),ticket=await f.start();let finish!:(id:string)=>void;
        f.store.verifyCode.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
        const body={ticket,code:'123456',password:'new-password-123'},first=f.post('/auth/recovery/complete',body);
        await vi.waitFor(()=>expect(f.store.verifyCode).toHaveBeenCalledOnce());
        expect((await f.post('/auth/recovery/complete',body)).status).toBe(429);
        expect((await f.post('/auth/recovery/complete',body)).status).toBe(429);expect(f.gate.blocked('Alice')).toBe(true);
        finish(f.binding.auth_user_id);expect((await first).status).toBe(200);expect(f.store.reset).toHaveBeenCalledOnce();
    });
    it('expires challenges and caps password checks already in flight after revocation',async()=>{
        vi.useFakeTimers();const tickets=new RecoveryChallenges(),ticket=tickets.create('reset','Alice','a@example.test',null);
        vi.advanceTimersByTime(600001);expect(()=>tickets.take(ticket)).toThrow('INVALID_CODE');
        let resolve!:(ok:boolean)=>void;const auth=new RankedAuth(()=>new Promise(done=>{resolve=done;}));
        const pending=auth.issueLegacySession('Alice','old-password');auth.revokeUserSessions('Alice');resolve(true);expect(await pending).toBeNull();
    });
    it('normalizes email and enforces bcrypt byte limits without trimming passwords',()=>{
        expect(recoveryEmail(' Alice@Example.test ')).toBe('alice@example.test');expect(recoveryEmail('a\r\nb@example.test')).toBeNull();
        expect(recoveryPassword('a'.repeat(72))).toBe(true);expect(recoveryPassword('あ'.repeat(24))).toBe(true);expect(recoveryPassword('あ'.repeat(25))).toBe(false);
    });
});
