import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const h=vi.hoisted(()=>({slots:[] as any[],cursor:0,cleanups:[] as (()=>void)[],listeners:new Map<string,(data:any)=>void>(),emit:vi.fn()}));
vi.mock('react',()=>({
    useRef:(value:unknown)=>{const i=h.cursor++;return h.slots[i]??={current:value};},
    useState:(value:unknown)=>{const i=h.cursor++;if(!(i in h.slots))h.slots[i]=value;return [h.slots[i],(next:unknown)=>{h.slots[i]=next;}];},
    useCallback:(fn:unknown,deps:unknown[])=>{const i=h.cursor++,old=h.slots[i];if(!old||deps.some((d,j)=>d!==old.deps[j]))h.slots[i]={fn,deps};return h.slots[i].fn;},
    useEffect:(effect:()=>void|(()=>void),deps:unknown[])=>{
        const i=h.cursor++,old=h.slots[i];
        if(!old||deps.some((d,j)=>d!==old.deps[j])){old?.cleanup?.();const cleanup=effect();h.slots[i]={deps,cleanup};if(cleanup)h.cleanups.push(cleanup);}
    },
}));
vi.mock('../lib/SocketContext',()=>{
    const socket={emit:h.emit,on:(event:string,fn:(data:any)=>void)=>h.listeners.set(event,fn),off:(event:string)=>h.listeners.delete(event)};
    return {useSocket:()=>({socket,isConnected:true,isAuthenticated:true,connectionError:null})};
});
import { useMatchmaking } from './useMatchmaking';
import type { User } from '../types/game';
const user={id:'human',name:'Player'} as User;
const render=()=>{h.cursor=0;return useMatchmaking(user);};
beforeEach(()=>{h.slots=[];h.cursor=0;h.cleanups=[];h.listeners.clear();h.emit.mockReset();vi.useFakeTimers();});
afterEach(()=>{h.cleanups.forEach(fn=>fn());vi.useRealTimers();});

it('defers admission until the board has installed listeners, avoiding a lost immediate limit response',()=>{
    expect(render().startMatchmaking(600,'ranked')).toBe(true);
    h.listeners.get('match_found')!({matchId:'m1',hostId:'human',joinerId:'cpu',timeControl:600,mode:'ranked'});
    expect(render().matchedRoom?.id).toBe('m1');
    expect(render().isSearching).toBe(false);
    expect(h.emit.mock.calls.map(call=>call[0])).toEqual(['join_queue']);
});

it('keeps the specific queue failure reason and stops the search timer',()=>{
    render().startMatchmaking(600,'ranked');
    h.listeners.get('queue_error')!({reason:'INSUFFICIENT_FUNDS'});
    expect(render().error).toBe('INSUFFICIENT_FUNDS');
    expect(render().isSearching).toBe(false);
    expect(render().matchedRoom).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
});
