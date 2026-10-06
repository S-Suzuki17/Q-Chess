import { beforeEach, expect, it, vi } from 'vitest';
// Minimal hook harness for deterministic worker replies and effect cleanup.
const hooks=vi.hoisted(()=>({slots:[] as unknown[],cursor:0,stateWrites:0,cleanups:[] as (()=>void)[]}));
vi.mock('react',()=>({
    useRef:(value:unknown)=>{const i=hooks.cursor++; return hooks.slots[i] ??= {current:value};},
    useState:(value:unknown)=>{const i=hooks.cursor++; if (!(i in hooks.slots)) hooks.slots[i]=value; return [hooks.slots[i],(next:unknown)=>{hooks.stateWrites++;hooks.slots[i]=next;}];},
    useEffect:(effect:()=>()=>void,deps:unknown[])=>{
        const i=hooks.cursor++, previous=hooks.slots[i] as {deps:unknown[];cleanup:()=>void}|undefined;
        if (!previous || deps.some((value,j)=>value!==previous.deps[j])) {
            previous?.cleanup(); const cleanup=effect(); hooks.slots[i]={deps,cleanup}; hooks.cleanups.push(cleanup);
        }
    },
}));
import { useMoveHint } from './useMoveHint';
const move={fromRow:6,fromCol:4,toRow:4,toCol:4};
// React is mocked above; this driver explicitly advances the deterministic hook slots.
// eslint-disable-next-line react-hooks/rules-of-hooks
const renderHook=(key='white:0')=>{hooks.cursor=0;return useMoveHint(key);};
beforeEach(()=>{hooks.cleanups.forEach(cleanup=>cleanup());hooks.slots=[];hooks.cleanups=[];hooks.stateWrites=0;});

it('stores both endpoints on a successful search',async()=>{
    await renderHook().request(async()=>move);
    expect(renderHook().hintMove).toEqual(move); expect(renderHook().pending).toBe(false);
});
it('aborts a pending worker and rejects its late result when the position changes',async()=>{
    let reply!:(value:typeof move)=>void, signal!:AbortSignal;
    const pending=renderHook().request(input=>{signal=input;return new Promise(resolve=>{reply=resolve;});});
    expect(renderHook().pending).toBe(true);
    expect(renderHook('black:1').hintMove).toBeNull(); expect(signal.aborted).toBe(true);
    reply(move); await pending;
    expect(renderHook('black:1').hintMove).toBeNull(); expect(renderHook('black:1').pending).toBe(false);
});
it('closing advice cancels a worker and removes both endpoints',async()=>{
    let reply!:(value:typeof move)=>void;
    const pending=renderHook().request(()=>new Promise(resolve=>{reply=resolve;}));
    renderHook().clear(); reply(move); await pending;
    expect(renderHook().hintMove).toBeNull(); expect(renderHook().pending).toBe(false);
});
it('reports failures and malformed target coordinates instead of displaying partial advice',async()=>{
    await renderHook().request(async()=>{throw new Error('worker failed');}); expect(renderHook().failed).toBe(true);
    await renderHook().request(async()=>({...move,toRow:NaN}));
    expect(renderHook().hintMove).toBeNull(); expect(renderHook().failed).toBe(true);
});

it.each(['before-return','after-return'] as const)('does not revive an aborted pending request when position A is reused (%s)',async timing=>{
    let reply!:(value:typeof move)=>void, signal!:AbortSignal;
    const pending=renderHook('A').request(input=>{signal=input;return new Promise(resolve=>{reply=resolve;});});
    expect(renderHook('A').pending).toBe(true);
    expect(renderHook('B').pending).toBe(false);
    expect(signal.aborted).toBe(true);
    if(timing==='before-return'){reply(move);await pending;}
    expect(renderHook('A').pending).toBe(false);
    if(timing==='after-return'){reply(move);await pending;}
    expect(renderHook('A').pending).toBe(false);
    expect(renderHook('A').hintMove).toBeNull();
});

it.each([
    ['resolve','while-pending'],['reject','while-pending'],
    ['resolve','after-success'],['reject','after-success'],
] as const)('ignores an old %s after key reuse without clearing the newer request (%s)',async(outcome,timing)=>{
    let replyOld!:(value:typeof move)=>void, rejectOld!:(reason:Error)=>void, replyNew!:(value:typeof move)=>void;
    const deliveredOld=vi.fn(), deliveredNew=vi.fn();
    const old=renderHook('A').request(()=>new Promise((resolve,reject)=>{replyOld=resolve;rejectOld=reject;}),deliveredOld);
    renderHook('B');renderHook('A');
    const newer=renderHook('A').request(()=>new Promise(resolve=>{replyNew=resolve;}),deliveredNew);
    const nextMove={...move,toRow:5};
    expect(renderHook('A').pending).toBe(true);
    if(timing==='after-success'){replyNew(nextMove);await newer;}
    if(outcome==='resolve')replyOld(move);else rejectOld(new Error('late failure'));
    await old;
    expect(renderHook('A').pending).toBe(timing==='while-pending');
    expect(renderHook('A').failed).toBe(false);
    expect(renderHook('A').hintMove).toEqual(timing==='after-success'?nextMove:null);
    expect(deliveredOld).not.toHaveBeenCalled();
    if(timing==='while-pending'){replyNew(nextMove);await newer;}
    expect(renderHook('A').pending).toBe(false);
    expect(renderHook('A').hintMove).toEqual(nextMove);
    expect(deliveredNew).toHaveBeenCalledOnce();
});
it.each(['resolve','reject'] as const)('does not update state or deliver after unmount and a late %s',async outcome=>{
    let reply!:(value:typeof move)=>void, reject!:(reason:Error)=>void, signal!:AbortSignal;
    const delivered=vi.fn();
    const pending=renderHook().request(input=>{signal=input;return new Promise((resolve,fail)=>{reply=resolve;reject=fail;});},delivered);
    const writes=hooks.stateWrites;
    hooks.cleanups.forEach(cleanup=>cleanup());
    expect(signal.aborted).toBe(true);
    expect(hooks.stateWrites).toBe(writes);
    if(outcome==='resolve')reply(move);else reject(new Error('late failure'));
    await pending;
    expect(hooks.stateWrites).toBe(writes);
    expect(delivered).not.toHaveBeenCalled();
});
it('preserves successful position-keyed result identity across navigation',async()=>{
    const delivered=vi.fn();
    await renderHook('A').request(async()=>move,delivered);
    expect(renderHook('A').hintMove).toBe(move);
    expect(renderHook('B').hintMove).toBeNull();
    expect(renderHook('A').hintMove).toBe(move);
    expect(renderHook('A').pending).toBe(false);
    expect(delivered).toHaveBeenCalledOnce();
});
