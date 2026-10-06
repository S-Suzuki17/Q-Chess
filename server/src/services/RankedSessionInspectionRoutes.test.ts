import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { request, type Server } from 'node:http';
import { AccountWriteGate } from './AccountDeletion';
import { createRankedSessionInspectionRouter } from './RankedSessionInspectionRoutes';
const servers:Server[]=[];
const token='ranked_'+'a'.repeat(43),identity={userId:'Alice',expiresAt:Date.now()+60000};
const deferred=<T>()=>{let resolve!:(v:T)=>void;return {promise:new Promise<T>(r=>{resolve=r;}),resolve};};
afterEach(async()=>{await Promise.all(servers.splice(0).map(s=>new Promise<void>(r=>{s.closeAllConnections();s.close(()=>r());})));});
async function fixture(){
    const authority={verifySession:vi.fn(async(_token:unknown,_expected?:unknown)=>identity as typeof identity|null)};
    const deletion={blocked:vi.fn(async(_id:string)=>false)},gate=new AccountWriteGate();
    const app=express();app.use(createRankedSessionInspectionRouter(authority,deletion,gate));
    const server=await new Promise<Server>(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});servers.push(server);
    const address=server.address();if(!address||typeof address==='string')throw new Error('Missing local address');
    const url=`http://127.0.0.1:${address.port}/auth/ranked-session/status`;
    const send=(headers:Record<string,string>={Authorization:`Bearer ${token}`},suffix='')=>fetch(url+suffix,{headers});
    return {authority,deletion,gate,url,send};
}
describe('legacy session status HTTP boundary',()=>{
    it('returns only verified identity/expiry/server time with no-store headers',async()=>{
        const f=await fixture();const res=await f.send();expect(res.status).toBe(200);
        expect(await res.json()).toEqual({...identity,serverNow:expect.any(Number)});expect(res.headers.get('cache-control')).toBe('no-store');
        expect(res.headers.get('vary')).toBe('Authorization');expect(f.authority.verifySession.mock.calls).toEqual([[token],[token,'Alice']]);
    });
    it('waits for verification instead of treating a Promise as authentication',async()=>{
        const f=await fixture(),check=deferred<typeof identity|null>();f.authority.verifySession.mockReturnValueOnce(check.promise);
        let done=false;const pending=f.send().then(r=>{done=true;return r;});await new Promise(r=>setTimeout(r,15));
        expect(done).toBe(false);expect(f.deletion.blocked).not.toHaveBeenCalled();check.resolve(null);expect((await pending).status).toBe(401);
    });
    it.each(['initial','recheck','deletion'] as const)('sanitizes rejected %s lookup as retryable unavailable',async which=>{
        const f=await fixture();
        if(which==='initial')f.authority.verifySession.mockRejectedValueOnce(new Error('private-token-password'));
        if(which==='recheck')f.authority.verifySession.mockResolvedValueOnce(identity).mockRejectedValueOnce(new Error('private-token-password'));
        if(which==='deletion')f.deletion.blocked.mockRejectedValueOnce(new Error('private-token-password'));
        const res=await f.send();expect(res.status).toBe(503);expect(await res.json()).toEqual({code:'UNAVAILABLE'});expect(res.headers.get('retry-after')).toBe('5');
        expect(()=>f.gate.reserve('Alice',false)).not.toThrow();f.gate.release('Alice');
    });
    it('rejects absent/malformed/duplicate headers and OAuth without an OAuth fallback',async()=>{
        const f=await fixture();for(const value of ['', 'Alice', 'Bearer jwt.value.here', `bearer ${token}`,`Bearer ${token}, Bearer ${token}`])expect((await f.send(value?{Authorization:value}:{})).status).toBe(401);
        const duplicate=await new Promise<number>(resolve=>{const req=request(f.url,{headers:['Host',new URL(f.url).host,'Authorization',`Bearer ${token}`,'Authorization',`Bearer ${token}`]},res=>{res.resume();resolve(res.statusCode!);});req.end();});
        expect(duplicate).toBe(401);expect(f.authority.verifySession).not.toHaveBeenCalled();
    });
    it('rejects query, method and body overrides before verification',async()=>{
        const f=await fixture();expect((await f.send(undefined,'?token='+token)).status).toBe(400);
        expect((await fetch(f.url,{method:'POST',headers:{Authorization:`Bearer ${token}`}})).status).toBe(405);
        const body=await new Promise<number>(resolve=>{const req=request(f.url,{method:'GET',headers:{Authorization:`Bearer ${token}`,'Content-Length':'2','Content-Type':'application/json'}},res=>{res.resume();resolve(res.statusCode!);});req.end('{}');});
        expect(body).toBe(400);expect(f.authority.verifySession).not.toHaveBeenCalled();
    });
    it('rejects deletion before/during verification and a revoked recheck',async()=>{
        const f=await fixture();f.gate.reserve('Alice',false);expect((await f.send()).status).toBe(401);f.gate.release('Alice');
        f.deletion.blocked.mockResolvedValueOnce(true);expect((await f.send()).status).toBe(401);
        f.authority.verifySession.mockResolvedValueOnce(identity).mockResolvedValueOnce(null);expect((await f.send()).status).toBe(401);

    });
    it('rechecks identity after a delayed deletion lookup and releases its lease',async()=>{
        const f=await fixture(),blocked=deferred<boolean>();f.deletion.blocked.mockReturnValueOnce(blocked.promise);
        const pending=f.send();while(!f.deletion.blocked.mock.calls.length)await new Promise(r=>setTimeout(r,1));
        expect(()=>f.gate.reserve('Alice',false)).toThrow('ACCOUNT_BUSY');f.authority.verifySession.mockResolvedValue(null);blocked.resolve(false);
        expect((await pending).status).toBe(401);expect(()=>f.gate.reserve('Alice',false)).not.toThrow();
    });
    it('does not conflate game restrictions with identity; malformed or expired identities fail closed',async()=>{
        const f=await fixture();expect((await f.send()).status).toBe(200);
        for(const value of [{...identity,userId:'GUEST-1'},{...identity,expiresAt:NaN},{...identity,expiresAt:Date.now()-1}]){
            f.authority.verifySession.mockResolvedValue(value);expect((await f.send()).status).toBe(401);
        }
    });
});
