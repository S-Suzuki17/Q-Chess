import { afterEach, describe, expect, it, vi } from 'vitest';
import { LegacySocketAuthority } from './LegacySocketAuthority';
import { DurableRankedAuth, type DurableSessionRpc } from './DurableRankedAuth';
import { createHash } from 'node:crypto';
const fence={incarnation:'8f030a96-5736-4b29-a6f8-ed588775f738',generation:'0'};
const token='ranked_'+'A'.repeat(43);
const deferred=<T>()=>{let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>resolve=r);return{resolve,promise};};
const fixture=()=>{
    const inspectLiveSessions=vi.fn(),owns=vi.fn().mockReturnValue(true),stopWaiting=vi.fn(),unavailable=vi.fn();
    const socket:any={id:'socket-1',connected:true,data:{userId:'Alice',legacy:true},handshake:{auth:{token}},emit:vi.fn(),disconnect:vi.fn()};
    const sockets=new Map([[socket.id,socket]]);
    const live=new LegacySocketAuthority({inspectLiveSessions} as any,{sockets:{sockets}} as any,owns,stopWaiting,unavailable);
    live.capture(socket,token,{userId:'Alice',expiresAt:Date.now()+1000,fence});
    return{live,socket,inspectLiveSessions,owns,stopWaiting,unavailable};
};
afterEach(()=>vi.restoreAllMocks());
describe('live legacy socket ownership',()=>{
    it.each(['expired','evidence_lost'])('closes new admission but preserves a current game for %s',async status=>{
        const f=fixture();f.inspectLiveSessions.mockResolvedValue([status]);await f.live.poll();
        expect(f.live.canAdmit(f.socket)).toBe(false);expect(f.stopWaiting).toHaveBeenCalledWith('Alice');
        expect(f.socket.disconnect).not.toHaveBeenCalled();expect(f.socket.emit).not.toHaveBeenCalled();
    });
    it('preserves a game on DB outage and stops the waiting queue',async()=>{
        const f=fixture();f.inspectLiveSessions.mockRejectedValue(Error('private-provider-error'));await f.live.poll();
        expect(f.socket.disconnect).not.toHaveBeenCalled();expect(f.stopWaiting).toHaveBeenCalledWith('Alice');
        expect(f.live.canAdmit(f.socket)).toBe(false);
        expect(f.unavailable).toHaveBeenCalledWith('Alice');
    });
    it('disconnects only a positively revoked current binding',async()=>{
        const f=fixture();f.inspectLiveSessions.mockResolvedValue(['revoked']);await f.live.poll();
        expect(f.socket.emit).toHaveBeenCalledWith('session_revoked',{reason:'revoked'});expect(f.socket.disconnect).toHaveBeenCalledWith(true);
    });
    it.each(['new-proof','token-changed','account-changed','socket-replaced','disconnected'])('ignores delayed revocation after %s',async change=>{
        const f=fixture(),pending=deferred<any>();f.inspectLiveSessions.mockReturnValue(pending.promise);const poll=f.live.poll();
        if(change==='new-proof')f.live.capture(f.socket,token,{userId:'Alice',expiresAt:Date.now()+2000,fence:{...fence,generation:'1'}});
        if(change==='token-changed')f.socket.handshake.auth.token='ranked_'+'B'.repeat(43);
        if(change==='account-changed')f.socket.data.userId='Bob';
        if(change==='socket-replaced')f.owns.mockReturnValue(false);
        if(change==='disconnected')f.socket.connected=false;
        pending.resolve(['revoked']);await poll;
        expect(f.socket.disconnect).not.toHaveBeenCalled();expect(f.socket.emit).not.toHaveBeenCalled();
    });
    it('still applies revocation when the same proof was reverified during a poll',async()=>{
        const f=fixture(),pending=deferred<any>();f.inspectLiveSessions.mockReturnValue(pending.promise);const poll=f.live.poll();
        f.live.capture(f.socket,token,{userId:'Alice',expiresAt:Date.now()+1000,fence});pending.resolve(['revoked']);await poll;
        expect(f.socket.disconnect).toHaveBeenCalledWith(true);
    });
    it('ignores an old outage response after the socket owner has changed',async()=>{
        const f=fixture();let reject!:(error:Error)=>void;
        f.inspectLiveSessions.mockReturnValue(new Promise((_,no)=>{reject=no;}));const poll=f.live.poll();
        f.owns.mockReturnValue(false);reject(Error('delayed provider outage'));await poll;
        expect(f.unavailable).not.toHaveBeenCalled();expect(f.stopWaiting).not.toHaveBeenCalled();
    });
    it('does not overlap sweeps or query an empty registry',async()=>{
        const f=fixture(),pending=deferred<any>();f.inspectLiveSessions.mockReturnValue(pending.promise);
        const first=f.live.poll();await f.live.poll();expect(f.inspectLiveSessions).toHaveBeenCalledTimes(1);
        pending.resolve(['valid']);await first;f.live.forget(f.socket);await f.live.poll();expect(f.inspectLiveSessions).toHaveBeenCalledTimes(1);
    });
    it('batches by 200 without sending token plaintext to SQL',async()=>{
        const rpc=vi.fn<DurableSessionRpc>().mockImplementation((_name,parameters)=>Promise.resolve({error:null,data:{serverNow:'2026-10-06T12:00:00Z',sessions:(parameters.p_sessions as any[]).map(()=>({status:'valid'}))}}));
        const auth=new DurableRankedAuth(rpc);
        expect(await auth.inspectLiveSessions([{token,userId:'Alice',fence}])).toEqual(['valid']);
        expect(rpc.mock.calls[0][1]).toEqual({p_sessions:[{tokenHash:createHash('sha256').update(token).digest('hex'),userId:'Alice',...fence}]});
        expect(JSON.stringify(rpc.mock.calls)).not.toContain(token);
        await expect(auth.inspectLiveSessions(Array.from({length:201},()=>({token,userId:'Alice',fence})))).rejects.toThrow('unavailable');
    });
    it.each([{sessions:[]},{sessions:[{status:'missing'}]},{sessions:[{status:'revoked',userId:'Alice'}]},{sessions:[{status:'revoked'}],extra:true}])('fails closed on a malformed batch result',async changed=>{
        const rpc=vi.fn<DurableSessionRpc>().mockResolvedValue({error:null,data:{serverNow:'2026-10-06T12:00:00Z',...changed}});
        await expect(new DurableRankedAuth(rpc).inspectLiveSessions([{token,userId:'Alice',fence}])).rejects.toThrow('unavailable');
    });
});
